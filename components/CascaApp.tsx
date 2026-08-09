import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MenuLateral, { type ItemMenu } from "./MenuLateral";

/**
 * Casca da área logada: menu lateral + conteúdo.
 *
 * Um lugar só monta o menu para painel, lista, mapa e admin — antes cada
 * layout repetia a sua própria barra e elas foram divergindo (o link "Mapa"
 * do painel ainda apontava para `/` depois que o mapa mudou de rota).
 */
export default async function CascaApp({
  children,
  largura = 1200
}: {
  children: React.ReactNode;
  largura?: number;
}) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: eu }, { count: naoLidas }] = await Promise.all([
    supabase
      .from("corretores")
      .select("role, cidade, bairros")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("notificacoes")
      .select("*", { count: "exact", head: true })
      .eq("corretor_id", user.id)
      .eq("visualizada", false)
  ]);

  const bairros: string[] = eu?.bairros ?? [];
  const territorio = bairros.length
    ? `${bairros.slice(0, 2).join(" · ")}${bairros.length > 2 ? ` +${bairros.length - 2}` : ""}`
    : eu?.cidade ?? null;

  const itens: ItemMenu[] = [
    // A "fila do dia" saiu: uma cota de dez imóveis sem contexto não é como o
    // corretor trabalha. Ele parte do bairro e filtra a lista pelo que quer
    // (matrícula, contato, sobrepreço).
    { href: "/painel", rotulo: "Meu bairro", icone: "◎", badge: naoLidas ?? 0 },
    { href: "/mapa", rotulo: "Mapa", icone: "◈" },
    { href: "/imoveis", rotulo: "Buscar imóveis", icone: "⌕", prefixo: true },
    { href: "/painel/favoritos", rotulo: "Favoritos", icone: "★" },
    { href: "/painel/alertas", rotulo: "Alertas", icone: "◔" }
  ];

  if (eu?.role === "admin" || eu?.role === "super_admin") {
    itens.push({ href: "/admin", rotulo: "Administração", icone: "⚙", prefixo: true });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f6f8" }}>
      <MenuLateral itens={itens} email={user.email ?? null} territorio={territorio} />
      <main className="im-conteudo" style={{ padding: "26px 24px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: largura, margin: "0 auto" }}>{children}</div>
      </main>
      {/* a lateral é fixa: o conteúdo precisa da margem no desktop e de
          nenhuma no celular, onde ela vira gaveta */}
      <style>{`
        .im-conteudo { margin-left: 220px; }
        @media (max-width: 860px) { .im-conteudo { margin-left: 0; } }
      `}</style>
    </div>
  );
}
