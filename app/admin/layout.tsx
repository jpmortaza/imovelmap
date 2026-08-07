import Link from "next/link";
import CascaApp from "@/components/CascaApp";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <CascaApp>
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <Link href="/admin/fontes" style={aba}>
          Fontes
        </Link>
        <Link href="/admin/extracoes" style={aba}>
          Extrações
        </Link>
        <Link href="/admin/corretores" style={aba}>
          Corretores
        </Link>
      </div>
      {children}
    </CascaApp>
  );
}

const aba: React.CSSProperties = {
  fontSize: 13,
  color: "#333",
  background: "#fff",
  border: "1px solid #e2e6ea",
  borderRadius: 8,
  padding: "7px 13px",
  textDecoration: "none"
};
