import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Enriquecer from "./enriquecer";

export const dynamic = "force-dynamic";

// O corretor logado enxerga TUDO — inclusive endereço, CEP, inscrição
// imobiliária e valor venal, que o `anon` não vê (0006_rls.sql).
export default async function ImovelPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: imovel } = await supabase
    .from("imoveis")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!imovel) notFound();

  const brl = (v: number | null) =>
    v == null
      ? "—"
      : new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0
        }).format(Number(v));

  const enderecoCompleto = [imovel.endereco, imovel.endereco_numero]
    .filter(Boolean)
    .join(", ");

  const temp = Number(imovel.temperatura ?? 0);
  const corTemp = temp >= 70 ? "#7f1d1d" : temp >= 40 ? "#78350f" : "#1e3a5f";
  const fgTemp = temp >= 70 ? "#fecaca" : temp >= 40 ? "#fde68a" : "#bfdbfe";

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header style={header}>
        <Link href="/imoveis" style={{ color: "#fff", fontWeight: 800 }}>
          ← ImovelMap
        </Link>
        <span style={{ marginLeft: "auto", color: "#999", fontSize: 13 }}>
          {user.email}
        </span>
      </header>

      <main style={main}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <h1 style={h1}>{imovel.title ?? "Imóvel sem título"}</h1>
            <div style={{ color: "#777", fontSize: 13, marginTop: 4 }}>
              {imovel.source} · cód. {imovel.external_id}
              {imovel.source_url && (
                <>
                  {" · "}
                  <a href={imovel.source_url} target="_blank" rel="noreferrer" style={{ color: "#0366d6" }}>
                    ver anúncio original
                  </a>
                </>
              )}
            </div>
          </div>
          <div style={{ ...bolha, background: corTemp, color: fgTemp }}>
            {temp}
            <div style={{ fontSize: 9, letterSpacing: 0.5 }}>TEMP</div>
          </div>
        </div>

        {/* ⭐ o endereço é o produto: primeiro bloco da tela */}
        <section style={cartao}>
          <h2 style={h2}>📍 Endereço</h2>
          {enderecoCompleto ? (
            <>
              <div
                style={{
                  fontSize: 19,
                  fontWeight: 700,
                  color: imovel.numero_inferido ? "#8a6100" : "#157f3c"
                }}
              >
                {enderecoCompleto}
                {imovel.complemento ? ` · ${imovel.complemento}` : ""}
              </div>
              {/* Número que NÓS inferimos não pode parecer número publicado.
                  Medido em teste cego contra 544 endereços conhecidos: a
                  inferência por CEP + área privativa acerta ~4 de 5. É um bom
                  ponto de partida, não um fato — e o corretor precisa saber
                  disso antes de bater na porta ou pagar uma certidão. */}
              {imovel.numero_inferido && (
                <div
                  style={{
                    background: "#fff6e0",
                    border: "1px solid #f0d9a0",
                    borderRadius: 8,
                    padding: "8px 11px",
                    fontSize: 12.5,
                    color: "#7a5600",
                    marginTop: 8,
                    lineHeight: 1.5
                  }}
                >
                  <b>O número da porta foi deduzido, não publicado.</b> O
                  anúncio traz só a rua e o CEP; cruzamos com o ITBI da
                  prefeitura pela área privativa. Acerta cerca de 4 em 5 —
                  confirme antes de pagar certidão.
                </div>
              )}
              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                {[imovel.cep, imovel.neighborhood, imovel.city, imovel.state]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {imovel.endereco_confianca != null && (
                <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                  confiança {imovel.endereco_confianca}%
                  {imovel.endereco_metodo ? ` · método ${imovel.endereco_metodo}` : ""}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#b00020" }}>
              Endereço ainda não resolvido — o anúncio não publica.
            </div>
          )}
          {imovel.unidade && (
            <div style={{ fontSize: 13, marginTop: 6 }}>
              unidade: <b>{imovel.unidade}</b>
            </div>
          )}
          {imovel.inscricao_imobiliaria && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              inscrição imobiliária: <b>{imovel.inscricao_imobiliaria}</b>
            </div>
          )}
          {imovel.latitude != null && (
            <a
              href={`https://www.google.com/maps?q=${imovel.latitude},${imovel.longitude}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, color: "#0366d6", display: "inline-block", marginTop: 8 }}
            >
              abrir no mapa ({Number(imovel.latitude).toFixed(5)}, {Number(imovel.longitude).toFixed(5)})
            </a>
          )}
        </section>

        {/* ⭐ A matrícula é o fim da linha da prospecção: com ela o corretor
            tira a certidão no cartório e lê o nome do proprietário. Vem do
            ITBI de Porto Alegre, dados abertos. */}
        <Matricula imovel={imovel} />

        <section style={cartao}>
          <h2 style={h2}>💰 Valores</h2>
          <div style={{ fontSize: 26, fontWeight: 800 }}>
            {imovel.price_formatted ?? brl(imovel.price)}
            {imovel.transaction_type === "rent" && (
              <span style={{ fontSize: 13, color: "#666", fontWeight: 400 }}> /mês</span>
            )}
          </div>
          <div style={grade}>
            <Dado rotulo="Condomínio" valor={brl(imovel.condominium_fee)} />
            <Dado rotulo="IPTU" valor={brl(imovel.iptu)} />
            <Dado rotulo="Valor venal" valor={brl(imovel.valor_venal)} />
            <Dado
              rotulo="R$/m²"
              valor={
                imovel.price && imovel.area
                  ? brl(Number(imovel.price) / Number(imovel.area))
                  : "—"
              }
            />
            {imovel.preco_ref_m2 && (
              <Dado
                rotulo="R$/m² do prédio"
                valor={
                  <span title="mediana das vendas deste prédio no ITBI, últimos 3 anos">
                    {brl(imovel.preco_ref_m2)}
                  </span>
                }
              />
            )}
          </div>

          {/* ⭐ A frase mais útil da página para quem vai ligar para o dono:
              imóvel muito acima do que o prédio vende não sai, e dono de
              imóvel encalhado já tentou do jeito dele. */}
          {imovel.sobrepreco != null && imovel.sobrepreco > 0.25 && (
            <div
              style={{
                marginTop: 14,
                background: imovel.sobrepreco > 0.6 ? "#fef2f2" : "#fff8ed",
                border: `1px solid ${imovel.sobrepreco > 0.6 ? "#fecaca" : "#f0d9a0"}`,
                borderRadius: 9,
                padding: "11px 13px",
                fontSize: 13,
                lineHeight: 1.55,
                color: imovel.sobrepreco > 0.6 ? "#991b1b" : "#7a5600"
              }}
            >
              <b>
                Pede {Math.round(imovel.sobrepreco * 100)}% acima do que este
                prédio vende.
              </b>{" "}
              A mediana das transações registradas aqui nos últimos 3 anos é{" "}
              {brl(imovel.preco_ref_m2)}/m². Anúncio muito acima do prédio
              costuma encalhar — e quem está há meses sem vender escuta
              proposta de agenciamento.
              <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 5 }}>
                Comparação com o prédio inteiro: cobertura ou unidade reformada
                fica acima da mediana sem estar cara.
              </div>
            </div>
          )}
        </section>

        <section style={cartao}>
          <h2 style={h2}>📐 Características</h2>
          <div style={grade}>
            <Dado rotulo="Área" valor={imovel.area ? `${imovel.area} m²` : "—"} />
            <Dado rotulo="Quartos" valor={imovel.bedrooms ?? "—"} />
            <Dado rotulo="Banheiros" valor={imovel.bathrooms ?? "—"} />
            <Dado rotulo="Vagas" valor={imovel.parking_spaces ?? "—"} />
            <Dado rotulo="Tipo" valor={imovel.property_type ?? "—"} />
            <Dado
              rotulo="Negócio"
              valor={imovel.transaction_type === "rent" ? "Aluguel" : "Venda"}
            />
            <Dado
              rotulo="Visto pela 1ª vez"
              valor={new Date(imovel.first_seen_at).toLocaleDateString("pt-BR")}
            />
            <Dado
              rotulo="Dias no mercado"
              valor={Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(imovel.first_seen_at).getTime()) / 86400000
                )
              )}
            />
          </div>
        </section>


        {/* 📞 o contato do anúncio: o caminho mais curto até o dono */}
        <section style={cartao}>
          <h2 style={h2}>📞 Contato do anúncio</h2>

          {imovel.tipo_anunciante === "proprietario" && (
            <div style={{
              background: "#fee2e2", color: "#991b1b", borderRadius: 8,
              padding: "10px 12px", marginBottom: 12, fontSize: 13, fontWeight: 700
            }}>
              🔥 Provável PROPRIETÁRIO DIRETO — anúncio sem CRECI
              <div style={{ fontWeight: 400, fontSize: 12, marginTop: 3 }}>
                O telefone abaixo tende a ser o do próprio dono. Confirme antes de abordar.
              </div>
            </div>
          )}

          {imovel.anunciante && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Anunciado por
              </div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                {imovel.anunciante}
                {imovel.anunciante_creci && (
                  <span style={{ fontSize: 12, color: "#777", fontWeight: 400 }}>
                    {" "}· CRECI {imovel.anunciante_creci}
                  </span>
                )}
              </div>
            </div>
          )}

          {Array.isArray(imovel.telefones) && imovel.telefones.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {imovel.telefones.map((t: string) => {
                const fmt = t.replace(/^55/, "");
                const bonito =
                  fmt.length >= 10
                    ? `(${fmt.slice(0, 2)}) ${fmt.slice(2, -4)}-${fmt.slice(-4)}`
                    : t;
                const ehWhats = imovel.whatsapp === t;
                return (
                  <div key={t} style={{ display: "flex", gap: 6 }}>
                    <a href={`tel:+${t}`} style={botaoFone}>{bonito}</a>
                    {ehWhats && (
                      <a
                        href={`https://wa.me/${t}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...botaoFone, background: "#25D366", color: "#fff", borderColor: "#25D366" }}
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#888", fontSize: 13 }}>
              Nenhum telefone publicado neste anúncio. Se o mesmo imóvel aparecer
              em outro portal, o número entra automaticamente.
            </div>
          )}
        </section>

        {/* tudo que depende de chamada externa vive no client */}
        <Enriquecer
          imovelId={imovel.id}
          source={imovel.source}
          externalId={imovel.external_id}
          temEndereco={Boolean(imovel.endereco)}
          temCoordenada={imovel.latitude != null}
        />

        {Array.isArray(imovel.images) && imovel.images.length > 0 && (
          <section style={cartao}>
            <h2 style={h2}>📸 Fotos ({imovel.images.length})</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 8
              }}
            >
              {imovel.images.slice(0, 24).map((u: string, i: number) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={u}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8 }}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Cartórios de registro de imóveis de Porto Alegre, por zona.
 *
 * O ITBI devolve `n_zona_reg_imoveis` — é o número da zona, e é ela que diz
 * em QUAL cartório a matrícula está. Sem isso o corretor teria que ligar para
 * seis cartórios até achar o dele.
 */
const CARTORIOS: Record<string, string> = {
  "1": "Registro de Imóveis da 1ª Zona",
  "2": "Registro de Imóveis da 2ª Zona",
  "3": "Registro de Imóveis da 3ª Zona",
  "4": "Registro de Imóveis da 4ª Zona",
  "5": "Registro de Imóveis da 5ª Zona",
  "6": "Registro de Imóveis da 6ª Zona"
};

/** "há 8 anos" — o sinal de prospecção que o valor sozinho não dá. */
function tempoDesde(data: string | null): string | null {
  if (!data) return null;
  const meses = Math.round(
    (Date.now() - new Date(data).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );
  if (meses < 1) return "este mês";
  if (meses < 24) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  return `há ${Math.floor(meses / 12)} anos`;
}

function Matricula({ imovel }: { imovel: Record<string, any> }) {
  const cands = Array.isArray(imovel.matricula_candidatas) ? imovel.matricula_candidatas : null;
  if (!imovel.matricula && !cands?.length) return null;

  const zona = imovel.matricula_zona ? CARTORIOS[String(imovel.matricula_zona)] : null;
  const desde = tempoDesde(imovel.ultima_venda_data);

  return (
    <section style={{ ...cartao, borderLeft: "4px solid #157f3c" }}>
      <h2 style={h2}>📜 Matrícula no registro de imóveis</h2>

      {imovel.matricula ? (
        <>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
            nº {imovel.matricula}
          </div>
          <div style={{ color: "#157f3c", fontWeight: 600, fontSize: 14, marginTop: 2 }}>
            {zona ?? `zona ${imovel.matricula_zona ?? "?"}`}
          </div>
          <p style={{ fontSize: 12.5, color: "#666", margin: "10px 0 0", lineHeight: 1.5 }}>
            Peça a certidão de inteiro teor com esse número nesse cartório: é
            ela que traz o <b>nome e o CPF do proprietário</b>, além de ônus e
            penhoras. A matrícula vem do ITBI publicado pela prefeitura — não
            precisa de busca paga.
            {imovel.numero_inferido && (
              <>
                {" "}
                <b style={{ color: "#8a6100" }}>
                  Atenção: como o número da porta foi deduzido, esta matrícula
                  herda a mesma dúvida.
                </b>
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {cands!.length} unidades deste prédio têm a área do anúncio
          </div>
          <p style={{ fontSize: 12.5, color: "#666", margin: "6px 0 10px", lineHeight: 1.5 }}>
            Numa torre com apartamentos iguais a área não distingue qual é. O{" "}
            <b>número do prédio está certo</b>; a matrícula é uma destas. Uma
            ligação ao anunciante perguntando o andar resolve.
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {cands!.slice(0, 12).map((c: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 13,
                  background: "#f6f7f9",
                  borderRadius: 7,
                  padding: "7px 10px"
                }}
              >
                <span>
                  unid. <b>{c.unidade ?? "—"}</b> · matrícula <b>{c.matricula}</b>
                  {c.zona ? ` · zona ${c.zona}` : ""}
                </span>
                <span style={{ color: "#666" }}>
                  {c.area ? `${c.area} m²` : ""}
                  {c.ultimaVenda
                    ? ` · ${Number(c.ultimaVenda).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0
                      })}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(imovel.ultima_venda_valor || imovel.ano_construcao) && (
        <div style={{ ...grade, marginTop: 14 }}>
          {imovel.ultima_venda_valor && (
            <Dado
              rotulo="Última venda"
              valor={
                <>
                  {Number(imovel.ultima_venda_valor).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0
                  })}
                  {desde && (
                    <span style={{ fontWeight: 400, color: "#666", fontSize: 12 }}> · {desde}</span>
                  )}
                </>
              }
            />
          )}
          {imovel.ano_construcao && (
            <Dado rotulo="Construção" valor={imovel.ano_construcao} />
          )}
        </div>
      )}
    </section>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{valor}</div>
    </div>
  );
}

const header: React.CSSProperties = {
  height: 56,
  background: "#111",
  display: "flex",
  alignItems: "center",
  padding: "0 20px",
  gap: 12
};
const main: React.CSSProperties = { maxWidth: 860, margin: "0 auto", padding: 24 };
const h1: React.CSSProperties = { fontSize: 24, margin: 0, letterSpacing: -0.4 };
const h2: React.CSSProperties = { fontSize: 14, margin: "0 0 12px", color: "#333" };
const cartao: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 18,
  marginBottom: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)"
};
const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 14,
  marginTop: 12
};
const botaoFone: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  border: "1px solid #ddd",
  borderRadius: 9,
  fontSize: 14,
  fontWeight: 600,
  color: "#111",
  textDecoration: "none",
  background: "#fff"
};
const bolha: React.CSSProperties = {
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 24,
  fontWeight: 800,
  textAlign: "center",
  lineHeight: 1
};
