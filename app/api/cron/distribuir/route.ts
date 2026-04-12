import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Verificar CRON_SECRET
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const hoje = new Date().toISOString().slice(0, 10);

  // 1. Distribuir imoveis do dia
  const { data: distCount, error: distErr } = await svc.rpc(
    "distribuir_imoveis_do_dia",
    { p_dia: hoje }
  );

  if (distErr) {
    return NextResponse.json(
      { error: `distribuir_imoveis_do_dia: ${distErr.message}` },
      { status: 500 }
    );
  }

  // 2. Match alertas (pode nao existir ainda a funcao)
  let alertasCount: number | null = null;
  const { data: matchCount, error: matchErr } = await svc.rpc(
    "match_alertas_novos",
    { p_dia: hoje }
  );

  if (!matchErr) {
    alertasCount = matchCount as number;
  }

  return NextResponse.json({
    ok: true,
    dia: hoje,
    distribuidos: distCount as number,
    notificacoes_criadas: alertasCount,
    match_alertas_error: matchErr?.message ?? null,
  });
}
