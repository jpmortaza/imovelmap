import Link from "next/link";
import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ⭐ A PRIMEIRA E ÚNICA TELA DE PARTIDA DO CORRETOR É O BAIRRO DELE.
//
// Existia uma "fila do dia" com cota de dez imóveis. Saiu: o corretor não
// trabalha por cota, trabalha por território — ele olha o bairro inteiro e
// filtra a lista pelo que quer (matrícula, contato, sobrepreço). Cada número
// daqui é um link que abre a lista já filtrada.

const MapaImoveis = nextDynamic(() => import("@/components/MapaImoveis"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 460, display: "grid", placeItems: "center", color: "#999" }}>
      Carregando mapa do bairro…
    </div>
  )
});

export const dynamic = "force-dynamic";

type Stats = {
  total: number;
  venda: number;
  aluguel: number;
  nossos: number;
  oportunidades: number;
  comMatricula: number;
  comCandidatas: number;
  comContato: number;
  caros: number;
  novos7d: number;
  precoMediano: number | null;
  m2Mediano: number | null;
  centro: { lat: number | null; lng: number | null } | null;
};

const nf = new Intl.NumberFormat("pt-BR");
const brl = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default async function Painel() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?de=/painel");

  const { data: eu } = await supabase
    .from("corretores")
    .select("nome, cidade, bairros")
    .eq("id", user.id)
    .maybeSingle();

  const bairros: string[] = eu?.bairros ?? [];
  const cidade: string | null = eu?.cidade ?? null;

  // Sem território definido não há painel de bairro: o admin precisa
  // atribuir um em /admin/corretores. Dizemos isso em vez de mostrar a
  // cidade inteira, que não é o trabalho de ninguém.
  if (!bairros.length) {
    return (
      <div>
        <h1 style={h1}>Olá{eu?.nome ? `, ${eu.nome.split(" ")[0]}` : ""}</h1>
        <div style={avisoVazio}>
          <b>Você ainda não tem bairro atribuído.</b>
          <p style={{ margin: "8px 0 0", lineHeight: 1.6, fontSize: 14 }}>
            O painel mostra o seu território — quantos imóveis existem nele, o
            que já é nosso e o que é oportunidade. Peça a um administrador para
            definir a sua cidade e os seus bairros em{" "}
            <b>Administração → Corretores</b>.
          </p>
          <div style={{ marginTop: 14 }}>
            <Link href="/imoveis" style={btn}>
              Buscar imóveis
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { data } = await supabase.rpc("painel_bairro", {
    p_cidade: cidade,
    p_bairros: bairros
  });
  const s = (data ?? null) as Stats | null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={h1}>{bairros.join(" · ")}</h1>
        <span style={{ color: "#888", fontSize: 14 }}>{cidade}</span>
        <Link
          href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&sem_auxiliadora=1&com_matricula=2`}
          style={{ ...btn, marginLeft: "auto" }}
        >
          Trabalhar a lista →
        </Link>
      </div>

      {s && (
        <>
          {/* A leitura que importa primeiro: do que existe no bairro, quanto
              ainda não é nosso. É essa a conta do agenciamento. */}
          <div style={destaque}>
            <div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>Oportunidades no seu bairro</div>
              <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.4, lineHeight: 1.1 }}>
                {nf.format(s.oportunidades)}
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                de {nf.format(s.total)} imóveis · {nf.format(s.nossos)} já são nossos
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&sem_auxiliadora=1&com_matricula=2`}
                style={btnClaro}
              >
                Abrir a lista
              </Link>
            </div>
          </div>

          <div style={grade}>
            <Cartao
              titulo="Com matrícula"
              valor={nf.format(s.comMatricula)}
              nota="dá para pedir a certidão hoje"
              cor="#0b6bcb"
              href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&com_matricula=1`}
            />
            <Cartao
              titulo="Matrículas candidatas"
              valor={nf.format(s.comCandidatas)}
              nota="prédio certo, unidade a confirmar"
              cor="#4338ca"
              href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&com_matricula=2`}
            />
            <Cartao
              titulo="Nome e telefone"
              valor={nf.format(s.comContato)}
              nota="empresa registrada na unidade"
              cor="#157f3c"
              href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&com_contato=1`}
            />
            <Cartao
              titulo="Pedem acima do prédio"
              valor={nf.format(s.caros)}
              nota="60%+ acima do que o prédio vende"
              cor="#991b1b"
              href={`/imoveis?bairro=${encodeURIComponent(bairros[0])}&caro=1`}
            />
            <Cartao titulo="Preço mediano" valor={brl(s.precoMediano)} nota="venda" cor="#333" />
            <Cartao titulo="R$/m² mediano" valor={brl(s.m2Mediano)} nota="venda" cor="#333" />
          </div>

          <section style={cartaoMapa}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #eef1f4" }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>O bairro inteiro</h2>
              <p style={{ fontSize: 12.5, color: "#777", margin: "4px 0 0" }}>
                Vermelho é o que já é da Auxiliadora. Azul é o que não é — e é
                onde está o seu trabalho.
              </p>
            </div>
            <MapaImoveis territorio={bairros} cidade={cidade ?? undefined} altura="520px" />
          </section>
        </>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  nota,
  cor,
  href
}: {
  titulo: string;
  valor: string;
  nota: string;
  cor: string;
  href?: string;
}) {
  const corpo = (
    <>
      <div style={{ fontSize: 12, color: "#777", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.8, color: cor, marginTop: 4 }}>
        {valor}
      </div>
      <div style={{ fontSize: 12, color: "#8a8a8a", marginTop: 2 }}>{nota}</div>
    </>
  );
  return href ? (
    <Link href={href} style={{ ...cartao, textDecoration: "none", display: "block" }}>
      {corpo}
    </Link>
  ) : (
    <div style={cartao}>{corpo}</div>
  );
}

const h1: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  letterSpacing: -0.7,
  margin: "0 0 4px"
};

const destaque: React.CSSProperties = {
  background: "linear-gradient(135deg,#11161d,#1d2b3a)",
  color: "#fff",
  borderRadius: 14,
  padding: "22px 24px",
  margin: "18px 0 14px",
  display: "flex",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap"
};

const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
  gap: 10,
  marginBottom: 18
};

const cartao: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ecef",
  borderRadius: 12,
  padding: "14px 16px",
  color: "inherit"
};

const cartaoMapa: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ecef",
  borderRadius: 12,
  overflow: "hidden"
};

const avisoVazio: React.CSSProperties = {
  background: "#fff8ed",
  border: "1px solid #f0d9a0",
  color: "#7a5600",
  borderRadius: 12,
  padding: "18px 20px",
  marginTop: 12
};

const btn: React.CSSProperties = {
  background: "#111",
  color: "#fff",
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 13.5,
  fontWeight: 600,
  textDecoration: "none"
};
const btnClaro: React.CSSProperties = {
  background: "#fff",
  color: "#111",
  borderRadius: 9,
  padding: "10px 18px",
  fontSize: 13.5,
  fontWeight: 700,
  textDecoration: "none"
};
const btnSec: React.CSSProperties = {
  background: "#fff",
  color: "#333",
  border: "1px solid #ddd",
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 13.5,
  textDecoration: "none"
};
