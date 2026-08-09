import CascaApp from "@/components/CascaApp";

// A lista fica dentro da mesma casca do painel: o corretor navega entre
// bairro, mapa e busca sem trocar de "site".
export default function ImoveisLayout({ children }: { children: React.ReactNode }) {
  return <CascaApp largura={1240}>{children}</CascaApp>;
}
