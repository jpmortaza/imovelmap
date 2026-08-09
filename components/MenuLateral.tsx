"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ItemMenu = {
  href: string;
  rotulo: string;
  icone: string;
  badge?: number;
  /** marca ativo também nas rotas filhas */
  prefixo?: boolean;
};

/**
 * Menu lateral da área logada.
 *
 * Substituiu a barra superior: o corretor vive em três telas (o bairro dele,
 * o mapa e a busca) e ficava trocando entre elas o tempo todo. Na
 * lateral as três ficam sempre à vista, e sobra a largura da tela para o
 * mapa, que é onde ele realmente trabalha.
 *
 * No celular vira uma gaveta: a lateral fixa comeria metade da tela.
 */
export default function MenuLateral({
  itens,
  email,
  territorio
}: {
  itens: ItemMenu[];
  email: string | null;
  territorio: string | null;
}) {
  const path = usePathname();
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  // ⚠️ Isto era um <Link href="/">, e virou laço quando a raiz passou a ser a
  //    tela de login: usuário logado em `/` é mandado de volta para /painel.
  //    "Sair" tem que encerrar a sessão, não navegar.
  async function sair() {
    setSaindo(true);
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  const ativo = (i: ItemMenu) =>
    i.prefixo ? path === i.href || path.startsWith(i.href + "/") : path === i.href;

  return (
    <>
      {/* barra só de celular, para abrir a gaveta */}
      <div style={barraMobile} className="im-mobile">
        <button onClick={() => setAberto((v) => !v)} style={botaoGaveta} aria-label="menu">
          ☰
        </button>
        <span style={{ fontWeight: 800, fontSize: 16 }}>ImovelMap</span>
      </div>

      <aside
        style={{ ...lateral, transform: aberto ? "translateX(0)" : undefined }}
        className={aberto ? "im-lateral im-aberta" : "im-lateral"}
      >
        <Link href="/painel" style={marca} onClick={() => setAberto(false)}>
          ImovelMap
        </Link>
        {territorio && <div style={seloTerritorio}>{territorio}</div>}

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 18 }}>
          {itens.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setAberto(false)}
              style={{
                ...item,
                background: ativo(i) ? "#1d2733" : "transparent",
                color: ativo(i) ? "#fff" : "#a8b3c0",
                fontWeight: ativo(i) ? 700 : 500
              }}
            >
              <span style={{ width: 20, textAlign: "center" }}>{i.icone}</span>
              <span style={{ flex: 1 }}>{i.rotulo}</span>
              {i.badge ? <span style={pilula}>{i.badge}</span> : null}
            </Link>
          ))}
        </nav>

        <div style={{ marginTop: "auto", paddingTop: 18, borderTop: "1px solid #232e3a" }}>
          <div style={{ fontSize: 11.5, color: "#6f7d8c", wordBreak: "break-all", marginBottom: 8 }}>
            {email}
          </div>
          <button
            onClick={sair}
            disabled={saindo}
            style={{
              ...item, color: "#8fa0b1", fontSize: 12.5, padding: "7px 10px",
              background: "transparent", border: 0, cursor: "pointer", width: "100%"
            }}
          >
            <span style={{ width: 20, textAlign: "center" }}>↩</span>
            <span>{saindo ? "saindo…" : "Sair"}</span>
          </button>
        </div>
      </aside>

      {aberto && (
        <div
          onClick={() => setAberto(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.4)",
            zIndex: 39
          }}
        />
      )}

      {/* A lateral é fixa no desktop e gaveta no celular. Precisa de CSS de
          verdade porque media query não existe em style inline. */}
      <style>{`
        .im-mobile { display: none; }
        .im-lateral {
          transform: translateX(0);
        }
        @media (max-width: 860px) {
          .im-mobile { display: flex !important; }
          .im-lateral { transform: translateX(-100%); }
          .im-lateral.im-aberta { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

const lateral: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  bottom: 0,
  width: 220,
  background: "#11161d",
  padding: "20px 14px",
  display: "flex",
  flexDirection: "column",
  zIndex: 40,
  transition: "transform .2s ease",
  boxSizing: "border-box"
};

const marca: React.CSSProperties = {
  fontSize: 19,
  fontWeight: 800,
  color: "#fff",
  letterSpacing: -0.3,
  textDecoration: "none"
};

const seloTerritorio: React.CSSProperties = {
  marginTop: 7,
  fontSize: 11.5,
  color: "#7ed6a0",
  background: "#14301f",
  border: "1px solid #1f4a2f",
  borderRadius: 7,
  padding: "4px 8px",
  lineHeight: 1.35
};

const item: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "9px 10px",
  borderRadius: 8,
  fontSize: 13.5,
  textDecoration: "none"
};

const pilula: React.CSSProperties = {
  background: "#e53e3e",
  color: "#fff",
  fontSize: 10.5,
  fontWeight: 700,
  borderRadius: 10,
  padding: "1px 7px"
};

const barraMobile: React.CSSProperties = {
  position: "sticky",
  top: 0,
  height: 52,
  background: "#11161d",
  color: "#fff",
  alignItems: "center",
  gap: 12,
  padding: "0 14px",
  zIndex: 30
};

const botaoGaveta: React.CSSProperties = {
  background: "transparent",
  border: 0,
  color: "#fff",
  fontSize: 20,
  cursor: "pointer",
  lineHeight: 1
};
