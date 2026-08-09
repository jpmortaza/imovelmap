"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { lerBusca, paraQuery } from "@/lib/buscaNatural";

/**
 * Busca por descrição do cliente, em português.
 *
 * ⭐ O corretor não procura imóvel — ele procura o que resolve o CLIENTE que
 *    já é dele. "Casal, 2 dormitórios, Menino Deus, até 500 mil" é como ele
 *    pensa; doze campos de formulário não são.
 *
 * ⚠️ A leitura aparece ENQUANTO ELE DIGITA, e mostra também o que foi
 *    IGNORADO. Uma busca que aceitasse "sol da manhã" em silêncio e
 *    devolvesse casas sem sol da manhã pareceria quebrada — e o corretor
 *    levaria o cliente a uma visita errada. Dizer "não sei responder isso"
 *    custa menos.
 */
export default function BuscaNatural({ bairros }: { bairros: string[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();

  const leitura = useMemo(
    () => (texto.trim().length > 2 ? lerBusca(texto, bairros) : null),
    [texto, bairros]
  );

  const nadaEntendido = leitura && leitura.entendido.length === 0;

  function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!leitura || leitura.entendido.length === 0) return;
    const p = paraQuery(leitura.filtros);
    iniciar(() => router.push(`/imoveis${p.toString() ? "?" + p : ""}`));
  }

  return (
    <form onSubmit={buscar} style={caixa}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Descreva o cliente: casa de 2 dormitórios no Menino Deus até 500 mil com garagem"
          style={entrada}
        />
        <button
          type="submit"
          disabled={pendente || !leitura || leitura.entendido.length === 0}
          style={{ ...botao, opacity: leitura?.entendido.length ? 1 : 0.45 }}
        >
          {pendente ? "buscando…" : "Buscar"}
        </button>
      </div>

      {leitura && (
        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {leitura.entendido.length > 0 && (
            <>
              <span style={rotulo}>entendi</span>
              {leitura.entendido.map((x) => (
                <span key={x} style={selo}>{x}</span>
              ))}
            </>
          )}

          {leitura.ignorado.length > 0 && (
            <>
              <span style={{ ...rotulo, marginLeft: leitura.entendido.length ? 8 : 0 }}>
                não sei responder
              </span>
              {leitura.ignorado.map((x) => (
                <span key={x} style={seloIgnorado} title="não capturamos a descrição do anúncio">
                  {x}
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {leitura && leitura.ignorado.length > 0 && (
        <div style={aviso}>
          Estes termos dependem da <b>descrição</b> do anúncio, que os coletores
          ainda não guardam — então a busca vai ignorá-los em vez de fingir que
          filtrou. Orientação solar, por exemplo, aparece em 11 dos 72 mil
          anúncios.
        </div>
      )}

      {nadaEntendido && (
        <div style={{ ...aviso, background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b" }}>
          Não consegui extrair nenhum filtro. Tente algo como{" "}
          <i>“apartamento 3 quartos em Petrópolis até 800 mil”</i>.
        </div>
      )}
    </form>
  );
}

const caixa: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8ecef",
  borderRadius: 12,
  padding: 14,
  marginBottom: 12
};
const entrada: React.CSSProperties = {
  flex: 1,
  minWidth: 260,
  padding: "11px 13px",
  border: "1px solid #ddd",
  borderRadius: 9,
  fontSize: 14,
  outline: "none"
};
const botao: React.CSSProperties = {
  background: "#111",
  color: "#fff",
  border: 0,
  borderRadius: 9,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer"
};
const rotulo: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: 0.4
};
const selo: React.CSSProperties = {
  background: "#e7f6ec",
  color: "#157f3c",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12.5,
  fontWeight: 600
};
const seloIgnorado: React.CSSProperties = {
  background: "#fff8ed",
  color: "#8a6100",
  border: "1px dashed #f0d9a0",
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12.5
};
const aviso: React.CSSProperties = {
  marginTop: 10,
  background: "#fff8ed",
  border: "1px solid #f0d9a0",
  color: "#7a5600",
  borderRadius: 9,
  padding: "9px 12px",
  fontSize: 12.5,
  lineHeight: 1.55
};
