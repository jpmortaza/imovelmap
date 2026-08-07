// ImovelMap — EF `coletar-guarida`
//
// Guarida Imóveis: 21.631 anúncios no sitemap, servidor não bloqueado,
// robots.txt liberado. Segunda maior fonte da base depois da Auxiliadora.
//
// ⭐ POR QUE ELA VALE MAIS QUE O TAMANHO: a Guarida publica `logradouro`
//    com RUA **E NÚMERO** ("Gardino Vargas, 132"). A Rede Gaúcha só dá o
//    nome da rua, e a planilha da Auxiliadora não tem CEP — o que deixava
//    o cruzamento entre bases dependendo só de geo+área, que é impreciso.
//    Com o número, `agrupar_duplicatas` volta a ter seu critério forte.
//
// Estrutura: Next.js Pages Router, dados em `__NEXT_DATA__` →
// props.pageProps.imovel. Nada de RSC aqui (diferente da Rede Gaúcha).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITEMAP = "https://storage.googleapis.com/sitemap-guarida/sitemap.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FONTE = "guarida.com.br";
const PAUSA_MS = 400;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "R$ 425.000" → 425000 ; "R$ 0" → null (zero ali significa "não informado") */
function moeda(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Gardino Vargas, 132" → { rua, numero } */
function separaLogradouro(l: unknown) {
  const s = String(l ?? "").trim();
  const m = s.match(/^(.*?),\s*(\d+[A-Za-z]?)\s*$/);
  return m ? { rua: m[1].trim(), numero: m[2] } : { rua: s || null, numero: null };
}

/** "Rua X, 132 - Santo Antônio - Campo Bom - RS" → bairro e cidade */
function bairroCidade(endereco: unknown) {
  const partes = String(endereco ?? "").split(" - ").map((p) => p.trim());
  // ultimo e UF, penultimo cidade, antepenultimo bairro
  const uf = partes.length >= 2 ? partes[partes.length - 1] : null;
  const cidade = partes.length >= 3 ? partes[partes.length - 2] : null;
  const bairro = partes.length >= 4 ? partes[partes.length - 3] : null;
  return { bairro, cidade, uf: uf && uf.length === 2 ? uf : null };
}

function extrair(html: string, url: string): Record<string, unknown> | null {
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;

  let im: Record<string, any>;
  try {
    im = JSON.parse(m[1])?.props?.pageProps?.imovel;
  } catch {
    return null;
  }
  if (!im?.codigo) return null;

  const prop = (slug: string) => {
    const p = (im.propriedades ?? []).find((x: any) => x?.slug === slug);
    return p?.valor ?? null;
  };

  const { rua, numero } = separaLogradouro(im.logradouro);
  const { bairro, cidade, uf } = bairroCidade(im.endereco);

  const fotos = (im.fotos ?? [])
    .slice()
    .sort((a: any, b: any) => (a?.ordem ?? 0) - (b?.ordem ?? 0))
    .map((f: any) => f?.url)
    .filter((u: unknown): u is string => typeof u === "string")
    .slice(0, 30);

  const negocio = String(im.negocio ?? "").toLowerCase();

  return {
    id: String(im.codigo),
    source: FONTE,
    url: im.url ?? url,
    title: im.titulo ?? null,
    transactionType: negocio.includes("alug") || negocio.includes("loca") ? "rent" : "sale",
    propertyType: im.tipo?.nome ?? null,
    price: moeda(im.valores?.valor),
    condominiumFee: moeda(im.valores?.condominio),
    iptu: moeda(im.valores?.iptu),
    area: prop("area"),
    bedrooms: prop("dormitorios"),
    bathrooms: prop("banheiro"),
    parkingSpaces: prop("vaga"),
    // ⭐ rua E numero — o que destrava o cruzamento com as outras bases
    endereco: rua,
    enderecoNumero: numero,
    neighborhood: bairro,
    city: cidade,
    state: uf,
    latitude: im.latitude ?? null,
    longitude: im.longitude ?? null,
    images: fotos,
    imageCount: fotos.length,
    anunciante: "Guarida Imóveis",
    tipoAnunciante: "imobiliaria",
    scrapedAt: new Date().toISOString(),
  };
}

async function urlsDoSitemap(): Promise<string[]> {
  try {
    const r = await fetch(SITEMAP, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
      .map((m) => m[1])
      .filter((u) => u.includes("/imovel/"));
  } catch {
    return [];
  }
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

  let corretorId: string | null = null;
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    const { data } = await svc.auth.getUser(token);
    if (!data?.user) return json({ error: "token invalido" }, 401);
    corretorId = data.user.id;
  }

  const url = new URL(req.url);
  let inicio = Number(url.searchParams.get("inicio") ?? 0);
  let limite = Number(url.searchParams.get("limite") ?? 60);
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    inicio = Number(b.inicio ?? inicio);
    limite = Number(b.limite ?? limite);
  }
  limite = Math.max(1, Math.min(120, limite));

  const t0 = Date.now();
  const todas = await urlsDoSitemap();
  if (!todas.length) return json({ ok: false, erro: "sitemap vazio" }, 502);

  // dobra no fim: o sitemap encolhe conforme imoveis saem do ar
  const inicioReal = inicio % todas.length;
  const fatia = todas.slice(inicioReal, inicioReal + limite);

  const itens: Record<string, unknown>[] = [];
  let semDados = 0;
  for (const u of fatia) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25_000) });
      if (!r.ok) { semDados++; continue; }
      const p = extrair(await r.text(), u);
      if (p) itens.push(p); else semDados++;
    } catch {
      semDados++;
    }
    await dormir(PAUSA_MS);
  }

  let resumo: Record<string, unknown> = { novos: 0, atualizados: 0, erros: 0 };
  if (itens.length) {
    const { data, error } = await svc.rpc("ingerir_lote", {
      p_itens: itens, p_corretor: corretorId, p_portal: FONTE, p_modo: "varredura",
    });
    if (error) return json({ ok: false, erro: `ingerir_lote: ${error.message}` }, 500);
    resumo = data as Record<string, unknown>;
  }

  const duracao = Date.now() - t0;
  await svc.from("extracoes").insert({
    corretor_id: corretorId,
    origem: "cron",
    status: itens.length || fatia.length === 0 ? "ok" : "error",
    started_at: new Date(t0).toISOString(),
    finished_at: new Date().toISOString(),
    duracao_ms: duracao,
    total_encontrados: fatia.length,
    total_novos: Number(resumo.novos ?? 0),
    total_atualizados: Number(resumo.atualizados ?? 0),
    total_erros: semDados,
    meta: { portal: FONTE, inicio, inicioReal, limite, totalNoSitemap: todas.length },
  });

  return json({
    ok: true,
    totalNoSitemap: todas.length,
    fatia: { inicio, inicioReal, limite, visitados: fatia.length },
    extraidos: itens.length,
    semDados,
    ...resumo,
    duracaoMs: duracao,
  });
});
