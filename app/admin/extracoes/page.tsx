import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Painel de coleta.
 *
 * ⚠️ "Total extraído" sozinho engana. O coletor revisita o catálogo inteiro em
 *    ciclo, então na segunda volta quase tudo é ATUALIZAÇÃO, não descoberta —
 *    e um número grande dá a impressão de que está entrando imóvel novo
 *    quando não está. Por isso a coluna que importa é **novos em 24h**, e
 *    "vistos em 24h" ao lado mostra que o coletor está vivo mesmo quando não
 *    achou nada novo.
 *
 * A outra coluna que decide onde investir é **oportunidades**: a Rede Gaúcha
 * tem 93% do catálogo fora da nossa carteira; a Auxiliadora, 0% (é nossa).
 */

type Fonte = {
  fonte: string;
  total: number;
  novos24h: number;
  novos7d: number;
  vistos24h: number;
  comEndereco: number;
  comMatricula: number;
  comContato: number;
  oportunidades: number;
};

type Rodada = {
  portal: string | null;
  quando: string;
  encontrados: number;
  novos: number;
  atualizados: number;
  erros: number;
  status: string;
  duracaoMs: number | null;
};

const nf = new Intl.NumberFormat("pt-BR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

const NOMES: Record<string, string> = {
  "redegauchadeimoveis.com.br": "Rede Gaúcha",
  "auxiliadorapredial.com.br": "Auxiliadora (nossa)",
  "guarida.com.br": "Guarida"
};

export default async function ExtracoesPage() {
  const supabase = createClient();
  const { data } = await supabase.rpc("painel_extracoes");

  const p = (data ?? {}) as {
    porFonte?: Fonte[];
    ultimasRodadas?: Rodada[];
    totalGeral?: number;
    novos24hGeral?: number;
  };
  const fontes = p.porFonte ?? [];
  const rodadas = p.ultimasRodadas ?? [];

  return (
    <div>
      <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>Coleta</h1>
      <p style={{ color: "#666", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6, maxWidth: 700 }}>
        O coletor revisita o catálogo inteiro em ciclo, então{" "}
        <b>total extraído não é o que importa</b> — na segunda volta quase tudo
        é atualização. Olhe <b>novos em 24h</b> para descoberta e{" "}
        <b>vistos em 24h</b> para saber se o coletor está vivo.
      </p>

      <div style={faixa}>
        <Num v={nf.format(p.totalGeral ?? 0)} r="imóveis na base" />
        <Num v={nf.format(p.novos24hGeral ?? 0)} r="novos nas últimas 24h" destaque />
        <Num
          v={nf.format(fontes.reduce((a, f) => a + f.oportunidades, 0))}
          r="oportunidades (não são nossas)"
        />
        <Num v={String(fontes.length)} r="fontes coletando" />
      </div>

      <h2 style={h2}>Por fonte</h2>
      <div style={{ ...cartao, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
          <thead style={{ background: "#f6f7f9" }}>
            <tr>
              <Th>Fonte</Th><Th>Total</Th><Th>Novos 24h</Th><Th>Vistos 24h</Th>
              <Th>Com endereço</Th><Th>Com matrícula</Th><Th>Com contato</Th>
              <Th>Oportunidades</Th>
            </tr>
          </thead>
          <tbody>
            {fontes.map((f) => (
              <tr key={f.fonte} style={{ borderTop: "1px solid #eee" }}>
                <Td>
                  <b>{NOMES[f.fonte] ?? f.fonte}</b>
                  <div style={{ fontSize: 11, color: "#999" }}>{f.fonte}</div>
                </Td>
                <Td>{nf.format(f.total)}</Td>
                <Td>
                  <b style={{ color: f.novos24h > 0 ? "#157f3c" : "#999" }}>
                    {f.novos24h > 0 ? `+${nf.format(f.novos24h)}` : "—"}
                  </b>
                </Td>
                <Td style={{ color: f.vistos24h > 0 ? "#333" : "#c00" }}>
                  {f.vistos24h > 0 ? nf.format(f.vistos24h) : "parado"}
                </Td>
                <Td>{pct(f.comEndereco, f.total)}%</Td>
                <Td>{nf.format(f.comMatricula)}</Td>
                <Td>{pct(f.comContato, f.total)}%</Td>
                <Td>
                  <b>{nf.format(f.oportunidades)}</b>
                  <span style={{ color: "#888" }}> · {pct(f.oportunidades, f.total)}%</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={h2}>Últimas rodadas</h2>
      <div style={{ ...cartao, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 620 }}>
          <thead style={{ background: "#f6f7f9" }}>
            <tr>
              <Th>Quando</Th><Th>Portal</Th><Th>Visitados</Th>
              <Th>Novos</Th><Th>Atualizados</Th><Th>Falhas</Th><Th>Duração</Th>
            </tr>
          </thead>
          <tbody>
            {rodadas.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, color: "#888" }}>Sem rodadas registradas.</td></tr>
            ) : rodadas.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #f2f2f2" }}>
                <Td>{new Date(r.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Td>
                <Td>{NOMES[r.portal ?? ""] ?? r.portal ?? "—"}</Td>
                <Td>{nf.format(r.encontrados)}</Td>
                <Td>
                  <b style={{ color: r.novos > 0 ? "#157f3c" : "#999" }}>
                    {r.novos > 0 ? `+${r.novos}` : "0"}
                  </b>
                </Td>
                <Td style={{ color: "#888" }}>{nf.format(r.atualizados)}</Td>
                <Td style={{ color: r.erros > 0 ? "#b45309" : "#999" }}>{r.erros}</Td>
                <Td style={{ color: "#888" }}>
                  {r.duracaoMs ? `${Math.round(r.duracaoMs / 1000)}s` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={nota}>
        <b>Coletando sozinho, via `pg_cron`:</b> Rede Gaúcha a cada 10 min (60
        por lote), casamento com o ITBI a cada 15 min, enriquecimento duas vezes
        por hora. Não depende de máquina ligada.
        <div style={{ marginTop: 6 }}>
          <b>Fontes sondadas e ainda não coletadas:</b> Lopes (renderiza no
          cliente, sem dado no HTML) e Hoffmann (501 imóveis, quase todos em
          Arroio do Sal — fora da cobertura do ITBI de POA).{" "}
          <b>Descartadas por `robots.txt`:</b> Chaves na Mão, Casa Imóveis,
          Imobiliária Tempo, Cristofoli.
        </div>
      </div>
    </div>
  );
}

function Num({ v, r, destaque }: { v: string; r: string; destaque?: boolean }) {
  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.6,
                    color: destaque ? "#157f3c" : "#111" }}>{v}</div>
      <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>{r}</div>
    </div>
  );
}
const Th = ({ children }: { children?: React.ReactNode }) => (
  <th style={{ padding: "9px 10px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 600 }}>
    {children}
  </th>
);
const Td = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
  <td style={{ padding: "9px 10px", ...style }}>{children}</td>
);

const faixa: React.CSSProperties = {
  background: "#fff", border: "1px solid #e8ecef", borderRadius: 12,
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  marginBottom: 22, overflow: "hidden"
};
const cartao: React.CSSProperties = {
  background: "#fff", border: "1px solid #e8ecef", borderRadius: 12, marginBottom: 20
};
const h2: React.CSSProperties = { fontSize: 15, margin: "0 0 10px" };
const nota: React.CSSProperties = {
  background: "#f6f9fc", border: "1px solid #dde7f0", borderRadius: 10,
  padding: "12px 15px", fontSize: 12.5, color: "#456", lineHeight: 1.6
};
