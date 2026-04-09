import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Superag - Agenciamento de Imóveis",
  description: "Plataforma para corretores fazerem agenciamento de imóveis"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
