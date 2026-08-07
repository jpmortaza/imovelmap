import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cidades e bairros disponíveis, para o admin atribuir território ao corretor.
 *
 * Só bairro que EXISTE na base entra na lista — atribuir um bairro sem imóvel
 * daria um painel vazio e a impressão de que o produto não funciona.
 */
export async function GET(req: Request) {
  const sessao = createClient();
  const {
    data: { user }
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "nao autenticado" }, { status: 401 });

  const { data: eu } = await sessao
    .from("corretores")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (eu?.role !== "super_admin" && eu?.role !== "admin") {
    return NextResponse.json({ error: "somente admin" }, { status: 403 });
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const cidade = new URL(req.url).searchParams.get("cidade");

  if (!cidade) {
    const { data, error } = await svc.rpc("cidades_com_imoveis");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cidades: data ?? [] });
  }

  const { data, error } = await svc.rpc("bairros_da_cidade", { p_cidade: cidade });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bairros: data ?? [] });
}
