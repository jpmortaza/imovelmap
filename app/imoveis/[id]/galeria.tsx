"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Galeria com visualizador em tela cheia.
 *
 * O corretor usa a foto para decidir se vale a visita e para mostrar ao
 * cliente — miniatura de 110px não serve para nenhuma das duas coisas.
 *
 * Teclado ligado de propósito: setas e Esc. Quem está passando 20 fotos não
 * quer mirar numa setinha com o mouse a cada troca.
 */
export default function Galeria({ imagens, titulo }: { imagens: string[]; titulo: string }) {
  const [aberta, setAberta] = useState<number | null>(null);

  const fechar = useCallback(() => setAberta(null), []);
  const andar = useCallback(
    (d: number) =>
      setAberta((i) => (i === null ? null : (i + d + imagens.length) % imagens.length)),
    [imagens.length]
  );

  useEffect(() => {
    if (aberta === null) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") andar(1);
      if (e.key === "ArrowLeft") andar(-1);
    }
    window.addEventListener("keydown", tecla);
    // trava o scroll do fundo enquanto o visualizador está aberto
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [aberta, fechar, andar]);

  if (!imagens.length) return null;

  return (
    <>
      <div style={grade}>
        {imagens.map((u, i) => (
          <button key={i} onClick={() => setAberta(i)} style={miniatura} aria-label={`foto ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" loading="lazy" style={img} />
          </button>
        ))}
      </div>

      {aberta !== null && (
        <div style={fundo} onClick={fechar} className="im-sem-impressao">
          <button onClick={fechar} style={{ ...botao, top: 16, right: 20 }} aria-label="fechar">
            ✕
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); andar(-1); }}
            style={{ ...botao, left: 16, top: "50%" }}
            aria-label="anterior"
          >
            ‹
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagens[aberta]}
            alt={titulo}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "92vw",
              maxHeight: "86vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 10px 50px rgba(0,0,0,.6)"
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); andar(1); }}
            style={{ ...botao, right: 16, top: "50%" }}
            aria-label="próxima"
          >
            ›
          </button>
          <div style={contador}>
            {aberta + 1} de {imagens.length} · setas para navegar, Esc para fechar
          </div>
        </div>
      )}
    </>
  );
}

const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 8
};
const miniatura: React.CSSProperties = {
  padding: 0,
  border: 0,
  background: "none",
  cursor: "zoom-in",
  borderRadius: 8,
  overflow: "hidden",
  lineHeight: 0
};
const img: React.CSSProperties = {
  width: "100%",
  height: 110,
  objectFit: "cover",
  display: "block"
};
const fundo: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.9)",
  zIndex: 2000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};
const botao: React.CSSProperties = {
  position: "absolute",
  background: "rgba(255,255,255,.12)",
  border: 0,
  color: "#fff",
  fontSize: 26,
  width: 44,
  height: 44,
  borderRadius: 99,
  cursor: "pointer",
  lineHeight: 1
};
const contador: React.CSSProperties = {
  position: "absolute",
  bottom: 18,
  color: "#ccc",
  fontSize: 12.5
};
