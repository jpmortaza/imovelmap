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

  const { data: favs, error: favErr } = await supabase
    .from("favoritos")
    .select("*")
    .eq("corretor_id", user.id)
    .order("created_at", { ascending: false });

  if (favErr) {
    return NextResponse.json({ error: favErr.message }, { status: 500 });
  }

  if (!favs || favs.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Buscar dados dos imoveis
  const imovelIds = favs.map((f: { imovel_id: string }) => f.imovel_id);

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

  const items = favs.map((f: { imovel_id: string }) => ({
    ...f,
    imovel: imoveisMap.get(f.imovel_id) ?? null,
  }));

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { imovelId, nota } = body as { imovelId?: string; nota?: string };

  if (!imovelId) {
    return NextResponse.json({ error: "missing imovelId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("favoritos")
    .insert({ corretor_id: user.id, imovel_id: imovelId, nota: nota ?? null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, favorito: data });
}

export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { imovelId } = body as { imovelId?: string };

  if (!imovelId) {
    return NextResponse.json({ error: "missing imovelId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("favoritos")
    .delete()
    .eq("corretor_id", user.id)
    .eq("imovel_id", imovelId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
