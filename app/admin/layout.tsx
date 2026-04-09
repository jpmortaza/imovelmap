import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div style={{ minHeight: "100vh" }}>
      <nav
        style={{
          background: "#111",
          color: "#fff",
          padding: "12px 24px",
          display: "flex",
          gap: 20,
          alignItems: "center"
        }}
      >
        <strong style={{ marginRight: 20 }}>Superag · Admin</strong>
        <Link href="/admin/fontes" style={linkStyle}>Fontes</Link>
        <Link href="/admin/extracoes" style={linkStyle}>Extrações</Link>
        <Link href="/imoveis" style={{ ...linkStyle, marginLeft: "auto" }}>
          ← Voltar
        </Link>
      </nav>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {children}
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "#fff",
  fontSize: 14,
  opacity: 0.85
};
