import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// POST /api/extracoes/run  { fonteSlug }
// Cria uma nova extração em status 'queued' / 'running'. A execução real do
// scraper roda fora (cron/worker externo), mas essa rota também pode
// disparar uma execução inline simples via fetch pra um actor Apify quando
// o tipo for "apify".
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  // checa super_admin
  const { data: me } = await supabase
    .from("corretores")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const fonteSlug = body?.fonteSlug as string | undefined;
  if (!fonteSlug) return NextResponse.json({ error: "missing fonteSlug" }, { status: 400 });

  // pega a fonte
  const { data: fonte, error: fonteErr } = await supabase
    .from("fontes")
    .select("*")
    .eq("slug", fonteSlug)
    .single();

  if (fonteErr || !fonte) {
    return NextResponse.json({ error: "fonte not found" }, { status: 404 });
  }

  // cria o registro da extração usando service role (para ignorar RLS caso seja job automático)
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: extracao, error: createErr } = await svc
    .from("extracoes")
    .insert({
      fonte_id: fonte.id,
      status: "queued",
      triggered_by: user.id,
      params: fonte.config
    })
    .select()
    .single();

  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  // TODO: aqui dispararíamos o job real (Apify run, edge function, etc).
  // Por enquanto, só registramos a intenção. O worker externo vai pollar
  // por extracoes em status "queued" e executá-las.

  return NextResponse.json({
    ok: true,
    extracaoId: extracao.id,
    status: extracao.status,
    fonte: { slug: fonte.slug, nome: fonte.nome, tipo: fonte.tipo }
  });
}
