// ImovelMap — EF `resolver-endereco` (Fase 8)
//
// O anúncio esconde o endereço mas vaza lat/lng aproximado, área e fotos.
// Isso basta — se você tiver o cadastro da cidade do lado.
//
//   1. CERCO GEOGRÁFICO ── Overpass: prédios num raio de 150 m → ~40 candidatos
//   2. FILTRO CADASTRAL ── IPTU local: quais têm unidade com aquela área,
//      ★ o passo genial    naquele pavimento → 1 a 3
//
// ★ Efeito de rede: todo prédio consultado fica em `publico.osm_predios`.
//   O próximo anúncio daquele quarteirão resolve sem chamar nada externo —
//   quanto mais roda, menos API usa.
//
// Hoje o passo 2 devolve vazio (o IPTU é a Fase 7) e o funil fecha no passo 1.
// Quando a carga chegar, ele liga sozinho e a confiança sobe de ~70 para 95.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Espelhos: o overpass-api.de principal vive sobrecarregado (504) e de IP de
// datacenter chega a devolver 406, então precisamos de alternativa.
//
// ⚠️ Só espelhos com o planeta inteiro. `overpass.osm.ch` foi testado e
// descartado: ele indexa só a Suíça e responde HTTP 200 com `elements: []`
// para Porto Alegre — sucesso aparente com dado vazio, que é pior que erro.
// Por isso resposta sem nenhum prédio conta como falha e vai pro próximo.
const ESPELHOS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const RAIO_M = 150;
const CONFIANCA_MINIMA = 60; // abaixo disso não grava, só sugere

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** bbox de ~raio metros em torno do ponto */
function bbox(lat: number, lon: number, raio: number) {
  const dLat = raio / 111_320;
  const dLon = raio / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((n) => n.toFixed(6));
}

async function buscarOverpass(lat: number, lon: number) {
  const [s, w, n, e] = bbox(lat, lon, RAIO_M * 1.5);
  const q = `[out:json][timeout:45];
(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););
out tags center;`;

  const erros: string[] = [];

  for (const espelho of ESPELHOS) {
    try {
      const r = await fetch(espelho, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // a política de uso do Overpass pede identificação
          "User-Agent": "ImovelMap/0.1 (+https://imovelmap.com)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(45_000),
      });

      if (!r.ok) {
        const corpo = (await r.text().catch(() => "")).slice(0, 200);
        erros.push(`${new URL(espelho).hostname}: HTTP ${r.status} ${corpo}`);
        continue;
      }

      const d = await r.json();
      const els = (d.elements ?? []).filter(
        (x: Record<string, unknown>) => x.center && x.id
      );

      // 200 com zero prédios = espelho sem cobertura da região.
      // Numa cidade isso nunca é resposta legítima: tenta o próximo.
      if (els.length === 0) {
        erros.push(`${new URL(espelho).hostname}: 200 mas sem prédios (sem cobertura?)`);
        continue;
      }

      return { predios: els, espelho: new URL(espelho).hostname, erros };
    } catch (e) {
      erros.push(`${new URL(espelho).hostname}: ${(e as Error).message}`);
    }
  }

  throw new Error(erros.join(" | "));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "sem token de corretor" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: userData, error: authErr } = await svc.auth.getUser(token);
  const user = userData?.user;
  if (authErr || !user) return json({ error: "token invalido ou expirado" }, 401);

  const { data: corretor } = await svc
    .from("corretores")
    .select("id, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!corretor || corretor.ativo === false) {
    return json({ error: "corretor inativo" }, 403);
  }

  const url = new URL(req.url);
  let imovelId = url.searchParams.get("imovelId");
  let forcar = url.searchParams.get("forcar") === "1";
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    imovelId = b.imovelId ?? imovelId;
    forcar = b.forcar ?? forcar;
  }
  if (!imovelId) return json({ error: "informe imovelId" }, 400);

  const { data: imovel } = await svc
    .from("imoveis")
    .select("id, latitude, longitude, area, endereco, endereco_numero, endereco_confianca")
    .eq("id", imovelId)
    .maybeSingle();

  if (!imovel) return json({ error: "imovel nao encontrado" }, 404);
  if (imovel.latitude == null || imovel.longitude == null) {
    return json({ ok: true, resolvido: false, motivo: "anuncio sem coordenada" });
  }
  if (imovel.endereco && (imovel.endereco_confianca ?? 0) >= 90 && !forcar) {
    return json({
      ok: true,
      resolvido: true,
      jaResolvido: true,
      endereco: imovel.endereco,
      numero: imovel.endereco_numero,
      confianca: imovel.endereco_confianca,
    });
  }

  // ---------------------------------------------- passo 1: cerco geográfico
  let { data: candidatos, error: candErr } = await svc.rpc("candidatos_endereco", {
    p_imovel_id: imovelId,
    p_raio: RAIO_M,
  });
  if (candErr) return json({ ok: false, motivo: `candidatos_endereco: ${candErr.message}` });

  let doCache = true;
  let espelhoUsado: string | null = null;
  let cacheados = 0;
  if (!candidatos || candidatos.length === 0) {
    // primeiro anúncio deste quarteirão: paga a chamada ao Overpass uma vez
    doCache = false;
    try {
      const { predios, espelho } = await buscarOverpass(
        imovel.latitude,
        imovel.longitude
      );
      espelhoUsado = espelho;
      if (predios.length) {
        // conferir o erro do rpc não é zelo: foi exatamente o que escondeu
        // o `cachear_predios` no schema errado devolvendo 404 em silêncio
        const { data: gravados, error: cacheErr } = await svc.rpc("cachear_predios", {
          p_predios: predios,
        });
        if (cacheErr) {
          return json({
            ok: false,
            resolvido: false,
            motivo: `cachear_predios falhou: ${cacheErr.message}`,
            predios_recebidos: predios.length,
            espelho,
          });
        }
        cacheados = Number(gravados ?? 0);
      }
    } catch (e) {
      return json({
        ok: false,
        resolvido: false,
        motivo: `overpass falhou: ${(e as Error).message}`,
      });
    }
    const r2 = await svc.rpc("candidatos_endereco", {
      p_imovel_id: imovelId,
      p_raio: RAIO_M,
    });
    candidatos = r2.data ?? [];
  }

  // ---------------------------------------------- passo 2: filtro cadastral
  const { data: iptu, error: iptuErr } = await svc.rpc("filtrar_por_iptu", {
    p_imovel_id: imovelId,
    p_raio: RAIO_M,
  });
  if (iptuErr) console.error("filtrar_por_iptu:", iptuErr.message);

  // ------------------------------------------------------------ decisão
  let escolhido: Record<string, unknown> | null = null;
  let confianca = 0;
  let metodo = "";
  let inscricao: string | null = null;
  let venal: number | null = null;

  if (iptu && iptu.length === 1) {
    // ★ o caso que fecha o funil: uma única unidade com aquela área no raio
    const u = iptu[0];
    escolhido = { logradouro: u.logradouro, numero: u.numero };
    confianca = 95;
    metodo = "cadastro";
    inscricao = u.inscricao_imobiliaria;
    venal = u.valor_venal;
  } else if (iptu && iptu.length > 1 && iptu.length <= 3) {
    const u = iptu[0];
    escolhido = { logradouro: u.logradouro, numero: u.numero };
    confianca = 75;
    metodo = "cadastro-ambiguo";
    inscricao = u.inscricao_imobiliaria;
    venal = u.valor_venal;
  } else {
    // sem IPTU: o melhor prédio do OSM que tenha endereço completo
    const comEndereco = (candidatos ?? []).filter(
      (c: Record<string, unknown>) => c.addr_street && c.addr_housenumber
    );
    if (comEndereco.length) {
      const c = comEndereco[0];
      escolhido = { logradouro: c.addr_street, numero: c.addr_housenumber };
      // longe do ponto = menos confiança; o portal ofusca a coordenada de propósito
      const d = Number(c.distancia_m ?? 999);
      confianca = d <= 30 ? 72 : d <= 80 ? 62 : 50;
      metodo = "osm";
    }
  }

  let gravado = false;
  if (escolhido && confianca >= CONFIANCA_MINIMA) {
    const { data: ok } = await svc.rpc("aplicar_endereco", {
      p_imovel_id: imovelId,
      p_logradouro: escolhido.logradouro,
      p_numero: escolhido.numero,
      p_confianca: confianca,
      p_metodo: metodo,
      p_inscricao: inscricao,
      p_venal: venal,
    });
    gravado = Boolean(ok);
  }

  return json({
    ok: true,
    resolvido: Boolean(escolhido) && confianca >= CONFIANCA_MINIMA,
    gravado,
    endereco: escolhido?.logradouro ?? null,
    numero: escolhido?.numero ?? null,
    confianca,
    metodo,
    inscricaoImobiliaria: inscricao,
    valorVenal: venal,
    passo1: {
      fonte: doCache ? "cache" : `overpass:${espelhoUsado ?? "?"}`,
      prediosCacheados: cacheados,
      candidatos: (candidatos ?? []).length,
      comEnderecoCompleto: (candidatos ?? []).filter(
        (c: Record<string, unknown>) => c.addr_street && c.addr_housenumber
      ).length,
      // condomínios do raio: entrada do passo 4 (CNPJ do condomínio)
      condominios: (candidatos ?? [])
        .filter((c: Record<string, unknown>) => c.nome)
        .slice(0, 8)
        .map((c: Record<string, unknown>) => ({
          nome: c.nome,
          rua: c.addr_street,
          numero: c.addr_housenumber,
          distancia: c.distancia_m,
        })),
      top: (candidatos ?? []).slice(0, 5),
    },
    passo2: {
      disponivel: (iptu ?? []).length > 0,
      candidatos: (iptu ?? []).length,
      nota:
        (iptu ?? []).length === 0
          ? "IPTU ainda não carregado (Fase 7) — funil fechou só com o passo 1"
          : null,
    },
  });
});
