"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

// Os filtros que importam para AGENCIAMENTO, não para quem quer comprar:
// quem tem telefone, quem é proprietário direto, quem já tem endereço
// resolvido e quem está mais quente. É outro produto que o portal.
export default function BuscarForm({ cidades }: { cidades: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(sp.get("q") ?? "");
  const [cidade, setCidade] = useState(sp.get("cidade") ?? "");
  const [tipo, setTipo] = useState(sp.get("tipo") ?? "");
  const [bairro, setBairro] = useState(sp.get("bairro") ?? "");
  const [quartosMin, setQuartosMin] = useState(sp.get("quartos_min") ?? "");
  const [precoMin, setPrecoMin] = useState(sp.get("preco_min") ?? "");
  const [precoMax, setPrecoMax] = useState(sp.get("preco_max") ?? "");
  const [areaMin, setAreaMin] = useState(sp.get("area_min") ?? "");
  const [ordem, setOrdem] = useState(sp.get("ordem") ?? "recentes");
  const [comTelefone, setComTelefone] = useState(sp.get("com_telefone") === "1");
  const [fsbo, setFsbo] = useState(sp.get("fsbo") === "1");
  const [comEndereco, setComEndereco] = useState(sp.get("com_endereco") === "1");
  const [comMatricula, setComMatricula] = useState(sp.get("com_matricula") ?? "");
  const [semAux, setSemAux] = useState(sp.get("sem_auxiliadora") === "1");

  function aplicar(e?: React.FormEvent) {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (cidade) p.set("cidade", cidade);
    if (tipo) p.set("tipo", tipo);
    if (bairro.trim()) p.set("bairro", bairro.trim());
    if (quartosMin) p.set("quartos_min", quartosMin);
    if (precoMin) p.set("preco_min", precoMin);
    if (precoMax) p.set("preco_max", precoMax);
    if (areaMin) p.set("area_min", areaMin);
    if (ordem && ordem !== "recentes") p.set("ordem", ordem);
    if (comTelefone) p.set("com_telefone", "1");
    if (fsbo) p.set("fsbo", "1");
    if (comEndereco) p.set("com_endereco", "1");
    if (comMatricula) p.set("com_matricula", comMatricula);
    if (semAux) p.set("sem_auxiliadora", "1");
    // filtro novo sempre volta para a página 1
    startTransition(() => router.push(`/imoveis${p.toString() ? "?" + p : ""}`));
  }

  function limpar() {
    setQ(""); setCidade(""); setTipo(""); setBairro("");
    setQuartosMin(""); setPrecoMin(""); setPrecoMax(""); setAreaMin("");
    setOrdem("recentes"); setComTelefone(false); setFsbo(false); setComEndereco(false);
    setComMatricula(""); setSemAux(false);
    startTransition(() => router.push("/imoveis"));
  }

  return (
    <form onSubmit={aplicar} style={caixa}>
      <div style={linha}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar por título, bairro, rua…"
          style={{ ...input, flex: 2, minWidth: 220 }}
        />
        <select value={cidade} onChange={(e) => setCidade(e.target.value)} style={input}>
          <option value="">Todas as cidades</option>
          {cidades.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={bairro}
          onChange={(e) => setBairro(e.target.value)}
          placeholder="bairro"
          style={input}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={input}>
          <option value="">Venda e aluguel</option>
          <option value="sale">Venda</option>
          <option value="rent">Aluguel</option>
        </select>
      </div>

      <div style={linha}>
        <input value={quartosMin} onChange={(e) => setQuartosMin(e.target.value)}
          placeholder="quartos min" type="number" min={0} style={{ ...input, width: 118 }} />
        <input value={areaMin} onChange={(e) => setAreaMin(e.target.value)}
          placeholder="área min m²" type="number" min={0} style={{ ...input, width: 130 }} />
        <input value={precoMin} onChange={(e) => setPrecoMin(e.target.value)}
          placeholder="preço mín" type="number" min={0} style={{ ...input, width: 128 }} />
        <input value={precoMax} onChange={(e) => setPrecoMax(e.target.value)}
          placeholder="preço máx" type="number" min={0} style={{ ...input, width: 128 }} />
        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={input}>
          <option value="recentes">Mais recentes</option>
          <option value="quentes">🔥 Mais quentes</option>
          <option value="baratos">Menor preço</option>
          <option value="caros">Maior preço</option>
          <option value="antigos">Mais tempo no mercado</option>
          <option value="dono_antigo">Dono há mais tempo</option>
        </select>
        {/* ⭐ o filtro que transforma a base em lista de trabalho: saber a
            matrícula é saber por onde chegar ao nome do proprietário */}
        <select
          value={comMatricula}
          onChange={(e) => setComMatricula(e.target.value)}
          style={{ ...input, minWidth: 190 }}
        >
          <option value="">Matrícula: tanto faz</option>
          <option value="1">📜 só com matrícula certa</option>
          <option value="2">📜 matrícula certa ou candidata</option>
        </select>
      </div>

      <div style={{ ...linha, alignItems: "center" }}>
        <Marcador ligado={fsbo} set={setFsbo} cor="#7f1d1d">
          🔥 só proprietário direto
        </Marcador>
        <Marcador ligado={comTelefone} set={setComTelefone} cor="#157f3c">
          📞 só com telefone
        </Marcador>
        <Marcador ligado={comEndereco} set={setComEndereco} cor="#1e3a5f">
          📍 só com endereço
        </Marcador>
        {/* nós SOMOS a Auxiliadora: o que já é dela não é oportunidade */}
        <Marcador ligado={semAux} set={setSemAux} cor="#0b6bcb">
          🔵 esconder a Auxiliadora
        </Marcador>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" onClick={limpar} style={btnSec}>limpar</button>
          <button type="submit" disabled={pending} style={btn}>
            {pending ? "buscando…" : "Filtrar"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Marcador({
  ligado, set, cor, children
}: {
  ligado: boolean;
  set: (v: boolean) => void;
  cor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
        fontSize: 12.5, padding: "6px 11px", borderRadius: 999,
        border: `1px solid ${ligado ? cor : "#ddd"}`,
        background: ligado ? cor : "#fff",
        color: ligado ? "#fff" : "#555",
        fontWeight: ligado ? 700 : 400
      }}
    >
      <input
        type="checkbox"
        checked={ligado}
        onChange={(e) => set(e.target.checked)}
        style={{ display: "none" }}
      />
      {children}
    </label>
  );
}

const caixa: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.05)"
};
const linha: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const input: React.CSSProperties = {
  padding: "9px 11px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 13,
  outline: "none"
};
const btn: React.CSSProperties = {
  background: "#111", color: "#fff", border: 0, borderRadius: 8,
  padding: "9px 18px", fontSize: 13, cursor: "pointer"
};
const btnSec: React.CSSProperties = {
  background: "#fff", color: "#555", border: "1px solid #ddd", borderRadius: 8,
  padding: "9px 14px", fontSize: 13, cursor: "pointer"
};
