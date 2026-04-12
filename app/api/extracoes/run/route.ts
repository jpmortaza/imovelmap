import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SCRAPERS } from "@/lib/scrapers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: me } = await supabase
    .from("corretores")
    .select("id, role, ativo")
    .eq("id", user.id)
    .single();
  if (!me || me.ativo === false) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const scraperKey = body?.scraperKey as string | undefined;
  const maxItems = Math.min(Number(body?.maxItems ?? 30), 100);

  if (!scraperKey) {
    return NextResponse.json(
      { error: "missing scraperKey" },
      { status: 400 }
    );
  }

  const scraper = SCRAPERS[scraperKey];
  if (!scraper) {
    return NextResponse.json(
      {
        error: `scraper "${scraperKey}" not found`,
        available: Object.keys(SCRAPERS),
      },
      { status: 404 }
    );
  }

  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const start = Date.now();

  try {
    const items = await scraper.fn({ maxItems });

    let novos = 0;
    let erros = 0;
    for (const item of items) {
      const { error: rpcErr } = await svc.rpc("upsert_imovel", { p: item });
      if (rpcErr) {
        erros++;
        console.warn(`upsert fail ${item.id}: ${rpcErr.message}`);
      } else {
        novos++;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "inline",
      scraper: scraperKey,
      scraperNome: scraper.nome,
      totalEncontrados: items.length,
      totalNovos: novos,
      totalErros: erros,
      duracaoMs: Date.now() - start,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg, scraper: scraperKey, duracaoMs: Date.now() - start },
      { status: 500 }
    );
  }
}
