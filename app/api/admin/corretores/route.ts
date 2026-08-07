import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ⚠️ Esta rota usa a service_role, que ignora RLS e cria usuário no Auth.
// TODA chamada passa por `exigirSuperAdmin` primeiro. Sem isso, qualquer
// corretor logado poderia se promover a admin — é o buraco clássico de
// painel administrativo.
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

/** GET — lista corretores */
export async function GET() {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) {
    return NextResponse.json({ error: guard.erro }, { status: guard.status });
  }

  const svc = servico();
  const { data, error } = await svc
    .from("corretores")
    .select("id, email, nome, telefone, creci, role, ativo, cota_diaria, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ corretores: data ?? [] });
}

/**
 * POST — cria corretor.
 *
 * Nunca definimos senha aqui: criamos a conta pela Admin API (que preenche
 * as colunas de token corretamente — `insert` direto em auth.users deixa
 * tudo NULL e quebra o login de TODO o projeto) e devolvemos um link de
 * acesso de uso único para o admin repassar. Quem escolhe a senha é o dono
 * da conta, no primeiro acesso.
 */
export async function POST(req: Request) {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) {
    return NextResponse.json({ error: guard.erro }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const nome = String(body.nome ?? "").trim() || null;
  const role = ["corretor", "admin", "super_admin"].includes(body.role)
    ? body.role
    : "corretor";
  const cota = Math.max(0, Math.min(500, Number(body.cota_diaria ?? 10) || 10));

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }

  const svc = servico();

  const { data: criado, error: errCriar } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nome }
  });

  if (errCriar) {
    return NextResponse.json(
      { error: errCriar.message.includes("already") ? "já existe conta com esse e-mail" : errCriar.message },
      { status: 400 }
    );
  }

  // o trigger handle_new_user já criou a linha em corretores; aqui só ajustamos
  const { error: errPerfil } = await svc
    .from("corretores")
    .update({ nome, role, cota_diaria: cota, ativo: true })
    .eq("id", criado.user!.id);

  if (errPerfil) {
    return NextResponse.json({ error: errPerfil.message }, { status: 500 });
  }

  // link de uso único para o novo corretor entrar e definir a própria senha
  let link: string | null = null;
  const { data: gerado } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  link = gerado?.properties?.action_link ?? null;

  return NextResponse.json({ ok: true, id: criado.user!.id, email, link });
}

/** PATCH — muda papel, cota ou ativa/desativa */
export async function PATCH(req: Request) {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) {
    return NextResponse.json({ error: guard.erro }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // um super_admin não se desativa nem se rebaixa sozinho: evita o painel
  // ficar sem ninguém que possa administrá-lo
  if (id === guard.user!.id && (body.ativo === false || (body.role && body.role !== "super_admin"))) {
    return NextResponse.json(
      { error: "você não pode rebaixar ou desativar a si mesmo" },
      { status: 400 }
    );
  }

  const campos: Record<string, unknown> = {};
  if (typeof body.ativo === "boolean") campos.ativo = body.ativo;
  if (["corretor", "admin", "super_admin"].includes(body.role)) campos.role = body.role;
  if (body.cota_diaria != null)
    campos.cota_diaria = Math.max(0, Math.min(500, Number(body.cota_diaria) || 0));
  if (body.nome !== undefined) campos.nome = String(body.nome).trim() || null;

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "nada para alterar" }, { status: 400 });
  }

  const svc = servico();
  const { data, error } = await svc
    .from("corretores")
    .update(campos)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, corretor: data });
}

/** PUT — gera novo link de acesso para uma conta existente */
export async function PUT(req: Request) {
  const guard = await exigirSuperAdmin();
  if ("erro" in guard) {
    return NextResponse.json({ error: guard.erro }, { status: guard.status });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "e-mail obrigatório" }, { status: 400 });

  const svc = servico();
  const { data, error } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, link: data?.properties?.action_link ?? null });
}
