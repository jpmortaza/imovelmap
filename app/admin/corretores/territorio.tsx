"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Escolha de território: cidade + bairros.
 *
 * ⭐ Só entra bairro que EXISTE na base, com a contagem ao lado. Deixar digitar
 *    livre produziria "Petropolis" sem acento, que não casa com nada, e o
 *    corretor abriria um painel vazio culpando o produto.
 */
export default function Territorio({
  cidade,
  bairros,
  onChange,
  compacto
}: {
  cidade: string;
  bairros: string[];
  onChange: (cidade: string, bairros: string[]) => void;
  compacto?: boolean;
}) {
  const [cidades, setCidades] = useState<{ cidade: string; n: number }[]>([]);
  const [opcoes, setOpcoes] = useState<{ bairro: string; n: number }[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetch("/api/admin/territorios")
      .then((r) => r.json())
      .then((d) => setCidades(d.cidades ?? []))
      .catch(() => {});
  }, []);

  const carregarBairros = useCallback(async (c: string) => {
    if (!c) {
      setOpcoes([]);
      return;
    }
    setCarregando(true);
    try {
      const r = await fetch(`/api/admin/territorios?cidade=${encodeURIComponent(c)}`);
      const d = await r.json();
      setOpcoes(d.bairros ?? []);
    } catch {
      setOpcoes([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarBairros(cidade);
  }, [cidade, carregarBairros]);

  function alternar(b: string) {
    onChange(
      cidade,
      bairros.includes(b) ? bairros.filter((x) => x !== b) : [...bairros, b]
    );
  }

  const filtrados = busca.trim()
    ? opcoes.filter((o) => o.bairro.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;
  // sem filtro mostramos os 40 maiores; com filtro, tudo que casou
  const visiveis = busca.trim() ? filtrados : filtrados.slice(0, 40);
  const totalImoveis = filtrados.reduce((a, o) => a + o.n, 0);
  const todosMarcados =
    filtrados.length > 0 && filtrados.every((o) => bairros.includes(o.bairro));

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 200 }}>
          <span style={rotulo}>Cidade</span>
          <select
            value={cidade}
            onChange={(e) => onChange(e.target.value, [])}
            style={input}
          >
            <option value="">selecione…</option>
            {cidades.map((c) => (
              <option key={c.cidade} value={c.cidade}>
                {c.cidade} ({c.n})
              </option>
            ))}
          </select>
        </label>

        {cidade && (
          <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 180 }}>
            <span style={rotulo}>Filtrar bairros</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="digite para achar…"
              style={input}
            />
          </label>
        )}
      </div>

      {cidade && filtrados.length > 0 && (
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              onChange(
                cidade,
                todosMarcados
                  ? bairros.filter((b) => !filtrados.some((o) => o.bairro === b))
                  : [...new Set([...bairros, ...filtrados.map((o) => o.bairro)])]
              )
            }
            style={botaoTodos}
          >
            {todosMarcados ? "✕ desmarcar" : "✓ selecionar"}{" "}
            {busca.trim() ? `os ${filtrados.length} filtrados` : `todos os ${filtrados.length} bairros`}
          </button>
          <span style={{ fontSize: 11.5, color: "#888" }}>
            {totalImoveis.toLocaleString("pt-BR")} imóveis
          </span>
          {bairros.length > 0 && (
            <button type="button" onClick={() => onChange(cidade, [])} style={botaoLimpar}>
              limpar seleção
            </button>
          )}
        </div>
      )}

      {bairros.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {bairros.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => alternar(b)}
              style={selecionado}
              title="remover"
            >
              {b} ✕
            </button>
          ))}
        </div>
      )}

      {cidade && (
        <div style={{ ...caixa, maxHeight: compacto ? 150 : 210 }}>
          {carregando ? (
            <span style={{ color: "#888", fontSize: 12.5 }}>carregando bairros…</span>
          ) : visiveis.length === 0 ? (
            <span style={{ color: "#888", fontSize: 12.5 }}>nenhum bairro encontrado</span>
          ) : (
            visiveis.map((o) => (
              <button
                key={o.bairro}
                type="button"
                onClick={() => alternar(o.bairro)}
                style={{
                  ...opcao,
                  ...(bairros.includes(o.bairro)
                    ? { background: "#e7f6ec", borderColor: "#9ed4b3", color: "#157f3c" }
                    : null)
                }}
              >
                {o.bairro}
                <span style={{ color: "#999", marginLeft: 5 }}>{o.n}</span>
              </button>
            ))
          )}
          {!busca.trim() && filtrados.length > visiveis.length && (
            <span style={{ fontSize: 11.5, color: "#999", alignSelf: "center" }}>
              +{filtrados.length - visiveis.length} — digite para achar, ou use
              “selecionar todos”
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const botaoTodos: React.CSSProperties = {
  border: "1px solid #157f3c",
  background: "#e7f6ec",
  color: "#157f3c",
  borderRadius: 8,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};
const botaoLimpar: React.CSSProperties = {
  border: "1px solid #e2e6ea",
  background: "#fff",
  color: "#777",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer"
};
const rotulo: React.CSSProperties = {
  fontSize: 11,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 0.4
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 7,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box"
};
const caixa: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 9,
  padding: 9,
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  overflowY: "auto",
  background: "#fbfcfd"
};
const opcao: React.CSSProperties = {
  border: "1px solid #e2e6ea",
  background: "#fff",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 12.5,
  cursor: "pointer"
};
const selecionado: React.CSSProperties = {
  border: "1px solid #157f3c",
  background: "#157f3c",
  color: "#fff",
  borderRadius: 999,
  padding: "5px 11px",
  fontSize: 12.5,
  cursor: "pointer",
  fontWeight: 600
};
