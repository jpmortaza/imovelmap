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

  const { data: notifs, error: notifErr } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("corretor_id", user.id)
    .eq("visualizada", false)
    .order("created_at", { ascending: false });

  if (notifErr) {
    return NextResponse.json({ error: notifErr.message }, { status: 500 });
  }

  if (!notifs || notifs.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Buscar dados dos imoveis
  const imovelIds = [
    ...new Set(notifs.map((n: { imovel_id: string }) => n.imovel_id)),
  ];

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: imoveis } = await svc
    .from("imoveis")
    .select("*")
    .in("id", imovelIds);

  const imoveisMap = new Map(
    (imoveis ?? []).map((im: { id: string }) => [im.id, im])
  );

  const items = notifs.map((n: { imovel_id: string }) => ({
    ...n,
    imovel: imoveisMap.get(n.imovel_id) ?? null,
  }));

  return NextResponse.json({ items });
}

export async function PUT(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { ids } = body as { ids?: string[] };

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "missing ids array" }, { status: 400 });
  }

  const { error } = await supabase
    .from("notificacoes")
    .update({ visualizada: true })
    .in("id", ids)
    .eq("corretor_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
