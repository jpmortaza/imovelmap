import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const supabase = createClient();

  const [{ count: fontesCount }, { count: extracoesCount }, { count: imoveisCount }] =
    await Promise.all([
      supabase.from("fontes").select("*", { count: "exact", head: true }),
      supabase.from("extracoes").select("*", { count: "exact", head: true }),
      supabase.from("imoveis").select("*", { count: "exact", head: true })
    ]);

  const cards = [
    { label: "Fontes cadastradas", value: fontesCount ?? 0, href: "/admin/fontes" },
    { label: "Extrações executadas", value: extracoesCount ?? 0, href: "/admin/extracoes" },
    { label: "Imóveis no banco", value: imoveisCount ?? 0, href: "/imoveis" }
  ];

  return (
    <div>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Painel do Admin</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Base de extrações: cadastre fontes, dispare coletas e veja o histórico.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              boxShadow: "0 2px 12px rgba(0,0,0,.05)"
            }}
          >
            <div style={{ color: "#666", fontSize: 13 }}>{c.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>
              {c.value}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
