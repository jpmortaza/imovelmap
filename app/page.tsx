import Link from "next/link";
import nextDynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";

// Leaflet não roda em SSR (usa window/document)
const MapaImoveis = nextDynamic(() => import("@/components/MapaImoveis"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888"
      }}
    >
      Carregando mapa...
    </div>
  )
});

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header
        style={{
          height: 64,
          padding: "0 20px",
          background: "#fff",
          borderBottom: "1px solid #eaeaea",
          display: "flex",
          alignItems: "center",
          gap: 16
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: "#111",
            letterSpacing: -0.3
          }}
        >
          ImovelMap
        </Link>
        <span style={{ color: "#aaa", fontSize: 13 }}>
          Imóveis disponíveis em Porto Alegre
        </span>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {user ? (
            <>
              <Link href="/imoveis" style={navLink}>
                Lista
              </Link>
              <Link href="/painel" style={navBtn}>
                Painel do corretor
              </Link>
            </>
          ) : (
            <>
              <Link href="/imoveis" style={navLink}>
                Lista
              </Link>
              <Link href="/login" style={navBtn}>
                Entrar como corretor
              </Link>
            </>
          )}
        </nav>
      </header>

      <MapaImoveis />
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
