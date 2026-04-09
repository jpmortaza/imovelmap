import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

type Imovel = {
  id: string;
  title: string;
  price: number | null;
  price_formatted: string | null;
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

export default async function ImoveisPage() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("corretores")
    .select("role")
    .eq("id", user.id)
    .single();
  const isSuperAdmin = me?.role === "super_admin";

  const { data, error } = await supabase
    .from("imoveis")
    .select(
      "id,title,price,price_formatted,neighborhood,city,state,bedrooms,bathrooms,area,parking_spaces,images,source,source_url,published_at"
    )
    .eq("is_active", true)
    .order("first_seen_at", { ascending: false })
    .limit(60);

  const imoveis = (data ?? []) as Imovel[];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24
        }}
      >
        <div>
          <h1 style={{ fontSize: 28 }}>Imóveis</h1>
          <p style={{ color: "#666", fontSize: 14 }}>
            Logado como {user.email}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isSuperAdmin && (
            <Link
              href="/admin"
              style={{
                background: "#111",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 14
              }}
            >
              Admin
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

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
          Nenhum imóvel cadastrado ainda. Rode o scraper para popular a base.
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
            <a
              key={i.id}
              href={i.source_url}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "#fff",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                display: "flex",
                flexDirection: "column"
              }}
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
          ))}
        </div>
      )}
    </div>
  );
}
