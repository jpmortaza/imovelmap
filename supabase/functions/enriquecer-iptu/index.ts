// ImovelMap — EF `enriquecer-iptu`
//
// ⭐ O ATALHO QUE MUDA A FASE 7.
//
// O plano previa baixar o CSV de 225 MB do IPTU 2026 e carregar por psql —
// o que travou o projeto porque exige senha do banco. Descobri que
// `dadosabertos.poa.br` roda **CKAN com datastore ativo**: os 876.298
// registros do IPTU 2026 são consultáveis por SQL via API, de graça e sem
// chave. Nada para baixar, nada para carregar.
//
// O que isso entrega, por endereço+número:
//   · a lista de UNIDADES do prédio, com pavimento e área construída
//   · o VALOR VENAL de cada uma
//   · setor/quarteirão/lote → a INSCRIÇÃO IMOBILIÁRIA, que é a chave da
//     matrícula no cartório — o único documento que dá nome e CPF do dono
//
// ⚠️ Cuidado de dado: a área do IPTU é CONSTRUÍDA TOTAL e costuma ser maior
//    que a "área privativa" do anúncio (inclui parede e parte comum). Casar
//    por igualdade não funciona; usamos janela e registramos a confiança.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CKAN = "https://dadosabertos.poa.br/api/3/action/datastore_search_sql";
const RECURSO_IPTU_2026 = "1129ea5b-bf51-4102-a115-756343e86d27";
const UA = "ImovelMap/0.1 (+https://imovelmap.com)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/** tira acento, artigo e tipo de via — "Avenida da Cavalhada" ~ "AV CAVALHADA" */
function nucleoDaRua(s: string) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/^(RUA|R\.|AVENIDA|AV\.?|TRAVESSA|TV\.?|PRACA|PRAÇA|ESTRADA|ROD(OVIA)?|BECO|LARGO)\s+/i, "")
    .replace(/\b(DA|DE|DO|DAS|DOS|E)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function consultarIptu(rua: string, numero: string) {
  const nucleo = nucleoDaRua(rua).replace(/'/g, "''");
  const num = String(numero).replace(/[^\d A-Za-z]/g, "").replace(/'/g, "''");
  if (!nucleo || !num) return [];

  const sql = `
    SELECT "NME_ENDLOC_LOGRADOURO","NUM_ENDLOC_ENDERECO","NUM_ENDLOC_UNIDADE",
           "PAVIMENTO","MTR_AREA_CONSTRUIDA_TOTAL","VLR_VENAL_IMOVEL",
           "NUM_SETOR","NUM_QUARTEIRAO","NUM_LOTE","NME_ENDLOC_CEP",
           "DES_USO","NME_ENDLOC_BAIRRO_CDL"
    FROM "${RECURSO_IPTU_2026}"
    WHERE "NME_ENDLOC_LOGRADOURO" ILIKE '%${nucleo}%'
      AND "NUM_ENDLOC_ENDERECO" = '${num}'
    LIMIT 400`;

  const r = await fetch(`${CKAN}?sql=${encodeURIComponent(sql)}`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) return [];
  const d = await r.json();
  return d?.success ? (d.result?.records ?? []) : [];
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** setor.quarteirão.lote.unidade — o que o cartório pede */
function inscricao(r: Record<string, unknown>) {
  const p = [r.NUM_SETOR, r.NUM_QUARTEIRAO, r.NUM_LOTE, r.NUM_ENDLOC_UNIDADE]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return p.length >= 3 ? p.join(".") : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "sem token" }, 401);
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    const { data } = await svc.auth.getUser(token);
    if (!data?.user) return json({ error: "token invalido" }, 401);
  }

  const b = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const url = new URL(req.url);
  const imovelId = b.imovelId ?? url.searchParams.get("imovelId");
  const lote = Math.max(1, Math.min(40, Number(b.lote ?? url.searchParams.get("lote") ?? 20)));

  // alvos: em POA, com rua e número, ainda sem valor venal
  let q = svc
    .from("imoveis")
    .select("id, endereco, endereco_numero, area, city")
    .not("endereco", "is", null)
    .not("endereco_numero", "is", null)
    .is("valor_venal", null)
    .ilike("city", "%porto alegre%")
    .limit(lote);
  if (imovelId) q = svc.from("imoveis").select("id, endereco, endereco_numero, area, city").eq("id", imovelId);

  const { data: alvos, error } = await q;
  if (error) return json({ ok: false, erro: error.message }, 500);
  if (!alvos?.length) return json({ ok: true, processados: 0, nota: "nada pendente" });

  const t0 = Date.now();
  let casados = 0, semIptu = 0, semUnidade = 0;
  const amostra: unknown[] = [];

  for (const im of alvos) {
    const regs = await consultarIptu(im.endereco!, im.endereco_numero!);
    if (!regs.length) { semIptu++; continue; }

    const areaAnuncio = num(im.area);

    // Descarta box de garagem e depósito: num prédio de 400 unidades a
    // maioria dos registros e vaga, e casar o anuncio com uma delas grava
    // a inscricao ERRADA — o corretor pagaria a matricula de uma garagem.
    const moradias = regs.filter((r: any) => {
      const a = num(r.MTR_AREA_CONSTRUIDA_TOTAL) ?? 0;
      const uso = String(r.DES_USO ?? "").toUpperCase();
      if (a < 25) return false;
      return !/GARAGEM|BOX|DEPOSITO|DEPÓSITO|ESTACIONAMENTO/.test(uso);
    });

    let escolhido: any = null;
    let confianca = 0;
    let metodo = "";

    if (areaAnuncio && moradias.length) {
      const comDist = moradias
        .map((r: any) => {
          const a = num(r.MTR_AREA_CONSTRUIDA_TOTAL);
          return a ? { r, d: Math.abs(a - areaAnuncio) / areaAnuncio } : null;
        })
        .filter(Boolean)
        .sort((x: any, y: any) => x.d - y.d) as { r: any; d: number }[];

      if (comDist.length) {
        const melhor = comDist[0];
        const segundo = comDist[1];
        // so cravamos a unidade se ela for claramente melhor que a seguinte
        const distinta = !segundo || segundo.d - melhor.d > 0.03;
        if (melhor.d <= 0.30 && distinta) {
          escolhido = melhor.r;
          confianca = melhor.d <= 0.10 ? 88 : melhor.d <= 0.20 ? 72 : 60;
          metodo = "iptu-unidade";
        }
      }
    }

    // Nao identificou a unidade: gravamos SO o que vale para o predio
    // inteiro — o lote, sem unidade. Valor venal fica NULL porque ele e
    // por unidade: preencher com o de outra seria inventar numero.
    if (!escolhido) {
      const base = moradias[0] ?? regs[0];
      const lote = [base.NUM_SETOR, base.NUM_QUARTEIRAO, base.NUM_LOTE]
        .map((x: unknown) => String(x ?? "").trim()).filter(Boolean);
      if (lote.length >= 3) {
        await svc.rpc("aplicar_endereco", {
          p_imovel_id: im.id,
          p_logradouro: null, p_numero: null,
          p_confianca: 35, p_metodo: "iptu-lote",
          p_inscricao: lote.join(".") + " (lote — unidade não identificada)",
          p_venal: null,
        });
        semUnidade++;
      } else {
        semIptu++;
      }
      continue;
    }

    const venal = num(escolhido.VLR_VENAL_IMOVEL);
    const insc = inscricao(escolhido);

    const { error: errUp } = await svc.rpc("aplicar_endereco", {
      p_imovel_id: im.id,
      p_logradouro: null,
      p_numero: null,
      p_confianca: confianca,
      p_metodo: metodo,
      p_inscricao: insc,
      p_venal: venal,
    });
    if (!errUp) {
      casados++;
      if (amostra.length < 5) {
        amostra.push({
          endereco: `${im.endereco}, ${im.endereco_numero}`,
          unidadesNoPredio: regs.length,
          moradias: regs.filter((r: any) => (num(r.MTR_AREA_CONSTRUIDA_TOTAL) ?? 0) >= 25).length,
          unidade: escolhido.NUM_ENDLOC_UNIDADE,
          pavimento: escolhido.PAVIMENTO,
          areaAnuncio: areaAnuncio,
          areaIptu: escolhido.MTR_AREA_CONSTRUIDA_TOTAL,
          valorVenal: venal,
          inscricao: insc,
          confianca,
          metodo,
        });
      }
    }
  }

  return json({
    ok: true,
    processados: alvos.length,
    casados,
    semUnidade,
    semIptu,
    duracaoMs: Date.now() - t0,
    amostra,
  });
});
