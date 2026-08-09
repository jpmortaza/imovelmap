import Link from "next/link";
import nextDynamic from "next/dynamic";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Enriquecer from "./enriquecer";
import Imprimir from "./imprimir";
import Galeria from "./galeria";

// Leaflet usa window: só no cliente.
const MiniMapa = nextDynamic(() => import("@/components/MiniMapa"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 260, background: "#eef1f4", borderRadius: 10 }} />
  )
});

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

  // outros imóveis à venda no MESMO prédio — comparável direto e sinal de
  // atividade. 8.978 prédios de POA têm 2+ à venda ao mesmo tempo.
  const { data: noPredio } = await supabase.rpc("imoveis_no_predio", {
    p_imovel_id: params.id
  });

  // o MESMO imóvel em outros portais — argumento direto de exclusividade
  const { data: outrosPortais } = await supabase.rpc("imovel_em_outros_portais", {
    p_imovel_id: params.id
  });

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
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Imprimir />
            <div style={{ ...bolha, background: corTemp, color: fgTemp }}>
              {temp}
              <div style={{ fontSize: 9, letterSpacing: 0.5 }}>TEMP</div>
            </div>
          </div>
        </div>

        {/* ⭐ FICHA-RESUMO: tudo que decide uma ligação, numa faixa só. Antes
            estes números estavam espalhados por cinco blocos e o corretor
            tinha que rolar a página para montar a conta na cabeça. */}
        <section style={{ ...cartao, padding: 0, overflow: "hidden" }}>
          <div style={faixaResumo}>
            <Resumo r="Preço" v={imovel.price_formatted ?? brl(imovel.price)} forte />
            <Resumo r="Área" v={imovel.area ? `${imovel.area} m²` : "—"} />
            <Resumo
              r="R$/m²"
              v={imovel.price && imovel.area
                  ? brl(Number(imovel.price) / Number(imovel.area)) : "—"}
            />
            <Resumo
              r="Matrícula"
              v={imovel.matricula
                  ? `${imovel.matricula} · ${imovel.matricula_zona}ª zona`
                  : Array.isArray(imovel.matricula_candidatas) && imovel.matricula_candidatas.length
                    ? `${imovel.matricula_candidatas.length} candidatas`
                    : "—"}
            />
            <Resumo
              r="Contatos"
              v={String(
                (Array.isArray(imovel.telefones) ? imovel.telefones.length : 0) +
                (Array.isArray(imovel.contatos_cnpj) ? imovel.contatos_cnpj.length : 0) +
                (Array.isArray(imovel.contatos_predio) ? imovel.contatos_predio.length : 0) +
                (Array.isArray(imovel.contatos_importados) ? imovel.contatos_importados.length : 0)
              )}
            />
            <Resumo
              r="Dono desde"
              v={imovel.ultima_venda_data
                  ? new Date(imovel.ultima_venda_data).toLocaleDateString("pt-BR", {
                      month: "2-digit", year: "numeric", timeZone: "UTC" })
                  : "—"}
            />
          </div>
        </section>

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
            <div style={{ marginTop: 12 }}>
              <MiniMapa
                lat={Number(imovel.latitude)}
                lng={Number(imovel.longitude)}
                cor={imovel.ja_e_nosso ? "#dc2626" : "#2563eb"}
                incerto={Boolean(imovel.numero_inferido)}
              />
              {imovel.numero_inferido && (
                <div style={{ fontSize: 11.5, color: "#8a6100", marginTop: 5 }}>
                  O círculo é a margem de dúvida: o número da porta foi deduzido,
                  então a posição exata pode ser um prédio vizinho.
                </div>
              )}
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
        <ContatosCnpj imovel={imovel} />
        <ContatosPredio imovel={imovel} />
        <ContatosEntorno imovel={imovel} />
        <ContatosImportados imovel={imovel} />
        <OutrosPortais lista={outrosPortais ?? []} imovel={imovel} />
        <NoPredio lista={noPredio ?? []} imovel={imovel} />

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
            <Galeria imagens={imovel.images} titulo={imovel.title ?? "Imóvel"} />
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
 * em QUAL dos seis cartórios a matrícula está. Sem isso o corretor ligaria
 * para todos até achar o certo.
 *
 * Endereços e telefones conferidos na base de conhecimento da Procempa (a
 * própria prefeitura), não em site de intermediário que vende certidão.
 */
const CARTORIOS: Record<string, { nome: string; endereco: string; fone: string }> = {
  "1": {
    nome: "Registro de Imóveis da 1ª Zona",
    endereco: "Rua Anita Garibaldi, 1855 / Loja 1835 — Boa Vista",
    fone: "(51) 3018-2900"
  },
  "2": {
    nome: "Registro de Imóveis da 2ª Zona",
    endereco: "Rua Siqueira Campos, 1163, 3º andar — Centro Histórico",
    fone: "(51) 3013-4660"
  },
  "3": {
    nome: "Registro de Imóveis da 3ª Zona",
    endereco: "Rua Coronel Genuíno, 421, sala 501 — Centro Histórico",
    fone: "(51) 3021-8400"
  },
  "4": {
    nome: "Registro de Imóveis da 4ª Zona",
    endereco: "Rua Coronel Genuíno, 421, 13º andar — Centro Histórico",
    fone: "(51) 3079-4300"
  },
  "5": {
    nome: "Registro de Imóveis da 5ª Zona",
    endereco: "Rua Coronel Genuíno, 421, conj. 802 — Centro",
    fone: "(51) 3221-2854"
  },
  "6": {
    nome: "Registro de Imóveis da 6ª Zona",
    endereco: "Rua Washington Luiz, 820, 5º andar — Centro Histórico",
    fone: "(51) 3103-1009"
  }
};

// Plataforma oficial dos registradores: dá para pedir a certidão informando a
// matrícula e o cartório, sem ir ao balcão. Não é intermediário — é o ONR.
const ONR = "https://registradores.onr.org.br/";

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

  const cartorio = imovel.matricula_zona ? CARTORIOS[String(imovel.matricula_zona)] : null;
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
            {cartorio?.nome ?? `zona ${imovel.matricula_zona ?? "?"}`}
          </div>
          {cartorio && (
            <div style={{ fontSize: 12.5, color: "#555", marginTop: 3 }}>
              {cartorio.endereco} · {cartorio.fone}
            </div>
          )}
          <a
            href={ONR}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              marginTop: 11,
              background: "#157f3c",
              color: "#fff",
              borderRadius: 8,
              padding: "9px 15px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none"
            }}
          >
            Pedir a certidão online (ONR) →
          </a>
          <p style={{ fontSize: 12.5, color: "#666", margin: "10px 0 0", lineHeight: 1.5 }}>
            Peça a <b>certidão de inteiro teor</b> com esse número nesse
            cartório: é ela que traz o <b>nome e o CPF do proprietário</b>,
            além de ônus e penhoras. A matrícula vem do ITBI publicado pela
            prefeitura — não precisa pagar busca prévia.
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

/** "5194695864" → "(51) 9469-5864" */
function fone(f: string | null): string {
  const d = String(f ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return f ?? "—";
}

/**
 * Quem tem empresa registrada NESTA unidade.
 *
 * ⚠️ Isto é um fato sobre o cadastro da Receita, NÃO sobre a propriedade.
 *    Milhões de brasileiros abrem empresa no endereço onde moram — mas a
 *    pessoa pode ser inquilina, ou já ter se mudado. Quem confirma quem é o
 *    dono é a matrícula. A tela tem que dizer isso, e diz.
 */
function ContatosCnpj({ imovel }: { imovel: Record<string, any> }) {
  const c = Array.isArray(imovel.contatos_cnpj) ? imovel.contatos_cnpj : null;
  if (!c?.length) return null;

  return (
    <section style={{ ...cartao, borderLeft: "4px solid #0b6bcb" }}>
      <h2 style={h2}>🏢 Empresa registrada nesta unidade</h2>
      <p style={{ fontSize: 12.5, color: "#666", margin: "0 0 12px", lineHeight: 1.55 }}>
        A Receita Federal publica o endereço de todo CNPJ, com complemento. Estas
        empresas estão cadastradas em <b>{imovel.endereco}, {imovel.endereco_numero}
        {imovel.unidade ? ` · unidade ${imovel.unidade}` : ""}</b> — o mesmo do
        anúncio. Quem abre empresa em apartamento normalmente mora nele.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {c.slice(0, 6).map((x: any, i: number) => (
          <div
            key={i}
            style={{
              background: "#f6f9fc",
              border: "1px solid #dde7f0",
              borderRadius: 9,
              padding: "10px 12px"
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {x.nome}
              {x.pessoaFisica && (
                <span
                  style={{
                    ...tagPessoa,
                    marginLeft: 7
                  }}
                >
                  pessoa física
                </span>
              )}
            </div>
            {x.fone && (
              <div style={{ fontSize: 14, marginTop: 4 }}>
                <a href={`tel:+55${x.fone}`} style={{ color: "#0b6bcb", fontWeight: 600 }}>
                  {fone(x.fone)}
                </a>
                {!x.local && (
                  <span style={{ fontSize: 11.5, color: "#8a6100", marginLeft: 8 }}>
                    DDD de fora do RS — pode ser contador, não o morador
                  </span>
                )}
              </div>
            )}
            {/* Para LTDA a razão social é o nome da empresa; quem interessa
                é o quadro societário. Pessoa física do QSA numa empresa
                registrada em apartamento é, quase sempre, quem mora nele. */}
            {Array.isArray(x.socios) && x.socios.length > 0 && (
              <div style={{ fontSize: 13, marginTop: 6 }}>
                <span style={{ color: "#777" }}>
                  {x.socios.length > 1 ? "sócios: " : "sócio: "}
                </span>
                <b>{x.socios.join(" · ")}</b>
              </div>
            )}
            {x.complemento && (
              <div style={{ fontSize: 11.5, color: "#777", marginTop: 3 }}>
                cadastro: {x.complemento}
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 11,
          fontSize: 11.5,
          color: "#7a5600",
          background: "#fff8ed",
          border: "1px solid #f0d9a0",
          borderRadius: 8,
          padding: "9px 11px",
          lineHeight: 1.5
        }}
      >
        <b>Isto não prova propriedade.</b> Diz que existe uma empresa cadastrada
        neste endereço. A pessoa pode ser inquilina ou já ter mudado — quem
        confirma quem é o dono é a matrícula, acima.
      </div>
    </section>
  );
}

/**
 * Quem mais está NO PRÉDIO — não necessariamente na unidade anunciada.
 *
 * Mais fraco que `contatos_cnpj`, e a tela precisa dizer isso: serve para o
 * corretor chegar ao prédio (a administração, um vizinho que sabe de quem é o
 * 802), não para ligar afirmando que fala com o dono.
 *
 * ⭐ O CONDOMÍNIO vem primeiro quando existe: ele tem CNPJ próprio registrado
 *    no endereço, quem atende é a administração, e a administração sabe de
 *    quem é cada unidade. É a porta mais direta do prédio.
 */
function ContatosPredio({ imovel }: { imovel: Record<string, any> }) {
  const c = Array.isArray(imovel.contatos_predio) ? imovel.contatos_predio : null;
  if (!c?.length) return null;

  const cond = c.filter((x: any) => x.condominio);
  const gente = c.filter((x: any) => !x.condominio);

  return (
    <section style={{ ...cartao, borderLeft: "4px solid #64748b" }}>
      <h2 style={h2}>🏘️ Quem mais está neste prédio</h2>

      {cond.length > 0 && (
        <div style={{ marginBottom: gente.length ? 14 : 0 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            <b>Administração do condomínio</b> — é quem sabe de quem é cada unidade
          </div>
          {cond.map((x: any, i: number) => (
            <div key={i} style={{ ...linhaContato, background: "#eef6ff", borderColor: "#cfe2f7" }}>
              <span style={{ fontWeight: 700 }}>{x.nome}</span>
              {x.fone && (
                <a href={`tel:+55${x.fone}`} style={{ color: "#0b6bcb", fontWeight: 600 }}>
                  {fone(x.fone)}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {gente.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            {gente.length} {gente.length === 1 ? "cadastro" : "cadastros"} de outras
            unidades do mesmo endereço
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {gente.slice(0, 10).map((x: any, i: number) => (
              <div key={i} style={linhaContato}>
                <span>
                  {x.unidade && (
                    <span style={{ color: "#888", marginRight: 6 }}>un. {x.unidade}</span>
                  )}
                  <b>{x.nome}</b>
                </span>
                {x.fone && (
                  <a href={`tel:+55${x.fone}`} style={{ color: "#0b6bcb", fontWeight: 600 }}>
                    {fone(x.fone)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 11,
          fontSize: 11.5,
          color: "#555",
          background: "#f6f7f9",
          borderRadius: 8,
          padding: "9px 11px",
          lineHeight: 1.5
        }}
      >
        Estes cadastros são do <b>endereço</b>, não da unidade anunciada. Servem
        para chegar ao prédio — quem confirma quem é o dono é a matrícula.
      </div>
    </section>
  );
}

/** "12345678909" → "123.***.**9-09" — o corretor não precisa do CPF inteiro. */
function docMascarado(d: string | null): string | null {
  const v = String(d ?? "").replace(/\D/g, "");
  if (v.length === 11) return `${v.slice(0, 3)}.***.**${v.slice(8, 9)}-${v.slice(9)}`;
  if (v.length === 14) return `${v.slice(0, 2)}.***.***/${v.slice(8, 12)}-${v.slice(12)}`;
  return null;
}

/**
 * Empresas nos números VIZINHOS da mesma rua.
 *
 * É a pista mais fraca das três (unidade > prédio > entorno) e a tela diz
 * isso. Serve para bater na porta ao lado: o vizinho sabe de quem é o imóvel,
 * há quanto tempo está à venda e quem já veio olhar.
 */
function ContatosEntorno({ imovel }: { imovel: Record<string, any> }) {
  const c = Array.isArray(imovel.contatos_entorno) ? imovel.contatos_entorno : null;
  if (!c?.length) return null;
  return (
    <section style={{ ...cartao, borderLeft: "4px solid #94a3b8" }}>
      <h2 style={h2}>📍 No entorno (mesma rua, números vizinhos)</h2>
      <p style={{ fontSize: 12.5, color: "#666", margin: "0 0 10px", lineHeight: 1.55 }}>
        Nenhuma empresa registrada no endereço exato. Estas estão a poucos
        números de distância — servem para perguntar, não para afirmar.
      </p>
      <div style={{ display: "grid", gap: 5 }}>
        {c.slice(0, 6).map((x: any, i: number) => (
          <div key={i} style={linhaContato}>
            <span>
              <span style={{ color: "#888", marginRight: 6 }}>nº {x.numero}</span>
              <b>{x.nome}</b>
              <span style={{ fontSize: 11, color: "#999", marginLeft: 6 }}>
                {x.distancia} {x.distancia === 1 ? "número" : "números"} de distância
              </span>
            </span>
            {x.fone && (
              <a href={`tel:+55${x.fone}`} style={{ color: "#0b6bcb", fontWeight: 600 }}>
                {fone(x.fone)}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * O MESMO imóvel anunciado em outros portais.
 *
 * ⭐ Quando os preços divergem, é o argumento mais direto que existe: o dono
 *    não tem exclusividade e as imobiliárias nem se falam. Medido na base:
 *    51% dos grupos têm preço diferente, com 17,9% de diferença média.
 *
 * ⚠️ Mas atenção ao uso: só 99 dos 13.133 sem exclusiva são oportunidade — se
 *    o imóvel está em vários portais e um deles é a Auxiliadora, ele já é
 *    nosso. Na prática este bloco serve mais para ver onde ESTAMOS competindo
 *    conosco mesmos do que para prospectar.
 */
function OutrosPortais({ lista, imovel }: { lista: any[]; imovel: Record<string, any> }) {
  if (!lista?.length) return null;
  const brl = (v: number | null) =>
    v == null ? "—" : Number(v).toLocaleString("pt-BR",
      { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const precos = [imovel.price, ...lista.map((x) => x.preco)]
    .map(Number).filter((n) => n > 0);
  const menor = Math.min(...precos);
  const maior = Math.max(...precos);
  const diverge = precos.length > 1 && maior > menor;
  const dif = diverge ? Math.round(((maior - menor) / maior) * 100) : 0;

  return (
    <section style={{ ...cartao, borderLeft: `4px solid ${diverge ? "#b45309" : "#94a3b8"}` }}>
      <h2 style={h2}>🔁 O mesmo imóvel em outros portais ({lista.length})</h2>

      {diverge && (
        <div style={{
          background: "#fff8ed", border: "1px solid #f0d9a0", color: "#7a5600",
          borderRadius: 9, padding: "11px 13px", fontSize: 13, lineHeight: 1.55,
          marginBottom: 12
        }}>
          <b>Sem exclusividade, e os preços não batem — {dif}% de diferença.</b>{" "}
          Vai de {brl(menor)} a {brl(maior)} para o mesmo imóvel. O dono está com
          várias imobiliárias que não se falam.
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {lista.map((x) => (
          <div key={x.id} style={linhaContato}>
            <span>
              <Link href={`/imoveis/${x.id}`} style={{ color: "#0366d6", fontWeight: 600 }}>
                {x.anunciante ?? x.fonte}
              </Link>
              <span style={{ color: "#888", fontSize: 11.5, marginLeft: 6 }}>{x.fonte}</span>
            </span>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <b>{brl(x.preco)}</b>
              {x.url && (
                <a href={x.url} target="_blank" rel="noreferrer"
                   style={{ color: "#0366d6", fontSize: 11.5 }}>ver ↗</a>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Outros imóveis à venda no mesmo prédio. */
function NoPredio({
  lista,
  imovel
}: {
  lista: any[];
  imovel: Record<string, any>;
}) {
  if (!lista?.length) return null;
  const brl = (v: number | null) =>
    v == null ? "—" : Number(v).toLocaleString("pt-BR",
      { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const meuM2 =
    imovel.price && imovel.area ? Number(imovel.price) / Number(imovel.area) : null;

  return (
    <section style={cartao}>
      <h2 style={h2}>🏢 Outros à venda neste prédio ({lista.length})</h2>
      <p style={{ fontSize: 12.5, color: "#666", margin: "0 0 12px", lineHeight: 1.55 }}>
        Comparável direto — o corretor argumenta com o vizinho de porta, não com
        a média do bairro. Vários à venda ao mesmo tempo também é sinal: pode
        ser obra, taxa de condomínio ou mudança no prédio.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: "#777", textAlign: "left" }}>
              <th style={th}>Unidade</th><th style={th}>Área</th>
              <th style={th}>Preço</th><th style={th}>R$/m²</th>
              <th style={th}>Portal</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                <td style={td}>
                  <Link href={`/imoveis/${v.id}`} style={{ color: "#0366d6", fontWeight: 600 }}>
                    {v.unidade ?? "—"}
                  </Link>
                  {v.ja_e_nosso && (
                    <span style={{ ...tagPessoa, background: "#fee2e2", color: "#991b1b", marginLeft: 6 }}>
                      nosso
                    </span>
                  )}
                </td>
                <td style={td}>{v.area ? `${v.area} m²` : "—"}</td>
                <td style={td}>{brl(v.preco)}</td>
                <td style={{ ...td, fontWeight: 600,
                             color: meuM2 && v.preco_m2 && v.preco_m2 < meuM2 ? "#991b1b" : "#157f3c" }}>
                  {v.preco_m2 ? brl(v.preco_m2) : "—"}
                </td>
                <td style={{ ...td, color: "#888" }}>{v.fonte}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meuM2 && (
        <div style={{ fontSize: 11.5, color: "#777", marginTop: 8 }}>
          Em <b style={{ color: "#991b1b" }}>vermelho</b>, o vizinho que pede
          menos por m² que este imóvel.
        </div>
      )}
    </section>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, fontSize: 11 };
const td: React.CSSProperties = { padding: "7px 8px" };

/** Contatos de base própria importada pelo admin (ver /admin/importar). */
function ContatosImportados({ imovel }: { imovel: Record<string, any> }) {
  const c = Array.isArray(imovel.contatos_importados) ? imovel.contatos_importados : null;
  if (!c?.length) return null;

  return (
    <section style={{ ...cartao, borderLeft: "4px solid #7c3aed" }}>
      <h2 style={h2}>📇 Da nossa base</h2>
      <div style={{ display: "grid", gap: 5 }}>
        {c.slice(0, 12).map((x: any, i: number) => (
          <div key={i} style={linhaContato}>
            <span>
              <b>{x.nome ?? "—"}</b>
              {x.unidade && <span style={{ color: "#888", marginLeft: 6 }}>un. {x.unidade}</span>}
              {x.forca === "predio" && (
                <span style={{ fontSize: 11, color: "#8a6100", marginLeft: 7 }}>
                  (endereço, não a unidade)
                </span>
              )}
              {(x.doc || x.nascimento) && (
                <div style={{ fontSize: 11.5, color: "#777" }}>
                  {docMascarado(x.doc)}
                  {x.doc && x.nascimento ? " · " : ""}
                  {x.nascimento
                    ? new Date(x.nascimento).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                    : ""}
                </div>
              )}
              {x.obs && <div style={{ fontSize: 11.5, color: "#777" }}>{x.obs}</div>}
            </span>
            <span style={{ display: "flex", gap: 10 }}>
              {x.fone && (
                <a href={`tel:+55${x.fone}`} style={{ color: "#7c3aed", fontWeight: 600 }}>
                  {fone(x.fone)}
                </a>
              )}
              {x.email && (
                <a href={`mailto:${x.email}`} style={{ color: "#7c3aed" }}>{x.email}</a>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const linhaContato: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  background: "#f6f7f9",
  border: "1px solid #e8ecef",
  borderRadius: 8,
  padding: "8px 11px"
};

const tagPessoa: React.CSSProperties = {
  background: "#dcfce7",
  color: "#166534",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 10.5,
  fontWeight: 700,
  verticalAlign: "middle"
};

function Resumo({ r, v, forte }: { r: string; v: React.ReactNode; forte?: boolean }) {
  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 10.5, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {r}
      </div>
      <div style={{ fontSize: forte ? 19 : 15, fontWeight: forte ? 800 : 600, marginTop: 2 }}>
        {v}
      </div>
    </div>
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
const faixaResumo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  borderTop: "3px solid #111"
};
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
