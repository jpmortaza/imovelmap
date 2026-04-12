import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { distribuicaoId, outcome, nota } = body as {
    distribuicaoId?: string;
    outcome?: string;
    nota?: string;
  };

  if (!distribuicaoId) {
    return NextResponse.json(
      { error: "missing distribuicaoId" },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc("marcar_trabalhado", {
    p_distribuicao_id: distribuicaoId,
    p_outcome: outcome ?? null,
    p_nota: nota ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
