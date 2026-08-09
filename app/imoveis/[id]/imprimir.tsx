"use client";

/**
 * Botão de impressão da ficha.
 *
 * O CSS de impressão mora aqui junto: some com cabeçalho, botões e links de
 * navegação, tira sombra e fundo (que gastam tinta e não dizem nada no papel)
 * e evita que um bloco quebre no meio da página. O corretor imprime e leva.
 */
export default function Imprimir() {
  return (
    <>
      <button onClick={() => window.print()} style={botao} className="im-sem-impressao">
        🖨 Imprimir ficha
      </button>
      <style>{`
        @media print {
          .im-sem-impressao, header, nav, .im-conteudo > style { display: none !important }
          .im-conteudo { margin-left: 0 !important }
          body { background: #fff !important }
          main { max-width: 100% !important; padding: 0 !important }
          section { break-inside: avoid; box-shadow: none !important;
                    border: 1px solid #ddd !important; margin-bottom: 10px !important }
          a { color: #000 !important; text-decoration: none !important }
          img { max-height: 90px !important }
        }
      `}</style>
    </>
  );
}

const botao: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "8px 13px",
  fontSize: 12.5,
  cursor: "pointer",
  whiteSpace: "nowrap"
};
