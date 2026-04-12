import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("alertas")
    .select("*")
    .eq("corretor_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
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
  const {
    nome,
    city,
    neighborhood,
    transaction_type,
    property_type,
    price_min,
    price_max,
    area_min,
    area_max,
    bedrooms_min,
    bathrooms_min,
    parking_min,
    notificar_email,
  } = body as Record<string, unknown>;

  if (!nome) {
    return NextResponse.json({ error: "missing nome" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("alertas")
    .insert({
      corretor_id: user.id,
      nome,
      city: city ?? null,
      neighborhood: neighborhood ?? null,
      transaction_type: transaction_type ?? null,
      property_type: property_type ?? null,
      price_min: price_min ?? null,
      price_max: price_max ?? null,
      area_min: area_min ?? null,
      area_max: area_max ?? null,
      bedrooms_min: bedrooms_min ?? null,
      bathrooms_min: bathrooms_min ?? null,
      parking_min: parking_min ?? null,
      notificar_email: notificar_email ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alerta: data });
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
  const { id, ...fields } = body as { id?: string; [key: string]: unknown };

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  // Remove campos que nao devem ser alterados pelo client
  delete fields.corretor_id;
  delete fields.created_at;
  delete fields.updated_at;

  const { data, error } = await supabase
    .from("alertas")
    .update(fields)
    .eq("id", id)
    .eq("corretor_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, alerta: data });
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
  const { id } = body as { id?: string };

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("alertas")
    .delete()
    .eq("id", id)
    .eq("corretor_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
