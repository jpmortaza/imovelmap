import Link from "next/link";
import nextDynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ⭐ O MAPA É FERRAMENTA DE PROSPECÇÃO, NÃO VITRINE.
//
// Ele mostra onde cada imóvel está, o que a Auxiliadora já tem (vermelho) e o
// que é da concorrência (azul) — que é exatamente o mapa de oportunidades da
// operação. Isso não pode ficar aberto: qualquer concorrente leria a nossa
// carteira inteira e o resultado do nosso enriquecimento de graça.
//
// A vitrine pública é `/`, e lá só entram números agregados.

const MapaImoveis = nextDynamic(() => import("@/components/MapaImoveis"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "calc(100vh - 64px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#888"
      }}
    >
      Carregando mapa…
    </div>
  )
});

export const dynamic = "force-dynamic";

export default async function Mapa() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // o middleware já barra, mas a página não depende disso para se proteger
  if (!user) redirect("/login?de=/mapa");

  // ⭐ O MAPA É O TERRITÓRIO DO CORRETOR, não a cidade inteira. Ele trabalha o
  //    bairro dele; mostrar Porto Alegre toda é ruído — e faz o mapa carregar
  //    milhares de pinos que não são trabalho dele.
  //
  //    Sem território definido não dá para filtrar nada, então cai na cidade
  //    inteira: melhor que um mapa vazio sem explicação.
  const { data: eu } = await supabase
    .from("corretores")
    .select("cidade, bairros")
    .eq("id", user.id)
    .maybeSingle();

  const bairros: string[] = eu?.bairros ?? [];
  const cidade: string | null = eu?.cidade ?? null;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8" }}>
      <header style={header}>
        <Link href="/painel" style={{ fontSize: 20, fontWeight: 800, color: "#111", letterSpacing: -0.3 }}>
          ImovelMap
        </Link>
        <span style={{ color: "#aaa", fontSize: 13 }}>
          {bairros.length ? bairros.join(" · ") : "Mapa de prospecção"}
        </span>
        {/* mesma leitura do painel do bairro, para quem chega direto aqui */}
        <span
          style={{
            fontSize: 12.5,
            color: "#666",
            borderLeft: "1px solid #eee",
            paddingLeft: 14,
            marginLeft: 2
          }}
          className="im-legenda-topo"
        >
          <b style={{ color: "#dc2626" }}>Vermelho</b> já é da Auxiliadora ·{" "}
          <b style={{ color: "#2563eb" }}>azul</b> é onde está o seu trabalho
        </span>

        <nav style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <Link href="/imoveis" style={navLink}>
            Lista
          </Link>
          <Link href="/painel" style={navBtn}>
            Painel do corretor
          </Link>
        </nav>
      </header>

      {bairros.length === 0 && (
        <div style={avisoSemTerritorio}>
          Você não tem bairro atribuído, então o mapa está mostrando a cidade
          inteira. Peça a um administrador para definir o seu território em{" "}
          <b>Administração → Corretores</b> — o mapa passa a mostrar só o que é
          seu.
        </div>
      )}

      <MapaImoveis
        territorio={bairros.length ? bairros : undefined}
        cidade={cidade ?? undefined}
      />

      <style>{`
        @media (max-width: 780px) { .im-legenda-topo { display: none } }
      `}</style>
    </div>
  );
}

const avisoSemTerritorio: React.CSSProperties = {
  background: "#fff8ed",
  borderBottom: "1px solid #f0d9a0",
  color: "#7a5600",
  padding: "10px 20px",
  fontSize: 13,
  lineHeight: 1.5
};

const header: React.CSSProperties = {
  height: 64,
  padding: "0 20px",
  background: "#fff",
  borderBottom: "1px solid #eaeaea",
  display: "flex",
  alignItems: "center",
  gap: 16
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
