"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const FONTES = [
  { key: "rgi-poa", label: "Rede Gaucha" },
  { key: "zap-poa", label: "ZAP Imoveis" },
  { key: "vr-poa", label: "VivaReal" },
];

export default function ExtrairButton() {
  const router = useRouter();
  const [selected, setSelected] = useState("rgi-poa");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function rodar() {
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch("/api/extracoes/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scraperKey: selected, maxItems: 30 }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(`erro: ${j.error ?? r.status}`);
        return;
      }
      setMsg(`${j.totalNovos} novos / ${j.totalEncontrados} encontrados (${Math.round(j.duracaoMs / 1000)}s)`);
      router.refresh();
    } catch (e) {
      setMsg(`erro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={loading}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #ccc",
          fontSize: 13,
          background: "#fff",
        }}
      >
        {FONTES.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={rodar}
        disabled={loading}
        style={{
          background: "#0a7c3a",
          color: "#fff",
          border: 0,
          padding: "9px 14px",
          borderRadius: 8,
          fontSize: 13,
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Extraindo..." : "Extrair"}
      </button>
      {msg && <span style={{ fontSize: 12, color: "#555" }}>{msg}</span>}
    </div>
  );
}
