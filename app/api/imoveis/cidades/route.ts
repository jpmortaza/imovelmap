import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// a lista de cidades muda quando entra fonte nova, não a cada minuto
export const revalidate = 3600;

/** Cidades com imóveis, para o filtro do mapa. Exige login, como o mapa. */
export async function GET() {
  const sessao = createClient();
  const {
    data: { user }
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "nao autenticado" }, { status: 401 });

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await svc.rpc("cidades_com_imoveis");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { cidades: data ?? [] },
    { headers: { "cache-control": "private, max-age=1800" } }
  );
}
