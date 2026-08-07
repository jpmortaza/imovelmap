import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Alimenta o mapa de prospecção. EXIGE LOGIN — o nome "publico" ficou do
// tempo em que o mapa era aberto. Mesmo aqui o endereço exato, o CEP e o
// número não saem: o mapa mostra posição e card, não o endereço.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 60;

type Row = {
  id: string;
  title: string;
  transaction_type: string | null;
  property_type: string | null;
  price: number | null;
  price_formatted: string | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  images: string[];
  source: string;
  source_url: string;
};

export async function GET(req: Request) {
  // ⚠️ Esta rota usa a service_role, que passa por cima da RLS. O middleware
  //    já barra visitante anônimo, mas a rota não confia nisso: ela alimenta
  //    o mapa de prospecção (coordenada de 72 mil imóveis) e um dia alguém
  //    mexe no matcher do middleware sem lembrar disso.
  const sessao = createClient();
  const {
    data: { user }
  } = await sessao.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "nao autenticado" }, { status: 401 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const url = new URL(req.url);
  const transactionType = url.searchParams.get("tipo"); // sale|rent
  const cidade = url.searchParams.get("cidade");
  const bairro = url.searchParams.get("bairro");
  const quartosMin = url.searchParams.get("quartos_min");
  const precoMin = url.searchParams.get("preco_min");
  const precoMax = url.searchParams.get("preco_max");
  const q = url.searchParams.get("q");
  const onlyGeo = url.searchParams.get("geo") === "1";
  const fonte = url.searchParams.get("fonte");
  // excluir uma fonte e o filtro que o corretor mais usa: "me mostre so o
  // que NAO e nosso", ou seja, so oportunidade de agenciamento
  const excluir = url.searchParams.get("excluir");
  const areaMin = url.searchParams.get("area_min");
  const semExclusiva = url.searchParams.get("sem_exclusiva") === "1";
  // bbox=oesteLng,sulLat,lesteLng,norteLat — o mapa manda a area visivel.
  // Sem isso, "os N mais recentes" fazia UMA fonte ocupar o mapa inteiro:
  // a Auxiliadora (carregada antes) sumia atras da Rede Gaucha.
  const bbox = (url.searchParams.get("bbox") ?? "")
    .split(",").map(Number).filter((n) => Number.isFinite(n));
  // PostgREST corta em 1000 linhas por requisicao; pedir mais nao adianta
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1000);

  let query = svc
    .from("imoveis")
    .select(
      "id,title,transaction_type,property_type,price,price_formatted,area,bedrooms,bathrooms,parking_spaces,neighborhood,city,state,latitude,longitude,images,source,source_url"
    )
    .eq("is_active", true)
    // Dentro de um enquadramento queremos AMOSTRA, nao "os mais recentes":
    // ordenar por data faz a fonte carregada por ultimo ocupar o mapa
    // inteiro e a outra sumir. `id` e uuid v4, entao ordenar por ele
    // distribui as fontes de forma uniforme.
    .order(bbox.length === 4 ? "id" : "first_seen_at", {
      ascending: bbox.length === 4
    })
    .limit(limit);

  if (onlyGeo || bbox.length === 4) {
    query = query.not("latitude", "is", null).not("longitude", "is", null);
  }
  if (bbox.length === 4) {
    const [oeste, sul, leste, norte] = bbox;
    query = query
      .gte("longitude", oeste).lte("longitude", leste)
      .gte("latitude", sul).lte("latitude", norte);
  }
  if (fonte) query = query.eq("source", fonte);
  if (excluir) query = query.neq("source", excluir);
  if (areaMin) query = query.gte("area", Number(areaMin));
  if (semExclusiva) query = query.gt("temperatura", 0);
  if (transactionType) query = query.eq("transaction_type", transactionType);
  if (cidade) query = query.ilike("city", `%${cidade}%`);
  if (bairro) query = query.ilike("neighborhood", `%${bairro}%`);
  // `bairros` (plural) = territorio do corretor: lista exata, nao busca livre
  const bairros = (url.searchParams.get("bairros") ?? "")
    .split(",").map((b) => b.trim()).filter(Boolean);
  if (bairros.length) query = query.in("neighborhood", bairros);
  if (quartosMin) query = query.gte("bedrooms", Number(quartosMin));
  if (precoMin) query = query.gte("price", Number(precoMin));
  if (precoMax) query = query.lte("price", Number(precoMax));
  if (q) {
    query = query.or(
      `title.ilike.%${q}%,neighborhood.ilike.%${q}%,city.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reduz ainda mais os campos expostos ao cliente público: sem
  // endereco/cep/numero mesmo que existam na tabela.
  const rows = (data ?? []) as Row[];
  const items = rows.map((r) => ({
    id: r.id,
    title: r.title,
    transactionType: r.transaction_type,
    propertyType: r.property_type,
    price: r.price,
    priceFormatted: r.price_formatted,
    area: r.area,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    parkingSpaces: r.parking_spaces,
    neighborhood: r.neighborhood,
    city: r.city,
    state: r.state,
    lat: r.latitude,
    lng: r.longitude,
    image: r.images?.[0] ?? null,
    source: r.source,
    sourceUrl: r.source_url
  }));

  return NextResponse.json(
    { total: items.length, items },
    {
      headers: {
        // `private`: a rota exige login, entao a resposta nao pode ficar
        // num cache compartilhado e ser servida a quem nao entrou
        "cache-control": "private, max-age=30"
      }
    }
  );
}
