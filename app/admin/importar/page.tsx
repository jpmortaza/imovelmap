"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Importar base própria de contatos e ligar aos imóveis pelo endereço.
 *
 * O arquivo é lido NO NAVEGADOR e enviado em pedaços de 500 linhas — nada de
 * upload de arquivo inteiro, que estouraria o limite da rota e não daria
 * progresso nenhum ao Jean.
 *
 * A declaração de origem e base legal é obrigatória de propósito: é o que
 * permite auditar de onde veio um contato depois, e apagar a base inteira
 * (inclusive de dentro de cada imóvel) se um titular pedir exclusão.
 */

type Campo =
  | "ignorar" | "nome" | "ddd" | "telefone" | "email" | "documento"
  | "nascimento" | "logradouro" | "numero" | "complemento" | "bairro"
  | "cep" | "cidade" | "estado" | "observacao";

const CAMPOS: { v: Campo; r: string }[] = [
  { v: "ignorar", r: "— ignorar —" },
  { v: "nome", r: "Nome" },
  { v: "ddd", r: "DDD" },
  { v: "telefone", r: "Telefone" },
  { v: "email", r: "E-mail" },
  { v: "documento", r: "CPF / CNPJ" },
  { v: "nascimento", r: "Nascimento" },
  { v: "logradouro", r: "Rua / logradouro" },
  { v: "numero", r: "Número" },
  { v: "complemento", r: "Complemento (apto)" },
  { v: "bairro", r: "Bairro" },
  { v: "cep", r: "CEP" },
  { v: "cidade", r: "Cidade" },
  { v: "estado", r: "Estado / UF" },
  { v: "observacao", r: "Observação" }
];

const BASES = [
  { v: "consentimento", r: "Consentimento do titular" },
  { v: "contrato", r: "Execução de contrato (cliente nosso)" },
  { v: "legitimo_interesse", r: "Legítimo interesse" },
  { v: "obrigacao_legal", r: "Obrigação legal" },
  { v: "publica", r: "Base de acesso público" }
];

type Importacao = {
  id: string;
  nome: string;
  origem: string;
  base_legal: string;
  linhas: number;
  criado_em: string;
};

/** separador: o que aparecer mais na primeira linha entre ; , e tab */
function detectarSep(linha: string) {
  const c = [";", ",", "\t"].map((s) => [s, linha.split(s).length] as const);
  return c.sort((a, b) => b[1] - a[1])[0][0];
}

/** divide respeitando aspas — campo com vírgula dentro é comum em endereço */
function dividir(linha: string, sep: string) {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      out.push(atual); atual = "";
    } else atual += ch;
  }
  out.push(atual);
  return out.map((x) => x.trim());
}

export default function ImportarPage() {
  const [lista, setLista] = useState<Importacao[]>([]);
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [amostra, setAmostra] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Campo[]>([]);
  const [sep, setSep] = useState(";");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const [nome, setNome] = useState("");
  const [origem, setOrigem] = useState("");
  const [baseLegal, setBaseLegal] = useState("");
  const [observacao, setObservacao] = useState("");

  const [rodando, setRodando] = useState(false);
  // progresso de verdade: etapa + quanto já foi, para o Jean saber que a
  // importação está viva. Arquivo grande leva minutos e um botão "importando…"
  // parado parece travado.
  const [etapa, setEtapa] = useState<string | null>(null);
  const [feito, setFeito] = useState(0);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/importar");
    const j = await r.json();
    setLista(j.importacoes ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function escolher(f: File) {
    setArquivo(f);
    setMsg(null);
    // lê só o começo para montar o mapeamento
    const texto = await f.slice(0, 200_000).text();
    const linhas = texto.split(/\r?\n/).filter(Boolean);
    if (!linhas.length) return;
    const s = detectarSep(linhas[0]);
    setSep(s);
    const cab = dividir(linhas[0], s);
    setCabecalho(cab);
    setAmostra(linhas.slice(1, 4).map((l) => dividir(l, s)));
    // palpite: casa o nome da coluna com o campo
    setMapa(
      cab.map((c) => {
        const n = c.toLowerCase();
        if (/nome|razao|cliente/.test(n) && !/mae|mãe/.test(n)) return "nome";
        // DDD antes de telefone: "ddd" casaria com nada, mas a ordem importa
        // porque planilha tem "ddd" e "telefone" como colunas separadas
        if (/^ddd$/.test(n) || /\bddd\b/.test(n)) return "ddd";
        if (/tel|fone|celular|whats/.test(n)) return "telefone";
        if (/mail/.test(n)) return "email";
        if (/cpf|cnpj|documento|^doc$/.test(n)) return "documento";
        if (/nasc|aniver|dt_?nasc|data.?nasc/.test(n)) return "nascimento";
        if (/logradouro|endereco|endereço|rua/.test(n)) return "logradouro";
        if (/^n(umero|úmero|um|r)?\.?$/.test(n)) return "numero";
        if (/compl/.test(n)) return "complemento";
        if (/bairro/.test(n)) return "bairro";
        if (/cep/.test(n)) return "cep";
        if (/cidade|municipio|município|localidade/.test(n)) return "cidade";
        if (/^(uf|estado)$/.test(n) || /\buf\b|estado/.test(n)) return "estado";
        return "ignorar";
      })
    );
    if (!nome) setNome(f.name.replace(/\.[^.]+$/, ""));
  }

  const temEndereco = mapa.includes("logradouro") || mapa.includes("cep");

  async function importar() {
    if (!arquivo || !nome.trim() || !origem.trim() || !baseLegal) {
      setMsg("Preencha nome, origem e base legal, e escolha o arquivo.");
      return;
    }
    if (!temEndereco) {
      setMsg("Mapeie ao menos a rua ou o CEP — é por eles que ligamos ao imóvel.");
      return;
    }
    setRodando(true);
    setMsg(null);
    setFeito(0);
    setTotalLinhas(0);
    setEtapa("criando o lote…");
    try {
      const rc = await fetch("/api/admin/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar", nome, origem, baseLegal, observacao })
      });
      const jc = await rc.json();
      if (!rc.ok) throw new Error(jc.error);
      const id = jc.id as string;

      setEtapa("lendo o arquivo…");
      const texto = await arquivo.text();
      const linhas = texto.split(/\r?\n/).filter(Boolean).slice(1);
      let enviadas = 0;
      const LOTE = 500;
      setTotalLinhas(linhas.length);
      setEtapa("enviando");

      for (let i = 0; i < linhas.length; i += LOTE) {
        const itens = linhas.slice(i, i + LOTE).map((l) => {
          const v = dividir(l, sep);
          const o: Record<string, string> = {};
          mapa.forEach((campo, idx) => {
            if (campo !== "ignorar" && v[idx]) o[campo] = v[idx];
          });
          return o;
        });
        const r = await fetch("/api/admin/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "linhas", id, itens })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        enviadas += j.inseridas ?? 0;
        setFeito(Math.min(i + LOTE, linhas.length));
      }

      setEtapa("cruzando com os imóveis…");
      const rm = await fetch("/api/admin/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "casar", id })
      });
      const jm = await rm.json();
      setMsg(
        `Importadas ${enviadas} linhas. Ligadas a imóveis: ` +
          `${jm.naUnidade ?? 0} na unidade exata, ${jm.noPredio ?? 0} no prédio.`
      );
      setEtapa(null);
      setArquivo(null);
      setCabecalho([]);
      if (inputRef.current) inputRef.current.value = "";
      await carregar();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "erro na importação");
      setEtapa(null);
    } finally {
      setRodando(false);
    }
  }

  async function apagar(id: string, nomeBase: string) {
    if (!confirm(`Apagar "${nomeBase}"? Os contatos somem também de dentro dos imóveis.`)) return;
    const r = await fetch(`/api/admin/importar?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    setMsg(r.ok ? `Apagados ${j.linhasApagadas} contatos de ${j.imoveisLimpos} imóveis.` : j.error);
    await carregar();
  }

  return (
    <div>
      <style>{`
        @keyframes im-desliza { from { background-position: 0 0 } to { background-position: 28px 0 } }
        @keyframes im-gira { to { transform: rotate(360deg) } }
      `}</style>
      <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>Importar base de contatos</h1>
      <p style={{ color: "#666", fontSize: 13.5, margin: "0 0 20px", lineHeight: 1.6, maxWidth: 720 }}>
        Sobe uma planilha sua e liga cada contato ao imóvel pelo endereço. Casa
        por rua + número + apartamento quando dá, e por rua + número quando o
        apartamento não vem. Aparece na página do imóvel junto com os demais
        contatos, marcado com a origem.
      </p>

      <div style={aviso}>
        <b>Só suba base cuja origem você consegue explicar.</b> A declaração
        abaixo fica gravada e é o que permite apagar tudo depois — inclusive de
        dentro de cada imóvel — se um titular pedir exclusão ou a origem se
        mostrar ruim.
        <div style={{ marginTop: 7 }}>
          CPF e nascimento são aceitos, mas só mapeie se você realmente for
          usá-los: coluna marcada como “ignorar” não sai do seu computador. Na
          página do imóvel o CPF aparece <b>mascarado</b> — o corretor não
          precisa dele para ligar.
        </div>
      </div>

      <div style={cartao}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Campo r="Nome da base" larg={230}>
              <input value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="ex.: clientes Auxiliadora 2024" style={input} />
            </Campo>
            <Campo r="De onde veio" larg={260}>
              <input value={origem} onChange={(e) => setOrigem(e.target.value)}
                placeholder="ex.: CRM próprio, exportado em 08/2026" style={input} />
            </Campo>
            <Campo r="Base legal (LGPD)" larg={230}>
              <select value={baseLegal} onChange={(e) => setBaseLegal(e.target.value)} style={input}>
                <option value="">selecione…</option>
                {BASES.map((b) => <option key={b.v} value={b.v}>{b.r}</option>)}
              </select>
            </Campo>
          </div>
          <Campo r="Observação (opcional)" larg={0}>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="qualquer coisa que ajude a lembrar o contexto" style={input} />
          </Campo>

          <div>
            <input ref={inputRef} type="file" accept=".csv,.txt,.tsv"
              onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])}
              style={{ fontSize: 13 }} />
          </div>
        </div>
      </div>

      {cabecalho.length > 0 && (
        <div style={cartao}>
          <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>
            De qual coluna vem cada coisa
          </h2>
          <p style={{ fontSize: 12.5, color: "#777", margin: "0 0 12px" }}>
            Separador detectado: <code>{sep === "\t" ? "tab" : sep}</code> ·{" "}
            {cabecalho.length} colunas. Deixe em “ignorar” tudo que não precisa —
            coluna ignorada não é enviada nem armazenada.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: "100%" }}>
              <tbody>
                {cabecalho.map((c, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{c}</td>
                    <td style={{ padding: "6px 10px", color: "#999", maxWidth: 260, overflow: "hidden",
                                 textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {amostra.map((a) => a[i]).filter(Boolean)[0] ?? "—"}
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <select
                        value={mapa[i] ?? "ignorar"}
                        onChange={(e) => {
                          const m = [...mapa];
                          m[i] = e.target.value as Campo;
                          setMapa(m);
                        }}
                        style={{ ...input, padding: "5px 8px", fontSize: 12.5, width: 190 }}
                      >
                        {CAMPOS.map((k) => <option key={k.v} value={k.v}>{k.r}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!temEndereco && (
            <div style={{ ...aviso, background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b", marginTop: 12 }}>
              Mapeie ao menos <b>rua</b> ou <b>CEP</b> — é por eles que o contato
              encontra o imóvel.
            </div>
          )}

          <button onClick={importar} disabled={rodando || !temEndereco} style={{ ...btn, marginTop: 14 }}>
            {rodando ? "importando…" : "Importar e cruzar"}
          </button>

          {rodando && (
            <div style={caixaProgresso}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>
                  <span style={girando}>◐</span> {etapa}
                  {etapa === "enviando" && totalLinhas > 0 && (
                    <> {feito.toLocaleString("pt-BR")} de {totalLinhas.toLocaleString("pt-BR")} linhas</>
                  )}
                </span>
                {etapa === "enviando" && totalLinhas > 0 && (
                  <b>{Math.round((feito / totalLinhas) * 100)}%</b>
                )}
              </div>
              <div style={trilho}>
                <div
                  style={{
                    ...barra,
                    width:
                      etapa === "enviando" && totalLinhas > 0
                        ? `${Math.round((feito / totalLinhas) * 100)}%`
                        : "100%",
                    // sem total conhecido a barra fica listrada e animada, para
                    // não fingir uma porcentagem que não existe
                    ...(etapa === "enviando" && totalLinhas > 0 ? null : indeterminada)
                  }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: "#777", marginTop: 6 }}>
                Não feche esta aba — o arquivo é lido aqui no navegador e enviado
                em pedaços de 500 linhas.
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <div style={caixaMsg}>{msg}</div>}

      <div style={{ ...cartao, padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f6f7f9" }}>
            <tr>
              <Th>Base</Th><Th>Origem</Th><Th>Base legal</Th><Th>Linhas</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 22, color: "#888" }}>
                Nenhuma base importada ainda.
              </td></tr>
            ) : lista.map((im) => (
              <tr key={im.id} style={{ borderTop: "1px solid #eee" }}>
                <Td><b>{im.nome}</b></Td>
                <Td><span style={{ color: "#666" }}>{im.origem}</span></Td>
                <Td>
                  <span style={pilula}>
                    {BASES.find((b) => b.v === im.base_legal)?.r ?? im.base_legal}
                  </span>
                </Td>
                <Td>{im.linhas.toLocaleString("pt-BR")}</Td>
                <Td>
                  <button onClick={() => apagar(im.id, im.nome)} style={btnPerigo}>
                    apagar tudo
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Campo({ r, larg, children }: { r: string; larg: number; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, width: larg || "100%" }}>
      <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 }}>{r}</span>
      {children}
    </label>
  );
}
const Th = ({ children }: { children?: React.ReactNode }) => (
  <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, color: "#666", fontWeight: 600 }}>{children}</th>
);
const Td = ({ children }: { children?: React.ReactNode }) => (
  <td style={{ padding: "10px 12px" }}>{children}</td>
);

const cartao: React.CSSProperties = {
  background: "#fff", borderRadius: 12, padding: 18, marginBottom: 14,
  border: "1px solid #e8ecef"
};
const input: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid #ddd", borderRadius: 7,
  fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box"
};
const btn: React.CSSProperties = {
  background: "#111", color: "#fff", border: 0, borderRadius: 8,
  padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer"
};
const btnPerigo: React.CSSProperties = {
  background: "#fff", color: "#991b1b", border: "1px solid #fecaca",
  borderRadius: 7, padding: "6px 11px", fontSize: 12, cursor: "pointer"
};
const pilula: React.CSSProperties = {
  background: "#eef2ff", color: "#4338ca", borderRadius: 999,
  padding: "3px 10px", fontSize: 11.5, fontWeight: 600
};
const aviso: React.CSSProperties = {
  background: "#fff8ed", border: "1px solid #f0d9a0", color: "#7a5600",
  borderRadius: 10, padding: "12px 15px", fontSize: 13, lineHeight: 1.55,
  marginBottom: 14, maxWidth: 760
};
const caixaProgresso: React.CSSProperties = {
  marginTop: 14, background: "#f6f9fc", border: "1px solid #dde7f0",
  borderRadius: 10, padding: "12px 14px"
};
const trilho: React.CSSProperties = {
  height: 8, background: "#e3ebf2", borderRadius: 99,
  overflow: "hidden", marginTop: 8
};
const barra: React.CSSProperties = {
  height: "100%", background: "#157f3c", borderRadius: 99,
  transition: "width .25s ease"
};
const indeterminada: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg,#157f3c 0 10px,#1a9c4a 10px 20px)",
  animation: "im-desliza 1s linear infinite"
};
const girando: React.CSSProperties = {
  display: "inline-block", marginRight: 5, animation: "im-gira 1s linear infinite"
};

const caixaMsg: React.CSSProperties = {
  background: "#eef2ff", color: "#3b4ec2", borderRadius: 8,
  padding: "11px 15px", fontSize: 13.5, marginBottom: 14
};
