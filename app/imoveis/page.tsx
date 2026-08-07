import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BuscarForm from "./buscar-form";
import FavoritarButton from "./favoritar-button";

export const dynamic = "force-dynamic";

const POR_PAGINA = 48;

type SearchParams = Record<string, string | undefined>;

export default async function ImoveisPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pagina = Math.max(1, Number(searchParams.pagina ?? 1) || 1);
  const de = (pagina - 1) * POR_PAGINA;

  // `count: exact` no mesmo round-trip: precisamos do total para paginar
  let query = supabase
    .from("imoveis")
    .select(
      "id,title,price,price_formatted,transaction_type,neighborhood,city,state," +
        "bedrooms,bathrooms,area,parking_spaces,images,source,source_url," +
        "endereco,endereco_numero,numero_inferido,complemento,temperatura,telefones,tipo_anunciante,anunciante,first_seen_at,matricula,matricula_zona,matricula_candidatas,ultima_venda_data",
      { count: "exact" }
    )
    .eq("is_active", true);

  if (searchParams.tipo) query = query.eq("transaction_type", searchParams.tipo);
  if (searchParams.cidade) query = query.eq("city", searchParams.cidade);
  if (searchParams.bairro)
    query = query.ilike("neighborhood", `%${searchParams.bairro}%`);
  if (searchParams.quartos_min)
    query = query.gte("bedrooms", Number(searchParams.quartos_min));
  if (searchParams.area_min) query = query.gte("area", Number(searchParams.area_min));
  if (searchParams.preco_min) query = query.gte("price", Number(searchParams.preco_min));
  if (searchParams.preco_max) query = query.lte("price", Number(searchParams.preco_max));
  if (searchParams.com_endereco === "1") query = query.not("endereco", "is", null);
  // ⭐ a lista de prospecção de verdade: imóvel cuja matrícula já sabemos —
  // o corretor tira a certidão e tem o nome do dono no mesmo dia
  if (searchParams.com_matricula === "1") query = query.not("matricula", "is", null);
  // inclui os prédios com matrículas candidatas: menos direto, ainda acionável
  if (searchParams.com_matricula === "2")
    query = query.or("matricula.not.is.null,matricula_candidatas.not.is.null");
  // "nós somos a Auxiliadora": o que ela já tem não é oportunidade
  if (searchParams.sem_auxiliadora === "1")
    query = query.neq("source", "auxiliadorapredial.com.br");
  // ⭐ nome e telefone de quem está na unidade, do cadastro de CNPJ
  if (searchParams.com_contato === "1")
    query = query.not("contatos_cnpj", "is", null);
  // pede muito acima do que o prédio vende: costuma encalhar
  if (searchParams.caro === "1") query = query.gte("sobrepreco", 0.6);
  if (searchParams.fsbo === "1") query = query.eq("tipo_anunciante", "proprietario");
  // array vazio '{}' = sem telefone; qualquer coisa diferente disso tem número
  if (searchParams.com_telefone === "1") query = query.neq("telefones", "{}");
  if (searchParams.q) {
    const q = searchParams.q;
    query = query.or(
      `title.ilike.%${q}%,neighborhood.ilike.%${q}%,city.ilike.%${q}%,endereco.ilike.%${q}%`
    );
  }

  switch (searchParams.ordem) {
    case "quentes":
      query = query.order("temperatura", { ascending: false });
      break;
    case "baratos":
      query = query.order("price", { ascending: true, nullsFirst: false });
      break;
    case "caros":
      query = query.order("price", { ascending: false, nullsFirst: false });
      break;
    case "antigos":
      query = query.order("first_seen_at", { ascending: true });
      break;
    case "dono_antigo":
      // quem comprou há mais tempo tende a estar mais perto de vender
      query = query.order("ultima_venda_data", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("first_seen_at", { ascending: false });
  }

  const { data, count, error } = await query.range(de, de + POR_PAGINA - 1);
  const imoveis = data ?? [];
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // cidades para o seletor — view materializada seria melhor com muito volume
  const { data: cidadesRaw } = await supabase
    .from("imoveis")
    .select("city")
    .eq("is_active", true)
    .not("city", "is", null)
    .limit(4000);
  const cidades = [...new Set((cidadesRaw ?? []).map((c: any) => c.city))].sort();

  const qs = (p: number) => {
    const sp = new URLSearchParams(
      Object.entries(searchParams).filter(([k, v]) => v && k !== "pagina") as [string, string][]
    );
    if (p > 1) sp.set("pagina", String(p));
    return `/imoveis${sp.toString() ? "?" + sp : ""}`;
  };

  return (
    <div>
      {/* o cabeçalho saiu daqui: navegação agora é o menu lateral (CascaApp) */}
      <h1 style={{ fontSize: 24, margin: "0 0 14px", letterSpacing: -0.5 }}>
        Buscar imóveis
      </h1>

      <BuscarForm cidades={cidades} />

      {error && (
        <div style={caixaErro}>Erro ao carregar: {error.message}</div>
      )}

      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        <b>{total.toLocaleString("pt-BR")}</b> imóveis
        {totalPaginas > 1 && ` · página ${pagina} de ${totalPaginas}`}
      </div>

      {imoveis.length === 0 ? (
        <div style={vazio}>Nenhum imóvel com esses filtros.</div>
      ) : (
        <div style={grade}>
          {imoveis.map((i: any) => (
            <div key={i.id} style={cartao}>
              {user && <FavoritarButton imovelId={i.id} />}
              <Link href={`/imoveis/${i.id}`} style={{ color: "inherit", display: "flex", flexDirection: "column", flex: 1 }}>
                {i.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.images[0]} alt="" loading="lazy" style={foto} />
                ) : (
                  <div style={{ ...foto, background: "#eee" }} />
                )}
                <div style={{ padding: 13, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 17, flex: 1 }}>
                      {i.price_formatted ??
                        (i.price
                          ? `R$ ${Number(i.price).toLocaleString("pt-BR")}`
                          : "Sob consulta")}
                      {i.transaction_type === "rent" && (
                        <span style={{ fontSize: 11, color: "#666" }}> /mês</span>
                      )}
                    </div>
                    {i.temperatura > 0 && (
                      <span style={{
                        ...pilula,
                        background: i.temperatura >= 70 ? "#7f1d1d" : i.temperatura >= 40 ? "#78350f" : "#1e3a5f",
                        color: "#fff"
                      }}>
                        {i.temperatura}
                      </span>
                    )}
                  </div>

                  {/* ⭐ o endereço aparece já na listagem — é o diferencial */}
                  {i.endereco && (
                    <div
                      style={{
                        fontSize: 12.5,
                        color: i.numero_inferido ? "#8a6100" : "#157f3c",
                        fontWeight: 600,
                        marginTop: 4
                      }}
                    >
                      📍 {i.endereco}
                      {i.endereco_numero ? `, ${i.endereco_numero}` : ""}
                      {/* número deduzido nunca sai parecendo publicado */}
                      {i.numero_inferido ? " (nº deduzido)" : ""}
                      {i.complemento ? ` · ${i.complemento}` : ""}
                    </div>
                  )}

                  <div style={{ color: "#666", fontSize: 12.5, margin: "4px 0 8px" }}>
                    {[i.neighborhood, i.city].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#444" }}>
                    {[
                      i.area && `${i.area}m²`,
                      i.bedrooms != null && `${i.bedrooms}q`,
                      i.bathrooms != null && `${i.bathrooms}b`,
                      i.parking_spaces != null && `${i.parking_spaces}v`
                    ].filter(Boolean).join(" · ")}
                  </div>

                  <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap" }}>
                    {i.tipo_anunciante === "proprietario" && (
                      <span style={{ ...tag, background: "#fee2e2", color: "#991b1b" }}>
                        proprietário direto
                      </span>
                    )}
                    {i.telefones?.length > 0 && (
                      <span style={{ ...tag, background: "#dcfce7", color: "#166534" }}>
                        📞 {i.telefones.length}
                      </span>
                    )}
                    {/* saber a matrícula é saber o caminho até o nome do dono */}
                    {i.matricula ? (
                      <span style={{ ...tag, background: "#dbeafe", color: "#1e40af" }}>
                        📜 matrícula {i.matricula}
                        {i.matricula_zona ? ` · ${i.matricula_zona}ª zona` : ""}
                      </span>
                    ) : Array.isArray(i.matricula_candidatas) && i.matricula_candidatas.length > 0 ? (
                      <span style={{ ...tag, background: "#eef2ff", color: "#4338ca" }}>
                        📜 {i.matricula_candidatas.length} matrículas candidatas
                      </span>
                    ) : null}
                    <span style={{ ...tag, background: "#f1f5f9", color: "#64748b" }}>
                      {i.anunciante ?? i.source}
                    </span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <nav style={paginacao}>
          {pagina > 1 && <Link href={qs(pagina - 1)} style={btnPag}>← anterior</Link>}
          {paginasVisiveis(pagina, totalPaginas).map((p, k) =>
            p === "…" ? (
              <span key={`e${k}`} style={{ color: "#aaa", padding: "0 4px" }}>…</span>
            ) : (
              <Link
                key={p}
                href={qs(p as number)}
                style={{ ...btnPag, ...(p === pagina ? btnPagAtivo : {}) }}
              >
                {p}
              </Link>
            )
          )}
          {pagina < totalPaginas && <Link href={qs(pagina + 1)} style={btnPag}>próxima →</Link>}
        </nav>
      )}
    </div>
  );
}

/** 1 … 4 5 [6] 7 8 … 90 — sem imprimir 90 links */
function paginasVisiveis(atual: number, total: number): (number | "…")[] {
  const s = new Set<number>([1, total, atual]);
  for (let d = 1; d <= 2; d++) {
    if (atual - d > 0) s.add(atual - d);
    if (atual + d <= total) s.add(atual + d);
  }
  const ord = [...s].sort((a, b) => a - b);
  const saida: (number | "…")[] = [];
  let ant = 0;
  for (const p of ord) {
    if (ant && p - ant > 1) saida.push("…");
    saida.push(p);
    ant = p;
  }
  return saida;
}

const grade: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(265px, 1fr))", gap: 14
};
const cartao: React.CSSProperties = {
  background: "#fff", borderRadius: 12, overflow: "hidden",
  boxShadow: "0 2px 10px rgba(0,0,0,.05)", display: "flex",
  flexDirection: "column", position: "relative"
};
const foto: React.CSSProperties = { width: "100%", height: 165, objectFit: "cover" };
const pilula: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999
};
const tag: React.CSSProperties = {
  fontSize: 10.5, padding: "2px 7px", borderRadius: 999, fontWeight: 600
};
const paginacao: React.CSSProperties = {
  display: "flex", gap: 6, justifyContent: "center",
  alignItems: "center", margin: "26px 0 10px", flexWrap: "wrap"
};
const btnPag: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 8, border: "1px solid #ddd",
  background: "#fff", color: "#333", fontSize: 13
};
const btnPagAtivo: React.CSSProperties = {
  background: "#111", color: "#fff", borderColor: "#111", fontWeight: 700
};
const caixaErro: React.CSSProperties = {
  padding: 12, background: "#fdecea", color: "#b00020",
  borderRadius: 8, marginBottom: 16
};
const vazio: React.CSSProperties = {
  padding: 40, background: "#fff", borderRadius: 12,
  textAlign: "center", color: "#666"
};
