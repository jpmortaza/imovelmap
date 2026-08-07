import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// API pública — sem auth. Devolve só os campos seguros pro mapa/listagem
// pública. Endereço exato, CEP e número NÃO são expostos aqui.
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
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 3000), 6000);

  let query = svc
    .from("imoveis")
    .select(
      "id,title,transaction_type,property_type,price,price_formatted,area,bedrooms,bathrooms,parking_spaces,neighborhood,city,state,latitude,longitude,images,source,source_url"
    )
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(limit);

  if (onlyGeo) {
    query = query.not("latitude", "is", null).not("longitude", "is", null);
  }
  if (transactionType) query = query.eq("transaction_type", transactionType);
  if (cidade) query = query.ilike("city", `%${cidade}%`);
  if (bairro) query = query.ilike("neighborhood", `%${bairro}%`);
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
        "cache-control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
      }
    }
  );
}
