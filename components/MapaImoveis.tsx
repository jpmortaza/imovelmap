"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// O Leaflet default importa ícones por URL relativa que quebram com
// bundler. Aponta pros SVGs do CDN (estáveis e cachados).
const defaultIcon = L.icon({
  iconUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export type ImovelPublico = {
  id: string;
  title: string;
  transactionType: "sale" | "rent" | null;
  propertyType: string | null;
  price: number | null;
  priceFormatted: string | null;
  area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  image: string | null;
  source: string;
  sourceUrl: string;
};

type Filtros = {
  tipo: "" | "sale" | "rent";
  q: string;
  quartosMin: string;
  precoMax: string;
};

const POA: [number, number] = [-30.0346, -51.2177];

function FitBounds({ items }: { items: ImovelPublico[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = items
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => [i.lat!, i.lng!] as [number, number]);
    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [items, map]);
  return null;
}

export default function MapaImoveis() {
  const [items, setItems] = useState<ImovelPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // imovel aberto no painel lateral (null = painel fechado)
  const [aberto, setAberto] = useState<ImovelPublico | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    tipo: "",
    q: "",
    quartosMin: "",
    precoMax: ""
  });

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ geo: "1", limit: "1500" });
    if (filtros.tipo) qs.set("tipo", filtros.tipo);
    if (filtros.q.trim()) qs.set("q", filtros.q.trim());
    if (filtros.quartosMin) qs.set("quartos_min", filtros.quartosMin);
    if (filtros.precoMax) qs.set("preco_max", filtros.precoMax);

    setLoading(true);
    setErro(null);
    fetch(`/api/imoveis/publico?${qs.toString()}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setErro(e.message);
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [filtros]);

  const pinned = useMemo(
    () => items.filter((i) => i.lat != null && i.lng != null),
    [items]
  );

  return (
    <div
      style={{
        position: "relative",
        height: "calc(100vh - 64px)",
        width: "100%"
      }}
    >
      <FiltrosBar
        filtros={filtros}
        onChange={setFiltros}
        total={pinned.length}
        loading={loading}
        erro={erro}
      />

      <MapContainer
        center={POA}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds items={pinned} />
        {pinned.map((i) => (
          <Marker
            key={i.id}
            position={[i.lat!, i.lng!]}
            icon={defaultIcon}
            eventHandlers={{ click: () => setAberto(i) }}
          >
            <Popup maxWidth={280}>
              <div style={{ minWidth: 220 }}>
                {i.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.image}
                    alt={i.title}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      borderRadius: 6,
                      marginBottom: 6
                    }}
                  />
                )}
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {i.priceFormatted ?? "Sob consulta"}
                  {i.transactionType === "rent" && (
                    <span style={{ fontSize: 11, color: "#666" }}> /mês</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "#333", margin: "2px 0" }}>
                  {i.title}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {[i.neighborhood, i.city].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                  {[
                    i.area && `${i.area}m²`,
                    i.bedrooms != null && `${i.bedrooms} quartos`,
                    i.bathrooms != null && `${i.bathrooms} banh.`,
                    i.parkingSpaces != null && `${i.parkingSpaces} vagas`
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <button
                  onClick={() => setAberto(i)}
                  style={{
                    marginTop: 8, fontSize: 12, cursor: "pointer",
                    background: "#111", color: "#fff", border: 0,
                    borderRadius: 6, padding: "6px 10px", width: "100%"
                  }}
                >
                  Abrir dossiê →
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {aberto && <PainelLateral imovel={aberto} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

function FiltrosBar({
  filtros,
  onChange,
  total,
  loading,
  erro
}: {
  filtros: Filtros;
  onChange: (f: Filtros) => void;
  total: number;
  loading: boolean;
  erro: string | null;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        right: 12,
        zIndex: 1000,
        background: "rgba(255,255,255,.96)",
        padding: 12,
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,.12)",
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center"
      }}
    >
      <select
        value={filtros.tipo}
        onChange={(e) =>
          onChange({ ...filtros, tipo: e.target.value as Filtros["tipo"] })
        }
        style={selectStyle}
      >
        <option value="">Venda e aluguel</option>
        <option value="sale">Venda</option>
        <option value="rent">Aluguel</option>
      </select>

      <input
        type="text"
        placeholder="Bairro, cidade ou título..."
        value={filtros.q}
        onChange={(e) => onChange({ ...filtros, q: e.target.value })}
        style={{ ...inputStyle, minWidth: 180, flex: 1 }}
      />

      <select
        value={filtros.quartosMin}
        onChange={(e) => onChange({ ...filtros, quartosMin: e.target.value })}
        style={selectStyle}
      >
        <option value="">Quartos</option>
        <option value="1">1+</option>
        <option value="2">2+</option>
        <option value="3">3+</option>
        <option value="4">4+</option>
      </select>

      <select
        value={filtros.precoMax}
        onChange={(e) => onChange({ ...filtros, precoMax: e.target.value })}
        style={selectStyle}
      >
        <option value="">Até R$ (máx)</option>
        <option value="200000">R$ 200 mil</option>
        <option value="400000">R$ 400 mil</option>
        <option value="600000">R$ 600 mil</option>
        <option value="1000000">R$ 1 mi</option>
        <option value="2000000">R$ 2 mi</option>
      </select>

      <div style={{ fontSize: 12, color: "#666", marginLeft: "auto" }}>
        {erro
          ? `erro: ${erro}`
          : loading
          ? "carregando..."
          : `${total} imóveis`}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  background: "#fff"
};

/**
 * Painel lateral: abre à direita ao clicar no pin, sem tirar o corretor do
 * mapa. Mostra o que a API pública entrega e leva ao dossiê completo —
 * endereço, telefone e proprietário só aparecem para quem está logado,
 * porque é isso que o `anon` não pode ver (0006_rls.sql).
 */
function PainelLateral({
  imovel,
  aoFechar
}: {
  imovel: ImovelPublico;
  aoFechar: () => void;
}) {
  return (
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        maxWidth: "92vw",
        background: "#fff",
        boxShadow: "-6px 0 24px rgba(0,0,0,.16)",
        zIndex: 1000,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 14px",
          borderBottom: "1px solid #eee",
          position: "sticky",
          top: 0,
          background: "#fff"
        }}
      >
        <strong style={{ flex: 1, fontSize: 14 }}>Imóvel</strong>
        <button
          onClick={aoFechar}
          aria-label="fechar"
          style={{
            border: 0,
            background: "transparent",
            fontSize: 20,
            cursor: "pointer",
            color: "#888",
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      {imovel.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imovel.image}
          alt=""
          style={{ width: "100%", height: 190, objectFit: "cover" }}
        />
      )}

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>
          {imovel.priceFormatted ??
            (imovel.price ? `R$ ${imovel.price.toLocaleString("pt-BR")}` : "Sob consulta")}
          {imovel.transactionType === "rent" && (
            <span style={{ fontSize: 12, color: "#666", fontWeight: 400 }}> /mês</span>
          )}
        </div>

        <div style={{ fontSize: 13.5, color: "#333", lineHeight: 1.45 }}>{imovel.title}</div>

        <div style={{ fontSize: 12.5, color: "#666" }}>
          {[imovel.neighborhood, imovel.city, imovel.state].filter(Boolean).join(" · ")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 8,
            borderTop: "1px solid #eee",
            borderBottom: "1px solid #eee",
            padding: "10px 0"
          }}
        >
          <Info r="Área" v={imovel.area ? `${imovel.area} m²` : "—"} />
          <Info r="Quartos" v={imovel.bedrooms ?? "—"} />
          <Info r="Banheiros" v={imovel.bathrooms ?? "—"} />
          <Info r="Vagas" v={imovel.parkingSpaces ?? "—"} />
          <Info r="Tipo" v={imovel.propertyType ?? "—"} />
          <Info r="Portal" v={imovel.source} />
        </div>

        {/* ⭐ o que o mapa público NÃO mostra fica atrás do login */}
        <a
          href={`/imoveis/${imovel.id}`}
          style={{
            background: "#111",
            color: "#fff",
            padding: "11px 14px",
            borderRadius: 9,
            textAlign: "center",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none"
          }}
        >
          Abrir dossiê completo →
        </a>
        <div style={{ fontSize: 11.5, color: "#888", textAlign: "center" }}>
          endereço, telefone do anunciante e proprietário
        </div>

        <a
          href={imovel.sourceUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12.5, color: "#0366d6", textAlign: "center" }}
        >
          ver anúncio original no portal
        </a>
      </div>
    </aside>
  );
}

function Info({ r, v }: { r: string; v: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {r}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
    </div>
  );
}
