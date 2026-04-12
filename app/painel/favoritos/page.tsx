"use client";

import { useEffect, useState, useCallback } from "react";

interface Imovel {
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
  source_url: string;
}

interface FavItem {
  imovel_id: string;
  nota: string | null;
  imovel: Imovel | null;
}

export default function FavoritosPage() {
  const [favoritos, setFavoritos] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const fetchFavoritos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/painel/favoritos");
      const data = await res.json();
      setFavoritos(data.items || data.favoritos || []);
    } catch {
      setFavoritos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavoritos();
  }, [fetchFavoritos]);

  async function handleRemove(imovelId: string) {
    setRemoving(imovelId);
    try {
      await fetch("/api/painel/favoritos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imovelId }),
      });
      setFavoritos((prev) => prev.filter((f) => f.imovel_id !== imovelId));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
        Carregando favoritos...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 20 }}>
        Favoritos
      </h1>

      {favoritos.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>
          <p>Nenhum imovel favoritado ainda.</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Adicione favoritos a partir do mapa ou da lista de imoveis.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          {favoritos.map((fav) => {
            const im = fav.imovel;
            if (!im) return null;
            const isRemoving = removing === fav.imovel_id;

            return (
              <div
                key={fav.imovel_id}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 2px 12px rgba(0,0,0,.05)",
                  overflow: "hidden",
                }}
              >
                {im.images?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={im.images[0]}
                    alt={im.title}
                    style={{ width: "100%", height: 180, objectFit: "cover" }}
                  />
                )}

                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0a7c3a", marginBottom: 4 }}>
                    {im.price_formatted ?? "Preco sob consulta"}
                  </div>
                  <div style={{ fontSize: 14, color: "#555", marginBottom: 10 }}>
                    {[im.neighborhood, im.city, im.state].filter(Boolean).join(" - ")}
                  </div>
                  <div style={{ display: "flex", gap: 14, fontSize: 13, color: "#666", marginBottom: 14 }}>
                    {im.area != null && <span>{im.area} m2</span>}
                    {im.bedrooms != null && <span>{im.bedrooms} quartos</span>}
                    {im.bathrooms != null && <span>{im.bathrooms} banh.</span>}
                    {im.parking_spaces != null && <span>{im.parking_spaces} vagas</span>}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <a
                      href={im.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        flex: 1,
                        textAlign: "center",
                        fontSize: 13,
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#333",
                        textDecoration: "none",
                      }}
                    >
                      Ver anuncio
                    </a>
                    <button
                      onClick={() => handleRemove(fav.imovel_id)}
                      disabled={isRemoving}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        padding: "7px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#e53e3e",
                        color: "#fff",
                        cursor: isRemoving ? "wait" : "pointer",
                        opacity: isRemoving ? 0.6 : 1,
                      }}
                    >
                      {isRemoving ? "Removendo..." : "Remover"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
