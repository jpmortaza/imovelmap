import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PainelLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Buscar contagem de notificacoes nao lidas
  const { count: unreadCount } = await supabase
    .from("notificacoes")
    .select("*", { count: "exact", head: true })
    .eq("corretor_id", user.id)
    .eq("visualizada", false);

  const badge = unreadCount ?? 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header
        style={{
          height: 56,
          padding: "0 20px",
          background: "#111",
          display: "flex",
          alignItems: "center",
          gap: 20
        }}
      >
        <Link
          href="/painel"
          style={{
            fontSize: 17,
            fontWeight: 800,
            color: "#fff",
            letterSpacing: -0.3,
            textDecoration: "none"
          }}
        >
          ImovelMap
          <span
            style={{
              fontWeight: 400,
              color: "#999",
              fontSize: 13,
              marginLeft: 8
            }}
          >
            Corretor
          </span>
        </Link>

        <nav
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6
          }}
        >
          <Link href="/painel" style={navLink}>
            Meus Imoveis
          </Link>
          <Link href="/painel/favoritos" style={navLink}>
            Favoritos
          </Link>
          <Link href="/painel/alertas" style={navLink}>
            Alertas
          </Link>
          <Link href="/" style={navLink}>
            Mapa
          </Link>

          {badge > 0 && (
            <span
              style={{
                background: "#e53e3e",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 10,
                padding: "2px 7px",
                marginLeft: 4
              }}
            >
              {badge}
            </span>
          )}

          <span
            style={{
              color: "#777",
              fontSize: 13,
              marginLeft: 12,
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {user.email}
          </span>
        </nav>
      </header>

      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}

const navLink: React.CSSProperties = {
  fontSize: 13,
  color: "#ccc",
  padding: "6px 12px",
  borderRadius: 8,
  textDecoration: "none",
  transition: "color .15s"
};
