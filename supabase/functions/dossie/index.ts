// ImovelMap — EF `dossie` (Fase 10, parcial)
//
// Junta o que o banco sabe (RPC `dossie`) com o que mora fora dele:
//   BrasilAPI /cnpj  — quadro societario do condominio ou da empresa
//                      (gratis, sem chave; substitui o ReceitaWS de 3 req/min)
//   cartorio         — qual Registro de Imoveis atende aquele bairro de POA
//   IPTU             — link da consulta municipal
//
// Alimenta o HUD da extensao (Fase 9) e o painel do corretor.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

// ----------------------------------------------------------------- cartorio
// Preservado de lib/scrapers/../owner-lookup.ts do repo: os 6 Registros de
// Imoveis de Porto Alegre por bairro. E o passo 4 do funil de proprietario —
// o unico que da nome e CPF com certeza, e o unico que custa dinheiro.
const CARTORIOS: Record<string, string[]> = {
  "1º Registro de Imóveis de Porto Alegre — Centro": [
    "Centro", "Centro Historico", "Cidade Baixa", "Menino Deus", "Azenha",
    "Santana", "Farroupilha", "Praia de Belas",
  ],
  "2º Registro de Imóveis de Porto Alegre — Zona Leste": [
    "Moinhos de Vento", "Bela Vista", "Mont'Serrat", "Mont Serrat", "Montserrat",
    "Rio Branco", "Independencia", "Floresta", "Bom Fim", "Auxiliadora",
    "Boa Vista", "Tres Figueiras", "Chacara das Pedras", "Higienopolis",
    "Jardim Botanico",
  ],
  "3º Registro de Imóveis de Porto Alegre — Zona Sudeste": [
    "Petropolis", "Bom Jesus", "Partenon", "Santo Antonio", "Teresopolis",
    "Vila Jardim", "Medianeira", "Gloria", "Cascata", "Santa Tereza",
  ],
  "4º Registro de Imóveis de Porto Alegre — Zona Norte": [
    "Sarandi", "Rubem Berta", "Passo das Pedras", "Passo d'Areia",
    "Cristo Redentor", "Jardim Sao Pedro", "Jardim Lindoia", "Jardim Itu",
    "Jardim Itu-Sabara", "Vila Ipiranga", "Sao Sebastiao", "Santa Maria Goretti",
    "Jardim Carvalho", "Sao Joao", "Navegantes", "Humaita", "Anchieta",
    "Farrapos", "Marcilio Dias",
  ],
  "5º Registro de Imóveis de Porto Alegre — Zona Sul": [
    "Ipanema", "Tristeza", "Cavalhada", "Cristal", "Camaqua", "Vila Assuncao",
    "Pedra Redonda", "Espirito Santo", "Guaruja", "Vila Conceicao", "Serraria",
    "Vila Nova", "Nonoai", "Hipica", "Lami", "Belem Novo", "Ponta Grossa",
  ],
  "6º Registro de Imóveis de Porto Alegre — Zona Leste/Sul": [
    "Restinga", "Lomba do Pinheiro", "Agronomia", "Morro Santana",
    "Protasio Alves", "Mario Quintana",
  ],
};

const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function acharCartorio(bairro?: string | null): string | null {
  if (!bairro) return null;
  const b = semAcento(bairro);

  for (const [cartorio, bairros] of Object.entries(CARTORIOS)) {
    if (bairros.some((x) => semAcento(x) === b)) return cartorio;
  }
  // parcial: "Jardim Itu Sabara" casa com "Jardim Itu"
  for (const [cartorio, bairros] of Object.entries(CARTORIOS)) {
    if (bairros.some((x) => semAcento(x).includes(b) || b.includes(semAcento(x)))) {
      return cartorio;
    }
  }
  return null;
}

// ---------------------------------------------------------------- BrasilAPI
async function consultarCnpj(cnpj: string) {
  const limpo = cnpj.replace(/\D/g, "");
  if (limpo.length !== 14) return { erro: "cnpj precisa de 14 digitos" };

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${limpo}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 404) return { erro: "cnpj nao encontrado" };
    if (!r.ok) return { erro: `brasilapi HTTP ${r.status}` };

    const d = await r.json();
    return {
      cnpj: limpo,
      razaoSocial: d.razao_social ?? null,
      nomeFantasia: d.nome_fantasia ?? null,
      situacao: d.descricao_situacao_cadastral ?? null,
      abertura: d.data_inicio_atividade ?? null,
      atividade: d.cnae_fiscal_descricao ?? null,
      telefone: d.ddd_telefone_1 ?? null,
      email: d.email ?? null,
      endereco: [
        d.descricao_tipo_de_logradouro,
        d.logradouro,
        d.numero,
        d.complemento,
      ]
        .filter(Boolean)
        .join(" "),
      municipio: d.municipio ?? null,
      uf: d.uf ?? null,
      // o que interessa pro corretor: quem responde pelo condominio
      socios: (d.qsa ?? []).map((s: Record<string, unknown>) => ({
        nome: s.nome_socio ?? null,
        qualificacao: s.qualificacao_socio ?? null,
        desde: s.data_entrada_sociedade ?? null,
      })),
    };
  } catch (e) {
    return { erro: `brasilapi falhou: ${(e as Error).message}` };
  }
}

// -------------------------------------------------------------------- serve
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
  let cnpjParam = url.searchParams.get("cnpj");
  let source = url.searchParams.get("source");
  let externalId = url.searchParams.get("externalId");

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    imovelId = b.imovelId ?? imovelId;
    cnpjParam = b.cnpj ?? cnpjParam;
    source = b.source ?? source;
    externalId = b.externalId ?? externalId;
  }

  // consulta avulsa de CNPJ (o corretor colou um do quadro do condominio)
  if (cnpjParam && !imovelId && !externalId) {
    return json({ ok: true, cnpj: await consultarCnpj(cnpjParam) });
  }

  // O HUD sabe (source, externalId) pela URL da pagina, nunca o uuid interno.
  // Resolver aqui evita uma viagem extra a partir do navegador do corretor.
  if (!imovelId && source && externalId) {
    const { data: achado } = await svc
      .from("imoveis")
      .select("id")
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();

    if (!achado) {
      // ainda nao capturado: isso e informacao util, nao erro
      return json({ ok: true, mapeado: false, source, externalId });
    }
    imovelId = achado.id;
  }

  if (!imovelId) {
    return json({ error: "informe imovelId, (source + externalId) ou cnpj" }, 400);
  }

  const { data: base, error: rpcErr } = await svc.rpc("dossie", {
    p_imovel_id: imovelId,
    p_corretor: user.id,
  });
  if (rpcErr) return json({ error: rpcErr.message }, 500);
  if (base?.erro) return json({ error: base.erro }, 404);

  const im = base.imovel ?? {};

  // CNPJ: o explicito na query vence; senao o que o corretor ja anotou
  const docSalvo = String(base.proprietario?.cpf_cnpj ?? "").replace(/\D/g, "");
  const cnpjAlvo = cnpjParam ?? (docSalvo.length === 14 ? docSalvo : null);

  const [cnpj] = await Promise.all([cnpjAlvo ? consultarCnpj(cnpjAlvo) : null]);

  const ehPoa = semAcento(im.city ?? "").includes("porto alegre");

  return json({
    ok: true,
    mapeado: true,
    ...base,
    cnpj,
    cartorio: ehPoa ? acharCartorio(im.neighborhood) : null,
    iptuUrl: ehPoa
      ? "https://prefeitura.poa.br/smf/servicos/consulta-de-iptu"
      : null,
    // o que ainda falta pra fechar o cerco neste imovel
    proximosPassos: [
      !im.endereco && "endereço ainda não resolvido — depende da Fase 8",
      !im.inscricaoImobiliaria &&
        "sem inscrição imobiliária — sem ela não dá pra pedir a matrícula",
      base.portais > 1 &&
        `anunciado em ${base.portais} portais: provável que não haja exclusiva`,
      base.quedaPct > 5 &&
        `preço caiu ${base.quedaPct}% em ${base.diasNoMercado} dias`,
      !base.proprietario && "proprietário ainda não identificado",
    ].filter(Boolean),
  });
});
