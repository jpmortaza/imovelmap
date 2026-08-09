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
    .select("id, email, nome, telefone, creci, role, ativo, cota_diaria, cidade, bairros, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ corretores: data ?? [] });
}

/**
 * POST — cria corretor.
 *
 * Sempre pela Admin API — `insert` direto em auth.users deixa as colunas de
 * token NULL e quebra o login de TODO o projeto (já aconteceu neste projeto).
 *
 * A senha é opcional. Sem ela, mandamos link de uso único e quem escolhe a
 * senha é o dono da conta, que é o melhor caminho. Com ela, o corretor entra
 * na hora — resolve quem não tem e-mail à mão ou quer começar agora.
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
  // territorio: definido ja no cadastro, senao o corretor entra e o painel
  // dele nao tem o que mostrar
  const cidade = String(body.cidade ?? "").trim() || null;
  const bairros = Array.isArray(body.bairros)
    ? body.bairros.map((b: unknown) => String(b).trim()).filter(Boolean).slice(0, 30)
    : [];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }

  const svc = servico();

  // Senha definida pelo admin é opcional. Sem ela mandamos o link de uso
  // único, que é melhor (só o dono da conta escolhe a senha). Com ela, o
  // corretor entra na hora — que é o que resolve quem não tem e-mail à mão.
  const senha = String(body.senha ?? "").trim();
  if (senha && senha.length < 8) {
    return NextResponse.json({ error: "senha precisa de ao menos 8 caracteres" }, { status: 400 });
  }

  const { data: criado, error: errCriar } = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    password: senha || undefined,
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
    .update({ nome, role, cota_diaria: cota, ativo: true, cidade, bairros })
    .eq("id", criado.user!.id);

  if (errPerfil) {
    return NextResponse.json({ error: errPerfil.message }, { status: 500 });
  }

  // Só geramos o link quando NÃO houve senha: com senha o link é ruído, e
  // ele expira em 1 hora — mandar os dois confunde quem recebe.
  let link: string | null = null;
  if (!senha) {
    const { data: gerado } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email
    });
    link = gerado?.properties?.action_link ?? null;
  }

  // ⚠️ A senha volta UMA vez, para o admin copiar e repassar. Não é gravada
  //    em lugar nenhum nosso — o Supabase guarda só o hash.
  return NextResponse.json({
    ok: true, id: criado.user!.id, email, link,
    senha: senha || null, nome
  });
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

  const svcSenha = servico();

  // trocar senha de um corretor existente
  if (typeof body.senha === "string" && body.senha.trim()) {
    const nova = body.senha.trim();
    if (nova.length < 8) {
      return NextResponse.json({ error: "senha precisa de ao menos 8 caracteres" }, { status: 400 });
    }
    const { error } = await svcSenha.auth.admin.updateUserById(id, { password: nova });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // devolve para o admin copiar; não guardamos em lugar nenhum
    return NextResponse.json({ ok: true, senha: nova });
  }

  const campos: Record<string, unknown> = {};
  if (typeof body.ativo === "boolean") campos.ativo = body.ativo;
  if (["corretor", "admin", "super_admin"].includes(body.role)) campos.role = body.role;
  if (body.cota_diaria != null)
    campos.cota_diaria = Math.max(0, Math.min(500, Number(body.cota_diaria) || 0));
  if (body.nome !== undefined) campos.nome = String(body.nome).trim() || null;
  if (body.telefone !== undefined) campos.telefone = String(body.telefone).trim() || null;
  if (body.creci !== undefined) campos.creci = String(body.creci).trim() || null;
  if (body.cidade !== undefined) campos.cidade = String(body.cidade).trim() || null;
  if (Array.isArray(body.bairros))
    campos.bairros = body.bairros.map((b: unknown) => String(b).trim()).filter(Boolean).slice(0, 30);

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
