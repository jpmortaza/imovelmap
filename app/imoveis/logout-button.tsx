"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        padding: "8px 14px",
        borderRadius: 8,
        fontSize: 14
      }}
    >
      Sair
    </button>
  );
}
