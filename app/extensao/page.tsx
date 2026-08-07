import Link from "next/link";

// Atualizar quando publicar uma nova build da extensao.
// O arquivo fica em public/extensao/imovelmap-radar-<VERSAO>.zip
const VERSAO = "0.4.0";
const ARQUIVO = `/extensao/imovelmap-radar-${VERSAO}.zip`;
const DISPONIVEL = true;

export const metadata = {
  title: "ImovelMap Radar — Extensão para Chrome",
  description:
    "Capture imóveis de qualquer portal enquanto navega e veja o dossiê do imóvel na própria página do anúncio."
};

export default function ExtensaoPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header style={header}>
        <Link href="/" style={logo}>
          ImovelMap
        </Link>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Link href="/imoveis" style={navLink}>
            Lista
          </Link>
          <Link href="/painel" style={navBtn}>
            Painel do corretor
          </Link>
        </nav>
      </header>

      <main style={main}>
        <section style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛰️</div>
          <h1 style={h1}>ImovelMap Radar</h1>
          <p style={sub}>
            A extensão que transforma sua navegação em base de agenciamento.
            Você navega no ZAP, VivaReal, OLX ou em qualquer imobiliária — os
            imóveis entram no seu ImovelMap sozinhos, com endereço resolvido e
            dossiê do proprietário.
          </p>

          {DISPONIVEL ? (
            <a href={ARQUIVO} download style={btnPrimary}>
              Baixar para Chrome — v{VERSAO}
            </a>
          ) : (
            <span style={btnDisabled}>Em breve — v{VERSAO}</span>
          )}

          <p style={{ fontSize: 13, color: "#999", marginTop: 12 }}>
            Chrome, Edge, Brave ou qualquer navegador baseado em Chromium
          </p>
        </section>

        <section style={grid}>
          {RECURSOS.map((r) => (
            <div key={r.titulo} style={card}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{r.icone}</div>
              <h3 style={cardTitulo}>{r.titulo}</h3>
              <p style={cardTexto}>{r.texto}</p>
            </div>
          ))}
        </section>

        <section style={boxInstalar}>
          <h2 style={h2}>Como instalar</h2>
          <ol style={lista}>
            <li>
              Baixe o arquivo <code style={code}>imovelmap-radar-{VERSAO}.zip</code>{" "}
              e descompacte numa pasta que você não vá apagar.
            </li>
            <li>
              Abra <code style={code}>chrome://extensions</code> no navegador.
            </li>
            <li>
              Ligue o <strong>Modo do desenvolvedor</strong> no canto superior
              direito.
            </li>
            <li>
              Clique em <strong>Carregar sem compactação</strong> e selecione a
              pasta que você descompactou.
            </li>
            <li>
              Clique no ícone do ImovelMap na barra e depois em{" "}
              <strong>Conectar</strong> — você entra com a mesma conta do site.
            </li>
          </ol>
          <p style={{ fontSize: 13, color: "#777", marginTop: 16 }}>
            Já instalou?{" "}
            <Link href="/extensao/conectar" style={{ color: "#0366d6" }}>
              Conectar a extensão à sua conta
            </Link>
          </p>
        </section>

        <section style={boxNota}>
          <strong style={{ display: "block", marginBottom: 6 }}>
            Sobre privacidade
          </strong>
          A extensão só age nos portais de imóveis que você autorizar, um a um.
          Ela não lê sua navegação pessoal, não guarda sua senha e você pode
          desligar a captura a qualquer momento pelo ícone na barra.
        </section>
      </main>
    </div>
  );
}

const RECURSOS = [
  {
    icone: "🎯",
    titulo: "Captura automática",
    texto:
      "Role uma busca no portal e dezenas de imóveis entram na sua base, com foto, preço e coordenada — sem copiar nada."
  },
  {
    icone: "🏠",
    titulo: "Endereço revelado",
    texto:
      "O portal esconde o endereço. Cruzamos o anúncio com o cadastro de IPTU da prefeitura e a fachada para descobrir o prédio e a unidade."
  },
  {
    icone: "🔥",
    titulo: "Radar de oportunidade",
    texto:
      "O mesmo imóvel em vários portais com preços diferentes significa proprietário sem exclusividade. Você vê isso na hora."
  },
  {
    icone: "📉",
    titulo: "Histórico de preço",
    texto:
      "Quanto caiu e há quantos dias está parado — os dois sinais que dizem quando o proprietário está pronto para trocar de corretor."
  },
  {
    icone: "🕵️",
    titulo: "Dossiê do proprietário",
    texto:
      "CNPJ do condomínio, administradora, síndico e o cartório certo para pedir a matrícula com nome e CPF do dono."
  },
  {
    icone: "📍",
    titulo: "Qualquer site",
    texto:
      "Achou um imóvel numa imobiliária pequena? Um clique e ele entra estruturado no seu mapa, mesmo sem integração."
  }
];

const header: React.CSSProperties = {
  height: 64,
  padding: "0 20px",
  background: "#fff",
  borderBottom: "1px solid #eaeaea",
  display: "flex",
  alignItems: "center",
  gap: 16
};

const logo: React.CSSProperties = {
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
  padding: "8px 14px",
  borderRadius: 8
};

const main: React.CSSProperties = {
  maxWidth: 880,
  margin: "0 auto",
  padding: "56px 20px 80px"
};

const h1: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 800,
  letterSpacing: -1,
  marginBottom: 14
};

const h2: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  marginBottom: 14
};

const sub: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.6,
  color: "#555",
  maxWidth: 620,
  margin: "0 auto 28px"
};

const btnPrimary: React.CSSProperties = {
  display: "inline-block",
  background: "#111",
  color: "#fff",
  fontSize: 16,
  fontWeight: 600,
  padding: "14px 28px",
  borderRadius: 10
};

const btnDisabled: React.CSSProperties = {
  ...btnPrimary,
  background: "#ddd",
  color: "#888"
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
  marginBottom: 48
};

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 12,
  padding: 20
};

const cardTitulo: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 6
};

const cardTexto: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#666"
};

const boxInstalar: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 12,
  padding: 28,
  marginBottom: 24
};

const lista: React.CSSProperties = {
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  fontSize: 15,
  lineHeight: 1.55,
  color: "#444"
};

const code: React.CSSProperties = {
  background: "#f2f2f4",
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 13,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
};

const boxNota: React.CSSProperties = {
  background: "#f0f6ff",
  border: "1px solid #d6e4ff",
  borderRadius: 12,
  padding: 20,
  fontSize: 14,
  lineHeight: 1.6,
  color: "#334"
};
