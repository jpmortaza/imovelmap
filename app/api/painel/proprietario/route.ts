import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const imovelId = url.searchParams.get("imovelId");

  if (!imovelId) {
    return NextResponse.json({ error: "missing imovelId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("proprietarios")
    .select("*")
    .eq("imovel_id", imovelId)
    .eq("corretor_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ proprietario: data });
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
    imovelId,
    imovel_id: imovelIdAlt,
    nome,
    telefone,
    email,
    cpf_cnpj,
    origem,
    status,
    notas,
  } = body as Record<string, unknown>;

  const resolvedImovelId = (imovelId || imovelIdAlt) as string | undefined;
  if (!resolvedImovelId) {
    return NextResponse.json({ error: "missing imovelId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("proprietarios")
    .insert({
      imovel_id: resolvedImovelId,
      corretor_id: user.id,
      nome: nome ?? null,
      telefone: telefone ?? null,
      email: email ?? null,
      cpf_cnpj: cpf_cnpj ?? null,
      origem: origem ?? null,
      status: status ?? "identificado",
      notas: notas ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proprietario: data });
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
  delete fields.imovel_id;
  delete fields.created_at;
  delete fields.updated_at;

  const { data, error } = await supabase
    .from("proprietarios")
    .update(fields)
    .eq("id", id)
    .eq("corretor_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, proprietario: data });
}
