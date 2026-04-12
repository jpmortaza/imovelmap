import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // get_lease_atual usa auth.uid() internamente, chamamos via client autenticado
  const { data: leaseRows, error: leaseErr } = await supabase.rpc(
    "get_lease_atual",
    { p_dia: new Date().toISOString().slice(0, 10) }
  );

  if (leaseErr) {
    return NextResponse.json({ error: leaseErr.message }, { status: 500 });
  }

  if (!leaseRows || leaseRows.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Buscar dados dos imoveis via service role (imoveis pode ter RLS restrito)
  const imovelIds = leaseRows.map((r: { imovel_id: string }) => r.imovel_id);

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: imoveis, error: imErr } = await svc
    .from("imoveis")
    .select("*")
    .in("id", imovelIds);

  if (imErr) {
    return NextResponse.json({ error: imErr.message }, { status: 500 });
  }

  const imoveisMap = new Map(
    (imoveis ?? []).map((im: { id: string }) => [im.id, im])
  );

  const items = leaseRows.map((row: { imovel_id: string }) => ({
    ...row,
    imovel: imoveisMap.get(row.imovel_id) ?? null,
  }));

  return NextResponse.json({ items });
}
