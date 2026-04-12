"use client";

import { useState } from "react";

export default function FavoritarButton({ imovelId }: { imovelId: string }) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      if (saved) {
        await fetch("/api/painel/favoritos", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imovelId }),
        });
        setSaved(false);
      } else {
        const r = await fetch("/api/painel/favoritos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imovelId }),
        });
        if (r.ok) setSaved(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      disabled={loading}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: saved ? "#e53e3e" : "rgba(255,255,255,.85)",
        color: saved ? "#fff" : "#666",
        border: "none",
        borderRadius: "50%",
        width: 32,
        height: 32,
        fontSize: 16,
        cursor: loading ? "wait" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      title={saved ? "Remover dos favoritos" : "Adicionar aos favoritos"}
    >
      {saved ? "♥" : "♡"}
    </button>
  );
}
