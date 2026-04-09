"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunNowButton({ fonteSlug }: { fonteSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/extracoes/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fonteSlug })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      setMsg(`ok · ${j.extracaoId.slice(0, 8)}`);
      router.push("/admin/extracoes");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        style={{
          background: "#111",
          color: "#fff",
          border: 0,
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          opacity: busy ? 0.6 : 1
        }}
      >
        {busy ? "..." : "Extrair agora"}
      </button>
      {msg && <div style={{ fontSize: 11, color: "#666" }}>{msg}</div>}
    </>
  );
}
