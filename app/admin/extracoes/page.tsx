import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Extracao = {
  id: string;
  status: string;
  triggered_at: string;
  started_at: string | null;
  finished_at: string | null;
  duracao_ms: number | null;
  total_encontrados: number;
  total_novos: number;
  total_atualizados: number;
  total_erros: number;
  erro_msg: string | null;
  fontes: { slug: string; nome: string } | null;
};

export default async function ExtracoesPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("extracoes")
    .select("*, fontes(slug, nome)")
    .order("triggered_at", { ascending: false })
    .limit(100);

  const extracoes = (data ?? []) as Extracao[];

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Extrações</h1>

      {error && (
        <div style={{ color: "#b00020", padding: 12, background: "#fdecea", borderRadius: 8 }}>
          {error.message}
        </div>
      )}

      {extracoes.length === 0 ? (
        <div
          style={{
            background: "#fff",
            padding: 32,
            borderRadius: 12,
            textAlign: "center",
            color: "#666"
          }}
        >
          Nenhuma extração executada ainda. Vá em <b>Fontes</b> e clique em "Extrair agora".
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#f6f7f9", textAlign: "left" }}>
              <tr>
                <Th>Fonte</Th>
                <Th>Status</Th>
                <Th>Início</Th>
                <Th>Duração</Th>
                <Th>Encontrados</Th>
                <Th>Novos</Th>
                <Th>Atualizados</Th>
                <Th>Erros</Th>
              </tr>
            </thead>
            <tbody>
              {extracoes.map((e) => (
                <tr key={e.id} style={{ borderTop: "1px solid #eee" }}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{e.fontes?.nome ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{e.fontes?.slug}</div>
                  </Td>
                  <Td><StatusPill status={e.status} /></Td>
                  <Td>{new Date(e.triggered_at).toLocaleString("pt-BR")}</Td>
                  <Td>{e.duracao_ms != null ? `${(e.duracao_ms / 1000).toFixed(1)}s` : "—"}</Td>
                  <Td>{e.total_encontrados}</Td>
                  <Td><b>{e.total_novos}</b></Td>
                  <Td>{e.total_atualizados}</Td>
                  <Td>{e.total_erros}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "10px 12px", fontWeight: 600, fontSize: 12, color: "#555" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px" }}>{children}</td>;
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    queued:    { bg: "#eef2ff", fg: "#3b4ec2" },
    running:   { bg: "#fff7e0", fg: "#8a6d00" },
    ok:        { bg: "#e7f6ec", fg: "#157f3c" },
    error:     { bg: "#fdecea", fg: "#b00020" },
    cancelled: { bg: "#eee",    fg: "#666" }
  };
  const c = colors[status] ?? colors.queued;
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase"
      }}
    >
      {status}
    </span>
  );
}
