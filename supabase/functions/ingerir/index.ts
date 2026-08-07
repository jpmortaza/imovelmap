// ImovelMap — EF `ingerir` (Fase 3)
//
// Recebe lotes de imoveis capturados pela extensao no Chrome do corretor.
// A autenticacao e o JWT do proprio corretor (handoff da sessao do site),
// entao cada captura fica atribuida a uma pessoa real — sem chave secreta
// dentro da extensao, que e codigo que o usuario consegue abrir e ler.
//
// O trabalho pesado esta na RPC `ingerir_lote`: um round-trip por lote, com
// bloco de excecao por item. Aqui so fazemos porteiro e normalizacao de chave.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_ITENS = 200;
const MAX_IMAGENS = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** primeiro valor nao-vazio entre varios apelidos possiveis da mesma chave */
function pega(o: Record<string, unknown>, ...chaves: string[]): unknown {
  for (const k of chaves) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function texto(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, max);
}

/**
 * Converte o que o descriptor da extensao produziu para o ImovelPayload
 * canonico (lib/scrapers/types.ts). Nao faz coercao de tipo: `j_num`/`j_int`
 * no banco ja entendem "R$ 4.500,00" e "88,5" e devolvem null no que nao der.
 * Aqui so resolvemos nome de chave e cortamos tamanho.
 */
function normalizar(bruto: unknown): Record<string, unknown> | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const o = bruto as Record<string, unknown>;

  const source = texto(pega(o, "source", "portal", "site"), 60);
  const id = texto(pega(o, "id", "externalId", "external_id", "listingId"), 200);
  const url = texto(pega(o, "url", "sourceUrl", "source_url", "link"), 1000);

  // sem source+id o upsert nao tem como casar a linha
  if (!source || !id) return null;

  let imagens: string[] = [];
  const imgs = pega(o, "images", "imagens", "fotos");
  if (Array.isArray(imgs)) {
    imagens = [
      ...new Set(
        imgs
          .map((i) =>
            typeof i === "string"
              ? i
              : texto((i as Record<string, unknown>)?.url ?? null, 1000)
          )
          .filter((i): i is string => typeof i === "string" && i.startsWith("http"))
      ),
    ].slice(0, MAX_IMAGENS);
  }

  return {
    id,
    source,
    url: url ?? "",
    title: texto(pega(o, "title", "titulo", "name")),
    transactionType: texto(pega(o, "transactionType", "transaction_type", "tipoNegocio"), 40),
    propertyType: texto(pega(o, "propertyType", "property_type", "tipoImovel"), 60),
    propertySubType: texto(pega(o, "propertySubType", "property_sub_type"), 60),
    price: pega(o, "price", "preco", "valor"),
    priceFormatted: texto(pega(o, "priceFormatted", "price_formatted", "precoFormatado"), 60),
    condominiumFee: pega(o, "condominiumFee", "condominium_fee", "condominio"),
    iptu: pega(o, "iptu"),
    pricePerSqm: pega(o, "pricePerSqm", "price_per_sqm"),
    area: pega(o, "area", "areaUtil", "usableArea"),
    bedrooms: pega(o, "bedrooms", "quartos", "dormitorios"),
    bathrooms: pega(o, "bathrooms", "banheiros"),
    parkingSpaces: pega(o, "parkingSpaces", "parking_spaces", "vagas"),
    endereco: texto(pega(o, "endereco", "address", "street", "logradouro"), 300),
    enderecoNumero: texto(pega(o, "enderecoNumero", "endereco_numero", "numero", "streetNumber"), 30),
    complemento: texto(pega(o, "complemento", "unidade", "unit"), 100),
    cep: texto(pega(o, "cep", "zipcode", "postalCode"), 20),
    latitude: pega(o, "latitude", "lat"),
    longitude: pega(o, "longitude", "lng", "lon"),
    neighborhood: texto(pega(o, "neighborhood", "bairro"), 120),
    city: texto(pega(o, "city", "cidade"), 120),
    state: texto(pega(o, "state", "estado", "uf"), 40),
    images: imagens,
    imageCount: pega(o, "imageCount", "image_count") ?? imagens.length,
    publishedAt: texto(pega(o, "publishedAt", "published_at", "publicadoEm"), 60),
    scrapedAt: texto(pega(o, "scrapedAt", "scraped_at"), 60) ?? new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "metodo nao permitido" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "sem token de corretor" }, 401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // quem esta mandando
  const { data: userData, error: authErr } = await svc.auth.getUser(token);
  const user = userData?.user;
  if (authErr || !user) return json({ error: "token invalido ou expirado" }, 401);

  const { data: corretor } = await svc
    .from("corretores")
    .select("id, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!corretor) return json({ error: "usuario nao e corretor" }, 403);
  if (corretor.ativo === false) return json({ error: "corretor inativo" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "json invalido" }, 400);
  }

  const brutos = body?.items ?? body?.itens;
  if (!Array.isArray(brutos)) {
    return json({ error: "body precisa de items[]" }, 400);
  }
  if (brutos.length > MAX_ITENS) {
    return json({ error: `maximo ${MAX_ITENS} itens por lote` }, 413);
  }

  const portal = texto(body?.portal, 80);
  const modo = texto(body?.modo, 20) ?? "passivo";

  // normaliza fora do banco; o que nao tem source+id nem chega la
  const itens: Record<string, unknown>[] = [];
  let descartados = 0;
  for (const bruto of brutos) {
    const p = normalizar(bruto);
    if (p) itens.push(p);
    else descartados++;
  }

  if (itens.length === 0) {
    return json({
      ok: true,
      total: brutos.length,
      novos: 0,
      atualizados: 0,
      erros: 0,
      descartados,
      resultados: [],
    });
  }

  const inicio = Date.now();
  const { data: resumo, error: rpcErr } = await svc.rpc("ingerir_lote", {
    p_itens: itens,
    p_corretor: user.id,
    p_portal: portal,
    p_modo: modo,
  });
  const duracao = Date.now() - inicio;

  if (rpcErr) {
    console.error("ingerir_lote falhou:", rpcErr.message);
    return json({ error: rpcErr.message }, 500);
  }

  const r = resumo as {
    total: number;
    novos: number;
    atualizados: number;
    erros: number;
    resultados: unknown[];
  };

  // deixa rastro no painel admin (mesma tela das extracoes por cron)
  await svc.from("extracoes").insert({
    corretor_id: user.id,
    origem: "extensao",
    status: r.novos + r.atualizados > 0 ? "ok" : "error",
    started_at: new Date(inicio).toISOString(),
    finished_at: new Date().toISOString(),
    duracao_ms: duracao,
    total_encontrados: brutos.length,
    total_novos: r.novos,
    total_atualizados: r.atualizados,
    total_erros: r.erros + descartados,
    meta: { portal, modo, descartados },
  });

  return json({ ok: true, ...r, descartados, duracaoMs: duracao });
});
