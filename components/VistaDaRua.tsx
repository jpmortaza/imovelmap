"use client";

import { useState } from "react";

/**
 * A fachada do imóvel, vista da rua.
 *
 * ⭐ Por que isso importa mais do que parece: o corretor decide se vale a
 *    visita olhando o prédio. Foto de anúncio é do interior e é escolhida para
 *    vender; a fachada mostra a idade real do prédio, a rua, se tem portaria,
 *    se a garagem é na frente. Em prospecção isso é metade da qualificação.
 *
 * ⚠️ A imagem vem de `/api/streetview`, que assina e busca no SERVIDOR. A
 *    chave do Google nunca chega ao navegador — em `NEXT_PUBLIC_*` ela entraria
 *    no bundle e qualquer um usaria a nossa cota.
 *
 *    Sem a chave configurada a rota devolve 503 e nada quebra: ficam os botões
 *    que abrem no Google, que funcionam de graça.
 */
export default function VistaDaRua({
  lat,
  lng,
  endereco,
  altura = 260
}: {
  lat: number;
  lng: number;
  endereco?: string | null;
  altura?: number;
}) {
  const [erro, setErro] = useState(false);
  const [giro, setGiro] = useState(0);

  const coord = `${lat},${lng}`;
  // `map_action=pano` abre direto no Street View, não no mapa
  const linkPano = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coord}`;
  const linkAerea = `https://www.google.com/maps/@${coord},19z/data=!3m1!1e3`;
  const linkRota = `https://www.google.com/maps/dir/?api=1&destination=${coord}`;

  // 4 ângulos: a fachada nem sempre está no rumo que o carro do Google seguia
  const heading = giro * 90;
  const imagem = `/api/streetview?lat=${lat}&lng=${lng}&heading=${heading}`;

  return (
    <div>
      {!erro ? (
        <div style={{ position: "relative" }}>
          <a href={linkPano} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagem}
              alt={`Fachada de ${endereco ?? "imóvel"}`}
              onError={() => setErro(true)}
              style={{
                width: "100%",
                height: altura,
                objectFit: "cover",
                borderRadius: 10,
                display: "block"
              }}
            />
          </a>
          <button
            onClick={() => setGiro((g) => (g + 1) % 4)}
            style={botaoGirar}
            className="im-sem-impressao"
            title="girar a câmera 90°"
          >
            ↻ girar
          </button>
        </div>
      ) : (
        <div style={{ ...vazio, height: altura }}>
          <div style={{ fontSize: 30 }}>🏢</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
            Fachada indisponível
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3, maxWidth: 300, lineHeight: 1.5 }}>
            Ou o Google não tem cobertura nesta coordenada, ou a chave ainda não
            foi configurada. Os botões abaixo abrem o local de qualquer forma.
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
        <a href={linkPano} target="_blank" rel="noreferrer" style={botao}>
          👁 Ver a fachada (Street View)
        </a>
        <a href={linkAerea} target="_blank" rel="noreferrer" style={botao}>
          🛰 Vista aérea
        </a>
        <a href={linkRota} target="_blank" rel="noreferrer" style={botao}>
          🧭 Como chegar
        </a>
      </div>
    </div>
  );
}

const vazio: React.CSSProperties = {
  background: "#f2f5f8",
  border: "1px dashed #d5dde4",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: 16
};

const botao: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 12.5,
  color: "#333",
  textDecoration: "none"
};

const botaoGirar: React.CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 10,
  background: "rgba(17,17,17,.75)",
  color: "#fff",
  border: 0,
  borderRadius: 7,
  padding: "6px 11px",
  fontSize: 12,
  cursor: "pointer"
};
