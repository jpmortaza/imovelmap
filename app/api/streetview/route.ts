import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Proxy assinado do Street View Static.
 *
 * ⚠️ POR QUE ISTO EXISTE EM VEZ DE MONTAR A URL NO NAVEGADOR:
 *
 *   · a CHAVE DE API não pode ir para o cliente. Em `NEXT_PUBLIC_*` ela entra
 *     no bundle e qualquer um lê o arquivo .js e usa a nossa cota.
 *   · a CHAVE DE ASSINATURA muito menos — ela existe justamente para provar
 *     que a requisição é nossa. Publicada, não prova nada.
 *
 *   Aqui as duas ficam no servidor. O navegador chama /api/streetview e recebe
 *   só a imagem.
 *
 * A assinatura é opcional: sem ela o Google permite 25.000 requisições/dia,
 * o que é muito acima deste uso. `GOOGLE_MAPS_SIGNING_SECRET` só entra se
 * estiver definida.
 */

/** HMAC-SHA1 do caminho+query, no formato base64 "url-safe" que o Google usa. */
function assinar(caminhoComQuery: string, segredo: string) {
  // o segredo vem em base64 url-safe: desfaz para base64 comum antes de decodificar
  const chave = Buffer.from(segredo.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return crypto
    .createHmac("sha1", chave)
    .update(caminhoComQuery)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function GET(req: Request) {
  // a coordenada é dado de prospecção: só para quem entrou
  const sessao = createClient();
  const {
    data: { user }
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ error: "nao autenticado" }, { status: 401 });

  const chave = process.env.GOOGLE_MAPS_KEY;
  if (!chave) {
    return NextResponse.json({ error: "GOOGLE_MAPS_KEY nao configurada" }, { status: 503 });
  }

  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "coordenada invalida" }, { status: 400 });
  }
  const heading = Math.max(0, Math.min(359, Number(p.get("heading") ?? 0)));

  const query = new URLSearchParams({
    size: "640x360",
    location: `${lat},${lng}`,
    heading: String(heading),
    pitch: "6",
    fov: "80",
    // sem isto o Google devolve uma imagem cinza "sem imagem" com HTTP 200, e
    // ela apareceria na ficha parecendo dado
    return_error_code: "true",
    source: "outdoor",
    key: chave
  });

  let caminho = `/maps/api/streetview?${query.toString()}`;
  const segredo = process.env.GOOGLE_MAPS_SIGNING_SECRET;
  if (segredo) caminho += `&signature=${assinar(caminho, segredo)}`;

  const r = await fetch(`https://maps.googleapis.com${caminho}`, {
    // um imóvel não muda de fachada: cache longo economiza cota
    next: { revalidate: 60 * 60 * 24 * 30 }
  });

  if (!r.ok) {
    return NextResponse.json({ error: "sem cobertura" }, { status: r.status });
  }

  return new NextResponse(r.body, {
    headers: {
      "content-type": r.headers.get("content-type") ?? "image/jpeg",
      // `private`: exige login, então não pode ficar em cache compartilhado
      "cache-control": "private, max-age=86400"
    }
  });
}
