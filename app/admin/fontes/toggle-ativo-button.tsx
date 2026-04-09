"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ToggleAtivoButton({
  id,
  ativo
}: {
  id: string;
  ativo: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("fontes").update({ ativo: !ativo }).eq("id", id);
    setBusy(false);
    start(() => router.refresh());
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        padding: "6px 10px",
        borderRadius: 6,
        fontSize: 12,
        opacity: busy ? 0.5 : 1
      }}
    >
      {ativo ? "Pausar" : "Ativar"}
    </button>
  );
}
