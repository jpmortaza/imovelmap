import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";
import BuscarForm from "./buscar-form";
import ExtrairButton from "./extrair-button";
import FavoritarButton from "./favoritar-button";

export const dynamic = "force-dynamic";

type Imovel = {
  id: string;
  title: string;
  price: number | null;
  price_formatted: string | null;
  transaction_type: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area: number | null;
  parking_spaces: number | null;
  images: string[];
  source: string;
  source_url: string;
  published_at: string | null;
};

type SearchParams = {
  q?: string;
  tipo?: string;
  bairro?: string;
  quartos_min?: string;
  preco_max?: string;
};

export default async function ImoveisPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  let isSuperAdmin = false;
  let isCorretor = false;
  if (user) {
    const { data: me } = await supabase
      .from("corretores")
      .select("role, ativo")
      .eq("id", user.id)
      .single();
    isSuperAdmin = me?.role === "super_admin";
    isCorretor = !!me && me.ativo !== false;
  }

  let query = supabase
    .from("imoveis")
    .select(
      "id,title,price,price_formatted,transaction_type,neighborhood,city,state,bedrooms,bathrooms,area,parking_spaces,images,source,source_url,published_at"
    )
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(120);

  if (searchParams.tipo) query = query.eq("transaction_type", searchParams.tipo);
  if (searchParams.bairro)
    query = query.ilike("neighborhood", `%${searchParams.bairro}%`);
  if (searchParams.quartos_min)
    query = query.gte("bedrooms", Number(searchParams.quartos_min));
  if (searchParams.preco_max)
    query = query.lte("price", Number(searchParams.preco_max));
  if (searchParams.q) {
    const q = searchParams.q;
    query = query.or(
      `title.ilike.%${q}%,neighborhood.ilike.%${q}%,city.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  const imoveis = (data ?? []) as Imovel[];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h1 style={{ fontSize: 28 }}>
            <Link href="/" style={{ color: "#111" }}>
              ImovelMap
            </Link>{" "}
            · Imóveis
          </h1>
          <p style={{ color: "#666", fontSize: 13 }}>
            {user
              ? `Logado como ${user.email}`
              : "Base compartilhada de imóveis em Porto Alegre"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/" style={navLink}>
            Mapa
          </Link>
          {isCorretor && <ExtrairButton />}
          {isSuperAdmin && (
            <Link href="/admin" style={navBtn}>
              Admin
            </Link>
          )}
          {user ? (
            <LogoutButton />
          ) : (
            <Link href="/login" style={navBtn}>
              Entrar como corretor
            </Link>
          )}
        </div>
      </header>

      <BuscarForm />

      {error && (
        <div
          style={{
            padding: 12,
            background: "#fdecea",
            color: "#b00020",
            borderRadius: 8,
            marginBottom: 16
          }}
        >
          Erro ao carregar imóveis: {error.message}
        </div>
      )}

      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        {imoveis.length} imóveis
      </div>

      {imoveis.length === 0 ? (
        <div
          style={{
            padding: 32,
            background: "#fff",
            borderRadius: 12,
            textAlign: "center",
            color: "#666"
          }}
        >
          Nenhum imóvel encontrado com esses filtros.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16
          }}
        >
          {imoveis.map((i) => (
            <div
              key={i.id}
              style={{
                background: "#fff",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                display: "flex",
                flexDirection: "column",
                position: "relative"
              }}
            >
              {user && <FavoritarButton imovelId={i.id} />}
              <a
                href={i.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ display: "flex", flexDirection: "column", flex: 1 }}
              >
              {i.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={i.images[0]}
                  alt={i.title}
                  style={{
                    width: "100%",
                    height: 180,
                    objectFit: "cover"
                  }}
                />
              )}
              <div style={{ padding: 14, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 18 }}>
                  {i.price_formatted ?? "Preço sob consulta"}
                  {i.transaction_type === "rent" && (
                    <span style={{ fontSize: 11, color: "#666" }}> /mês</span>
                  )}
                </div>
                <div
                  style={{
                    color: "#666",
                    fontSize: 13,
                    margin: "4px 0 10px"
                  }}
                >
                  {[i.neighborhood, i.city, i.state]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div style={{ fontSize: 13, color: "#444" }}>
                  {[
                    i.area && `${i.area}m²`,
                    i.bedrooms != null && `${i.bedrooms} quartos`,
                    i.bathrooms != null && `${i.bathrooms} banh.`,
                    i.parking_spaces != null && `${i.parking_spaces} vagas`
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#999",
                    marginTop: 10,
                    textTransform: "uppercase"
                  }}
                >
                  {i.source}
                </div>
              </div>
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const navLink: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  padding: "8px 12px",
  borderRadius: 8
};

const navBtn: React.CSSProperties = {
  fontSize: 14,
  background: "#111",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 8
};
