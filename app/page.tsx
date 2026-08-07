import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// ⭐ VITRINE PÚBLICA. Aqui NÃO entra endereço, coordenada nem anúncio
//    individual — só número agregado. O mapa, que é a ferramenta de
//    prospecção, mora em `/mapa` e exige login.
//
//    A regra de sempre: o endereço é o produto. Um visitante anônimo vê o
//    tamanho e o formato do mercado; quem trabalha nele precisa entrar.

export const revalidate = 1800;

type Bairro = { bairro: string; n: number; mediana: number };
type Stats = {
  total: number;
  venda: number;
  aluguel: number;
  cidades: number;
  bairros: number;
  fontes: number;
  atualizado: string | null;
  precoMediano: number | null;
  topBairros: Bairro[] | null;
};

const nf = new Intl.NumberFormat("pt-BR");
const brl = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0
      });

async function estatisticas(): Promise<Stats | null> {
  const svc = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await svc.rpc("estatisticas_publicas");
  if (error) return null;
  return data as Stats;
}

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const s = await estatisticas();

  const atualizado = s?.atualizado
    ? new Date(s.atualizado).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long"
      })
    : null;

  return (
    <div style={{ background: "#fff", color: "#111" }}>
      <header style={header}>
        <Link href="/" style={marca}>
          ImovelMap
        </Link>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/extensao" style={navLink}>
            Extensão
          </Link>
          {user ? (
            <>
              <Link href="/mapa" style={navLink}>
                Mapa
              </Link>
              <Link href="/painel" style={navBtn}>
                Painel do corretor
              </Link>
            </>
          ) : (
            <Link href="/login" style={navBtn}>
              Entrar
            </Link>
          )}
        </nav>
      </header>

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <section style={hero}>
        <div style={container}>
          <div style={selo}>Rio Grande do Sul · atualizado {atualizado ?? "diariamente"}</div>
          <h1 style={h1}>
            {s ? nf.format(s.venda) : "70 mil"} imóveis à venda,
            <br />
            <span style={{ color: "#157f3c" }}>reunidos num lugar só.</span>
          </h1>
          <p style={subtitulo}>
            Juntamos o que está anunciado nas imobiliárias do estado e cruzamos
            com os dados abertos da prefeitura e da Receita Federal. O resultado
            é um retrato do mercado que nenhum anúncio isolado mostra: quanto
            cada prédio realmente vendeu, há quanto tempo cada dono comprou e
            onde o preço está fora da curva.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 26 }}>
            <Link href="/login" style={ctaPrimario}>
              Entrar como corretor
            </Link>
            <a href="#mercado" style={ctaSecundario}>
              Ver o mercado
            </a>
          </div>
        </div>
      </section>

      {/* ── números ──────────────────────────────────────────────────── */}
      {s && (
        <section style={{ ...container, marginTop: -36, marginBottom: 56 }}>
          <div style={faixaNumeros}>
            <Numero valor={nf.format(s.total)} rotulo="imóveis na base" />
            <Numero valor={nf.format(s.cidades)} rotulo="cidades do RS" />
            <Numero valor={nf.format(s.bairros)} rotulo="bairros" />
            <Numero valor={brl(s.precoMediano)} rotulo="preço mediano de venda" />
          </div>
        </section>
      )}

      {/* ── bairros ──────────────────────────────────────────────────── */}
      {s?.topBairros?.length ? (
        <section id="mercado" style={{ ...container, marginBottom: 64 }}>
          <h2 style={h2}>Onde está a oferta em Porto Alegre</h2>
          <p style={{ ...texto, marginBottom: 22 }}>
            Bairros com mais imóveis anunciados à venda, e o preço mediano de
            cada um. Só bairros com pelo menos 30 anúncios — abaixo disso a
            mediana não diz nada.
          </p>

          <div style={grade}>
            {s.topBairros.map((b) => (
              <div key={b.bairro} style={cartaoBairro}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{b.bairro}</div>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginTop: 6 }}>
                  {nf.format(b.n)}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>imóveis à venda</div>
                <div style={{ fontSize: 13, color: "#157f3c", fontWeight: 600, marginTop: 8 }}>
                  mediana {brl(b.mediana)}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── para corretores ──────────────────────────────────────────── */}
      <section style={faixaEscura}>
        <div style={container}>
          <h2 style={{ ...h2, color: "#fff" }}>Para quem trabalha com agenciamento</h2>
          <p style={{ ...texto, color: "#b9c4d0", maxWidth: 660 }}>
            Um anúncio esconde o endereço, o dono e o histórico. Nós
            reconstruímos os três a partir de dado público — e entregamos ao
            corretor uma fila de trabalho, não uma lista de imóveis.
          </p>

          <div style={{ ...grade, marginTop: 28 }}>
            <Recurso
              titulo="Endereço e matrícula"
              texto="A prefeitura publica o ITBI de Porto Alegre com o número da matrícula e o cartório. Você pede a certidão direto, sem pagar busca às cegas."
            />
            <Recurso
              titulo="Preço contra o prédio"
              texto="Sabemos quanto cada prédio realmente vendeu nos últimos três anos. Anúncio muito acima disso encalha — e dono de imóvel encalhado escuta proposta."
            />
            <Recurso
              titulo="Há quanto tempo o dono comprou"
              texto="Quem comprou há oito anos está mais perto de vender do que quem comprou ano passado. Está na base, dá para ordenar por isso."
            />
            <Recurso
              titulo="Sem exclusividade"
              texto="Quando o mesmo imóvel aparece em portais diferentes com preços diferentes, não há exclusiva — e há espaço para conversar."
            />
          </div>

          <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/login" style={{ ...ctaPrimario, background: "#fff", color: "#111" }}>
              Entrar
            </Link>
            <Link
              href="/extensao"
              style={{ ...ctaSecundario, borderColor: "#3a4654", color: "#dbe4ee" }}
            >
              Conhecer a extensão
            </Link>
          </div>
        </div>
      </section>

      <footer style={rodape}>
        <div style={{ ...container, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>ImovelMap</span>
          <span style={{ color: "#888", fontSize: 13 }}>
            Dados de fontes públicas e de anúncios publicados pelas próprias
            imobiliárias.
          </span>
          <Link href="/login" style={{ ...navLink, marginLeft: "auto" }}>
            Área do corretor
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>{valor}</div>
      <div style={{ fontSize: 12.5, color: "#777", marginTop: 2 }}>{rotulo}</div>
    </div>
  );
}

function Recurso({ titulo, texto: t }: { titulo: string; texto: string }) {
  return (
    <div style={cartaoRecurso}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>{titulo}</div>
      <p style={{ fontSize: 13.5, color: "#a8b4c2", lineHeight: 1.6, margin: "7px 0 0" }}>{t}</p>
    </div>
  );
}

const container: React.CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "0 22px",
  width: "100%",
  boxSizing: "border-box"
};

const header: React.CSSProperties = {
  height: 64,
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "0 22px",
  borderBottom: "1px solid #eee",
  position: "sticky",
  top: 0,
  background: "rgba(255,255,255,.92)",
  backdropFilter: "blur(8px)",
  zIndex: 10
};
const marca: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: "#111",
  letterSpacing: -0.3
};
const navLink: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  padding: "8px 12px",
  borderRadius: 8
};
const navBtn: React.CSSProperties = {
  fontSize: 14,
  background: "#111",
  color: "#fff",
  padding: "9px 16px",
  borderRadius: 8,
  fontWeight: 600
};

const hero: React.CSSProperties = {
  background: "linear-gradient(180deg,#f4f8f5 0%,#fff 100%)",
  padding: "68px 0 84px"
};
const selo: React.CSSProperties = {
  display: "inline-block",
  background: "#e7f6ec",
  color: "#157f3c",
  borderRadius: 999,
  padding: "5px 13px",
  fontSize: 12.5,
  fontWeight: 600,
  marginBottom: 18
};
const h1: React.CSSProperties = {
  fontSize: "clamp(32px, 5.4vw, 54px)",
  lineHeight: 1.08,
  letterSpacing: -1.4,
  margin: 0,
  fontWeight: 800
};
const subtitulo: React.CSSProperties = {
  fontSize: 16.5,
  lineHeight: 1.65,
  color: "#555",
  maxWidth: 620,
  marginTop: 20
};
const ctaPrimario: React.CSSProperties = {
  background: "#157f3c",
  color: "#fff",
  padding: "13px 24px",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 700
};
const ctaSecundario: React.CSSProperties = {
  border: "1px solid #d5dde2",
  color: "#333",
  padding: "13px 24px",
  borderRadius: 10,
  fontSize: 15,
  fontWeight: 600
};

const faixaNumeros: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ecef",
  borderRadius: 14,
  boxShadow: "0 6px 22px rgba(0,0,0,.06)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  overflow: "hidden"
};

const h2: React.CSSProperties = {
  fontSize: 26,
  letterSpacing: -0.6,
  margin: "0 0 8px",
  fontWeight: 800
};
const texto: React.CSSProperties = { fontSize: 15, lineHeight: 1.65, color: "#555", margin: 0 };

const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
  gap: 12
};
const cartaoBairro: React.CSSProperties = {
  border: "1px solid #e8ecef",
  borderRadius: 12,
  padding: "16px 18px",
  background: "#fbfcfd"
};

const faixaEscura: React.CSSProperties = {
  background: "#11161d",
  padding: "62px 0 70px"
};
const cartaoRecurso: React.CSSProperties = {
  background: "#182029",
  border: "1px solid #232e3a",
  borderRadius: 12,
  padding: "18px 20px"
};

const rodape: React.CSSProperties = {
  borderTop: "1px solid #eee",
  padding: "26px 0",
  fontSize: 14
};
