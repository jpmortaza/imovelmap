import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupOwner } from "@/lib/owner-lookup";

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

  // Fetch the imovel to get address data
  const { data: imovel, error } = await supabase
    .from("imoveis")
    .select("cep, neighborhood, city, endereco, endereco_numero")
    .eq("id", imovelId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!imovel) {
    return NextResponse.json({ error: "imovel not found" }, { status: 404 });
  }

  // Also check if there's a CNPJ already stored for this property's proprietario
  const { data: prop } = await supabase
    .from("proprietarios")
    .select("cpf_cnpj")
    .eq("imovel_id", imovelId)
    .eq("corretor_id", user.id)
    .maybeSingle();

  // Determine if cpf_cnpj looks like a CNPJ (14 digits)
  const rawDoc = (prop?.cpf_cnpj as string | null)?.replace(/\D/g, "") ?? "";
  const cnpj = rawDoc.length === 14 ? rawDoc : undefined;

  const fullEndereco = [imovel.endereco, imovel.endereco_numero]
    .filter(Boolean)
    .join(", ");

  const result = await lookupOwner({
    cep: imovel.cep ?? undefined,
    cnpj,
    neighborhood: imovel.neighborhood ?? undefined,
    city: imovel.city ?? undefined,
    endereco: fullEndereco || undefined,
  });

  return NextResponse.json(result);
}
