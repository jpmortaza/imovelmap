import EntrarForm from "./entrar-form";

// A página inicial É a tela de login. Não há vitrine: quem chega aqui ou é
// corretor, ou não tem o que ver. O mapa, a lista e o painel exigem sessão,
// e um site de marketing na frente disso só atrasava quem vem trabalhar.
export const dynamic = "force-dynamic";

export default function Home() {
  return <EntrarForm />;
}
