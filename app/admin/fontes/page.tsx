import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ToggleAtivoButton from "./toggle-ativo-button";
import RunNowButton from "./run-now-button";

export const dynamic = "force-dynamic";

type Fonte = {
  id: string;
  slug: string;
  nome: string;
  tipo: string;
  url_base: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean;
  cron: string | null;
  config: Record<string, unknown>;
  created_at: string;
};

export default async function FontesPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("fontes")
    .select("*")
    .order("created_at", { ascending: true });

  const fontes = (data ?? []) as Fonte[];

  return (
    <div>
      <header style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, flex: 1 }}>Fontes de extração</h1>
        <Link
          href="/admin/fontes/novo"
          style={{
            background: "#111",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 14
          }}
        >
          + Nova fonte
        </Link>
      </header>

      {error && (
        <div style={{ color: "#b00020", padding: 12, background: "#fdecea", borderRadius: 8 }}>
          {error.message}
        </div>
      )}

      {fontes.length === 0 ? (
        <div
          style={{
            background: "#fff",
            padding: 32,
            borderRadius: 12,
            textAlign: "center",
            color: "#666"
          }}
        >
          Nenhuma fonte cadastrada ainda. Clique em "+ Nova fonte".
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {fontes.map((f) => (
            <div
              key={f.id}
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,.04)",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ fontSize: 16 }}>{f.nome}</strong>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: f.ativo ? "#e7f6ec" : "#eee",
                      color: f.ativo ? "#157f3c" : "#666"
                    }}
                  >
                    {f.ativo ? "ativo" : "pausado"}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#eef2ff",
                      color: "#3b4ec2"
                    }}
                  >
                    {f.tipo}
                  </span>
                </div>
                <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                  <code>{f.slug}</code>
                  {f.cidade && ` · ${f.cidade}/${f.estado}`}
                </div>
                {f.url_base && (
                  <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                    <a href={f.url_base} target="_blank" rel="noreferrer">{f.url_base}</a>
                  </div>
                )}
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 12, color: "#666", cursor: "pointer" }}>
                    config
                  </summary>
                  <pre
                    style={{
                      fontSize: 11,
                      background: "#f6f7f9",
                      padding: 8,
                      borderRadius: 6,
                      marginTop: 4,
                      overflow: "auto"
                    }}
                  >
                    {JSON.stringify(f.config, null, 2)}
                  </pre>
                </details>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <RunNowButton fonteSlug={f.slug} />
                <ToggleAtivoButton id={f.id} ativo={f.ativo} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
