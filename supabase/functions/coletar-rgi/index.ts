// ImovelMap — EF `coletar-rgi` (Fase 11)
//
// Rede Gaúcha de Imóveis, o portal principal do Jean.
//
// ⭐ Este portal NÃO bloqueia IP de datacenter — testado: HTTP 200 da Vercel,
//    do Supabase e daqui. Então ele não precisa de extensão, de navegador,
//    nem de máquina ligada. Roda no `pg_cron`, sozinho, para sempre.
//
// Ainda melhor: o site publica `sitemap-imoveis.xml` com o catálogo inteiro
// (~19.900 imóveis). Não precisamos varrer página de busca — pegamos a lista
// pronta e visitamos anúncio a anúncio, no ritmo que quisermos.
//
// De onde sai o dado: o site é Next.js App Router, então o conteúdo chega em
// chunks `self.__next_f.push([1,"..."])` (React Server Components) e NÃO em
// `__NEXT_DATA__` nem numa tag `<script type="application/ld+json">` comum.
// Remontamos esses chunks e lemos o bloco schema.org de dentro — que traz
// **o endereço de rua**, CEP e coordenada exata. De graça.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.redegauchadeimoveis.com.br";
const SITEMAPS = [`${BASE}/sitemap-imoveis.xml`, `${BASE}/sitemap-imoveis-2.xml`];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// robots.txt permite tudo menos /admin /login /search etc. Mesmo assim vamos
// devagar: é um parceiro do negócio, não um alvo.
const PAUSA_MS = 700;
const LOTE_PADRAO = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TIPOS = new Set([
  "realestatelisting", "product", "house", "apartment",
  "singlefamilyresidence", "residence", "place", "accommodation",
]);

/** Remonta o payload RSC e devolve o bloco schema.org do imóvel. */
function extrair(html: string, url: string): Record<string, unknown> | null {
  const partes = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g)].map((m) => m[1]);
  if (!partes.length) return null;

  const flight = partes
    .map((p) => {
      try {
        return JSON.parse('"' + p + '"');
      } catch {
        return p.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
      }
    })
    .join("");

  const contato = extrairAnunciante(flight);

  let melhor: Record<string, unknown> | null = null;
  let i = -1;
  while ((i = flight.indexOf('{"@context":"https://schema.org"', i + 1)) >= 0) {
    // percorre respeitando string e escape, senão uma chave com "}" quebra tudo
    let d = 0, j = i, emStr = false, esc = false;
    for (; j < flight.length; j++) {
      const c = flight[j];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { emStr = !emStr; continue; }
      if (emStr) continue;
      if (c === "{") d++;
      else if (c === "}" && --d === 0) break;
    }
    try {
      const o = JSON.parse(flight.slice(i, j + 1));
      // @type vem como ARRAY: ["RealEstateListing","SingleFamilyResidence"]
      const tipos = ([] as unknown[]).concat(o["@type"] ?? []).map((x) => String(x).toLowerCase());
      if (tipos.some((t) => TIPOS.has(t)) && (o.offers || o.address || o.geo)) melhor = o;
    } catch { /* bloco não-JSON: segue */ }
  }
  if (!melhor) return null;

  const m = melhor as Record<string, any>;
  const off = m.offers ?? {};
  const addr = m.address ?? {};
  const geo = m.geo ?? {};
  const code = (url.match(/\/([\w-]+)\/?$/) ?? [])[1];
  if (!code) return null;

  const nome = String(m.name ?? "");
  const imgs = ([] as unknown[]).concat(m.image ?? []).filter((x) => typeof x === "string") as string[];

  return {
    id: code,
    source: "redegauchadeimoveis.com.br",
    url: off.url ?? m.url ?? url,
    title: m.name ?? null,
    transactionType: /alug|loca[çc]/i.test(nome) ? "rent" : "sale",
    propertyType: ([] as unknown[]).concat(m["@type"] ?? []).filter((t) => t !== "RealEstateListing")[0] ?? null,
    price: off.price ?? off.lowPrice ?? null,
    area: m.floorSize?.value ?? null,
    bedrooms: m.numberOfBedrooms ?? null,
    bathrooms: m.numberOfBathroomsTotal ?? null,
    // ⭐ o endereço que o produto existe para descobrir vem pronto aqui
    endereco: addr.streetAddress ?? null,
    cep: addr.postalCode ?? null,
    city: addr.addressLocality ?? null,
    state: addr.addressRegion ?? null,
    latitude: geo.latitude ?? null,
    longitude: geo.longitude ?? null,
    images: imgs.slice(0, 30),
    imageCount: imgs.length,
    scrapedAt: new Date().toISOString(),
    ...contato,
  };
}


/**
 * Quem está anunciando, e por qual telefone.
 *
 * ⚠️ NÃO tente detectar FSBO aqui. A primeira versão usava "sem CRECI = é o
 *    dono" e marcou 797 anúncios como proprietário — TODOS eram imobiliária
 *    (AC Clipes, UP Imóveis, Ferreira...) cujo CRECI simplesmente não estava
 *    no HTML. A regra é inválida por construção: a Rede Gaúcha é uma REDE DE
 *    IMOBILIÁRIAS, todo anúncio tem uma atrás. Dono nenhum anuncia aqui.
 *    Detecção de FSBO faz sentido na OLX e nos portais genéricos, onde
 *    particular publica de verdade — não neste.
 */
// Telefone do PORTAL, não do anunciante: aparece em todo anúncio e polui.
// Vem do bloco `agencies[]` (a rede em si), não da imobiliária do imóvel.
const FONES_DO_PORTAL = new Set(["5551997754373"]);

function extrairAnunciante(flight: string) {
  const fones = new Set<string>();
  let whatsapp: string | null = null;

  for (const m of flight.matchAll(/"rawPhone":"(\+?[\d\s()-]{10,20})"/g)) {
    const so = m[1].replace(/\D/g, "");
    if (so.length >= 10 && so.length <= 13 && !FONES_DO_PORTAL.has(so)) fones.add(so);
  }
  for (const w of flight.matchAll(/api\.whatsapp\.com\/send\?phone=(\d{10,13})/g)) {
    if (!FONES_DO_PORTAL.has(w[1])) { whatsapp = w[1]; break; }
  }

  const creci = (flight.match(/"creci":"([\w.-]{3,20})"/) ?? [])[1] ?? null;

  // nome do anunciante: o `agencies[]` é a rede; o do anúncio vem antes do creci
  let anunciante: string | null = null;
  const iCreci = flight.indexOf('"creci"');
  if (iCreci > 0) {
    const antes = flight.slice(Math.max(0, iCreci - 4000), iCreci);
    const nomes = [...antes.matchAll(/"name":"([^"]{3,80})"/g)].map((x) => x[1]);
    anunciante = nomes.length ? nomes[nomes.length - 1] : null;
  }

  return {
    telefones: [...fones],
    whatsapp,
    anuncianteCreci: creci,
    anunciante,
    // portal de rede: sempre imobiliária. Ver o aviso acima.
    tipoAnunciante: anunciante || creci ? "imobiliaria" : "desconhecido",
  };
}

async function urlsDoSitemap(): Promise<string[]> {
  const todas: string[] = [];
  for (const sm of SITEMAPS) {
    try {
      const r = await fetch(sm, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) continue;
      const xml = await r.text();
      for (const m of xml.matchAll(/<loc>(.*?)<\/loc>/g)) todas.push(m[1]);
    } catch { /* espelho fora: segue */ }
  }
  return todas;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Aceita JWT de corretor OU a chave de serviço (para o pg_cron chamar).
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "sem token" }, 401);

  let corretorId: string | null = null;
  const ehServico = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!ehServico) {
    const { data } = await svc.auth.getUser(token);
    if (!data?.user) return json({ error: "token invalido" }, 401);
    corretorId = data.user.id;
  }

  const url = new URL(req.url);
  let inicio = Number(url.searchParams.get("inicio") ?? 0);
  let limite = Number(url.searchParams.get("limite") ?? LOTE_PADRAO);
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    inicio = Number(b.inicio ?? inicio);
    limite = Number(b.limite ?? limite);
  }
  limite = Math.max(1, Math.min(120, limite));

  const t0 = Date.now();
  const todas = await urlsDoSitemap();
  if (!todas.length) return json({ ok: false, erro: "sitemap vazio ou fora do ar" }, 502);

  // O sitemap ENCOLHE conforme imoveis sao vendidos (19.942 -> 19.893 em um
  // dia). Se o cursor do cron passar do fim, a fatia vem vazia e o lote
  // vira um "erro" que nao e erro. Dobrar aqui deixa o cursor se autocorrigir
  // sem depender do total que o pg_cron acha que existe.
  const inicioReal = todas.length ? inicio % todas.length : 0;
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
      p_itens: itens,
      p_corretor: corretorId,          // null quando vem do cron
      p_portal: "redegauchadeimoveis.com.br",
      p_modo: "varredura",
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
    meta: { portal: "redegauchadeimoveis.com.br", inicio, inicioReal, limite, totalNoSitemap: todas.length },
  });

  return json({
    ok: true,
    totalNoSitemap: todas.length,
    fatia: { inicio, inicioReal, limite, visitados: fatia.length },
    extraidos: itens.length,
    semDados,
    ...resumo,
    proximoInicio: inicio + limite < todas.length ? inicio + limite : null,
    duracaoMs: duracao,
  });
});
