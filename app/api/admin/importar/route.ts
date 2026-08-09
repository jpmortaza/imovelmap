import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Importação de bases próprias — só super_admin.
 *
 * ⚠️ Esta rota escreve dado pessoal no banco. Toda chamada passa pelo guard, e
 *    a criação de um lote EXIGE origem e base legal declaradas: é o que permite
 *    auditar de onde veio um contato meses depois e apagar a base inteira se a
 *    origem se revelar ruim ou um titular pedir exclusão.
 */
async function exigirSuperAdmin() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { erro: "não autenticado", status: 401 as const };

  const { data: me } = await supabase
    .from("corretores")
    .select("role, ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (me?.role !== "super_admin" || me?.ativo === false) {
    return { erro: "somente super_admin", status: 403 as const };
  }
  return { user };
}

function servico() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/** GET — lista as importações já feitas */
export async function GET() {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) return NextResponse.json({ error: guard.erro }, { status: guard.status });

  const svc = servico();
  const { data, error } = await svc
    .schema("publico")
    .from("importacoes")
    .select("id, nome, origem, base_legal, observacao, linhas, criado_em")
    .order("criado_em", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ importacoes: data ?? [] });
}

/**
 * POST — cria o lote (sem itens) ou envia um pedaço de linhas.
 *   { acao: "criar", nome, origem, baseLegal, observacao }  → { id }
 *   { acao: "linhas", id, itens: [...] }                    → { inseridas }
 *   { acao: "casar",  id }                                  → { naUnidade, noPredio }
 */
export async function POST(req: Request) {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) return NextResponse.json({ error: guard.erro }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const svc = servico();

  if (body.acao === "criar") {
    const { data, error } = await svc.rpc("criar_importacao", {
      p_nome: String(body.nome ?? ""),
      p_origem: String(body.origem ?? ""),
      p_base_legal: String(body.baseLegal ?? ""),
      p_observacao: body.observacao ? String(body.observacao) : null
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ id: data });
  }

  if (body.acao === "linhas") {
    if (!body.id) return NextResponse.json({ error: "id do lote obrigatório" }, { status: 400 });
    const itens = Array.isArray(body.itens) ? body.itens.slice(0, 1000) : [];
    if (!itens.length) return NextResponse.json({ inseridas: 0 });

    const { data, error } = await svc.rpc("carregar_contatos", {
      p_importacao: body.id,
      p_itens: itens
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ inseridas: data });
  }

  if (body.acao === "casar") {
    const { data, error } = await svc.rpc("casar_contatos_importados", {
      p_importacao: body.id ?? null,
      p_lote: 50000
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}

/** DELETE — apaga a importação e limpa os contatos dela de dentro dos imóveis */
export async function DELETE(req: Request) {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) return NextResponse.json({ error: guard.erro }, { status: guard.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const svc = servico();
  const { data, error } = await svc.rpc("apagar_importacao", { p_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
