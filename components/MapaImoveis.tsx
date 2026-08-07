"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
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


// Uma cor por portal: bater o olho no mapa e saber de quem é a carteira
// vale mais que um mar de pins iguais. SVG inline — nada de CDN.
// ⭐ A leitura do mapa é uma só: VERMELHO já é nosso, AZUL é oportunidade.
// Somos a Auxiliadora Predial — o que está em azul é imóvel que outra
// imobiliária detém e que ainda dá para agenciar.
const COR_NOSSA = "#dc2626";   // vermelho — Auxiliadora Predial
const COR_OUTROS = "#2563eb";  // azul — todo o resto

const FONTE_NOSSA = "auxiliadorapredial.com.br";

export const NOMES_FONTE: Record<string, string> = {
  "redegauchadeimoveis.com.br": "Rede Gaúcha",
  "auxiliadorapredial.com.br": "Auxiliadora Predial (nossa)",
  "guarida.com.br": "Guarida",
  zapimoveis: "ZAP",
  vivareal: "VivaReal",
  olx: "OLX",
  imovelweb: "ImovelWeb"
};

const corDaFonte = (f: string) => (f === FONTE_NOSSA ? COR_NOSSA : COR_OUTROS);

const cacheIcones = new Map<string, L.Icon>();

function iconeDaFonte(fonte: string) {
  const cor = corDaFonte(fonte);
  const existente = cacheIcones.get(cor);
  if (existente) return existente;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">` +
    `<path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" ` +
    `fill="${cor}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>` +
    `<circle cx="12.5" cy="12.5" r="4.6" fill="#fff"/></svg>`;

  const icone = L.icon({
    iconUrl: "data:image/svg+xml;base64," + btoa(svg),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });
  cacheIcones.set(cor, icone);
  return icone;
}

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
  precoMin: string;
  precoMax: string;
  areaMin: string;
  /** "" todas · "so" apenas Auxiliadora · "excluir" so o que NAO e nosso */
  carteira: "" | "so" | "excluir";
};

const POA: [number, number] = [-30.0346, -51.2177];

function FitBounds({ items }: { items: ImovelPublico[] }) {
  const map = useMap();
  const jaEnquadrou = useRef(false);

  useEffect(() => {
    // SÓ no primeiro carregamento. Reenquadrar a cada busca criaria laço com
    // o carregamento por área: fit -> moveend -> fetch -> fit -> ...
    // e o mapa nunca pararia de se mexer sob o dedo do corretor.
    if (jaEnquadrou.current) return;

    const pts = items
      .filter((i) => i.lat != null && i.lng != null)
      .map((i) => [i.lat!, i.lng!] as [number, number]);
    if (pts.length === 0) return;

    jaEnquadrou.current = true;
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 });
  }, [items, map]);

  return null;
}

/**
 * `territorio` fixa o mapa no(s) bairro(s) do corretor: o painel usa isso para
 * mostrar "o meu bairro inteiro" sem que ele precise filtrar nada. Sem a prop,
 * o mapa e livre (rota /mapa).
 */
export default function MapaImoveis({
  territorio,
  cidade,
  altura
}: {
  territorio?: string[];
  cidade?: string;
  altura?: string;
} = {}) {
  const [items, setItems] = useState<ImovelPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // imovel aberto no painel lateral (null = painel fechado)
  const [aberto, setAberto] = useState<ImovelPublico | null>(null);
  // area visivel do mapa; o fetch passa a seguir para onde o corretor olha
  const [bbox, setBbox] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    tipo: "",
    q: "",
    quartosMin: "",
    precoMin: "",
    precoMax: "",
    areaMin: "",
    carteira: ""
  });

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ geo: "1", limit: "1500" });
    if (filtros.tipo) qs.set("tipo", filtros.tipo);
    if (filtros.q.trim()) qs.set("q", filtros.q.trim());
    if (filtros.quartosMin) qs.set("quartos_min", filtros.quartosMin);
    if (filtros.precoMin) qs.set("preco_min", filtros.precoMin);
    if (filtros.precoMax) qs.set("preco_max", filtros.precoMax);
    if (filtros.areaMin) qs.set("area_min", filtros.areaMin);
    if (filtros.carteira === "so") qs.set("fonte", FONTE_NOSSA);
    if (filtros.carteira === "excluir") qs.set("excluir", FONTE_NOSSA);
    if (territorio?.length) qs.set("bairros", territorio.join(","));
    if (cidade) qs.set("cidade", cidade);
    if (bbox) qs.set("bbox", bbox);

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
  }, [filtros, bbox, territorio, cidade]);

  const pinned = useMemo(
    () => items.filter((i) => i.lat != null && i.lng != null),
    [items]
  );

  return (
    <div
      style={{
        position: "relative",
        height: altura ?? "calc(100vh - 64px)",
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
        <ObservaArea aoMudar={setBbox} />
        <FitBounds items={pinned} />
        {pinned.map((i) => (
          <Marker
            key={i.id}
            position={[i.lat!, i.lng!]}
            icon={iconeDaFonte(i.source)}
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

      <Legenda fontes={[...new Set(pinned.map((i) => i.source))]} />

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
      {/* ⭐ o filtro que o corretor mais usa: "me mostre so o que NAO e nosso" */}
      <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #ddd" }}>
        {([
          ["", "Todos"],
          ["so", "Só nossos"],
          ["excluir", "Só oportunidades"]
        ] as const).map(([v, rotulo]) => {
          const ativo = filtros.carteira === v;
          const cor = v === "so" ? COR_NOSSA : v === "excluir" ? COR_OUTROS : "#111";
          return (
            <button
              key={v || "todos"}
              onClick={() => onChange({ ...filtros, carteira: v })}
              style={{
                border: 0,
                padding: "8px 12px",
                fontSize: 12.5,
                cursor: "pointer",
                fontWeight: ativo ? 700 : 400,
                background: ativo ? cor : "#fff",
                color: ativo ? "#fff" : "#555"
              }}
            >
              {rotulo}
            </button>
          );
        })}
      </div>

      <select
        value={filtros.tipo}
        onChange={(e) => onChange({ ...filtros, tipo: e.target.value as Filtros["tipo"] })}
        style={selectStyle}
      >
        <option value="">Venda e aluguel</option>
        <option value="sale">Venda</option>
        <option value="rent">Aluguel</option>
      </select>

      <input
        type="text"
        placeholder="Bairro, cidade, rua ou título..."
        value={filtros.q}
        onChange={(e) => onChange({ ...filtros, q: e.target.value })}
        style={{ ...inputStyle, minWidth: 170, flex: 1 }}
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
        value={filtros.areaMin}
        onChange={(e) => onChange({ ...filtros, areaMin: e.target.value })}
        style={selectStyle}
      >
        <option value="">Área mín</option>
        <option value="40">40 m²</option>
        <option value="70">70 m²</option>
        <option value="100">100 m²</option>
        <option value="150">150 m²</option>
        <option value="250">250 m²</option>
      </select>

      <select
        value={filtros.precoMin}
        onChange={(e) => onChange({ ...filtros, precoMin: e.target.value })}
        style={selectStyle}
      >
        <option value="">A partir de</option>
        <option value="200000">R$ 200 mil</option>
        <option value="400000">R$ 400 mil</option>
        <option value="700000">R$ 700 mil</option>
        <option value="1000000">R$ 1 mi</option>
        <option value="2000000">R$ 2 mi</option>
      </select>

      <select
        value={filtros.precoMax}
        onChange={(e) => onChange({ ...filtros, precoMax: e.target.value })}
        style={selectStyle}
      >
        <option value="">Até</option>
        <option value="200000">R$ 200 mil</option>
        <option value="400000">R$ 400 mil</option>
        <option value="700000">R$ 700 mil</option>
        <option value="1000000">R$ 1 mi</option>
        <option value="2000000">R$ 2 mi</option>
        <option value="5000000">R$ 5 mi</option>
      </select>

      <button
        onClick={() =>
          onChange({ tipo: "", q: "", quartosMin: "", precoMin: "", precoMax: "", areaMin: "", carteira: "" })
        }
        style={{
          border: "1px solid #ddd", background: "#fff", color: "#666",
          borderRadius: 8, padding: "8px 12px", fontSize: 12.5, cursor: "pointer"
        }}
      >
        limpar
      </button>

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


/**
 * Reporta a área visível do mapa. Com 52 mil imóveis não dá para mandar tudo
 * ao navegador — e "os N mais recentes" fazia uma fonte esconder a outra.
 * Carregar pelo enquadramento resolve os dois: sempre aparece o que está
 * na tela, de todas as fontes.
 */
function ObservaArea({ aoMudar }: { aoMudar: (bbox: string) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportar = (mapa: L.Map) => {
    if (timer.current) clearTimeout(timer.current);
    // debounce: arrastar o mapa dispara dezenas de eventos
    timer.current = setTimeout(() => {
      const b = mapa.getBounds();
      aoMudar(
        [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
          .map((n) => n.toFixed(5))
          .join(",")
      );
    }, 400);
  };

  const mapa = useMapEvents({
    moveend: () => reportar(mapa),
    zoomend: () => reportar(mapa)
  });

  useEffect(() => {
    reportar(mapa);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/** Legenda: vermelho é nosso, azul é oportunidade. */
function Legenda({ fontes }: { fontes: string[] }) {
  if (fontes.length === 0) return null;
  const temNossa = fontes.includes(FONTE_NOSSA);
  const outras = fontes.filter((f) => f !== FONTE_NOSSA);

  return (
    <div
      style={{
        position: "absolute", left: 12, bottom: 22, zIndex: 900,
        background: "rgba(255,255,255,.96)", borderRadius: 10,
        padding: "10px 13px", boxShadow: "0 2px 12px rgba(0,0,0,.15)",
        fontSize: 12, display: "flex", flexDirection: "column", gap: 6,
        maxWidth: 230
      }}
    >
      {temNossa && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: 999, background: COR_NOSSA, flex: "none" }} />
          <span style={{ color: "#333", fontWeight: 700 }}>Auxiliadora Predial</span>
        </div>
      )}
      {outras.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 11, height: 11, borderRadius: 999, background: COR_OUTROS, flex: "none" }} />
            <span style={{ color: "#333", fontWeight: 700 }}>Oportunidades</span>
          </div>
          <div style={{ fontSize: 10.5, color: "#777", paddingLeft: 18, lineHeight: 1.4 }}>
            {outras.map((f) => NOMES_FONTE[f] ?? f).join(" · ")}
          </div>
        </>
      )}
    </div>
  );
}
