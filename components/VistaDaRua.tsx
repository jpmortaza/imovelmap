/**
 * Ver o imóvel por fora — Street View, satélite e rota.
 *
 * ⭐ Por que isso vale um bloco próprio: o corretor decide se vale a visita
 *    olhando o PRÉDIO. Foto de anúncio é do interior e é escolhida para vender;
 *    a fachada mostra a idade real, a rua, se tem portaria, se a garagem é na
 *    frente. Em prospecção isso é metade da qualificação.
 *
 * ⚠️ POR QUE SÃO LINKS E NÃO IMAGEM EMBUTIDA:
 *
 *    Embutir Street View exige chave do Google (Street View Static API). Os
 *    dois endpoints antigos que funcionavam sem chave — `output=svembed` e
 *    `/maps/embed/v1/streetview` sem key — hoje devolvem 404 com
 *    `x-frame-options: SAMEORIGIN`. Testado em 09/08/2026; não há caminho
 *    gratuito.
 *
 *    Link abre em aba nova, custa zero, não tem chave para rotacionar e nunca
 *    quebra por cota estourada. Se um dia a chave existir, o histórico do git
 *    tem a versão com proxy assinado server-side (commit e19c080 e o seguinte).
 */
export default function VistaDaRua({
  lat,
  lng,
  numeroInferido
}: {
  lat: number;
  lng: number;
  numeroInferido?: boolean;
}) {
  const coord = `${lat},${lng}`;
  // `map_action=pano` cai direto no Street View, não no mapa
  const pano = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coord}`;
  const aerea = `https://www.google.com/maps/@${coord},19z/data=!3m1!1e3`;
  const rota = `https://www.google.com/maps/dir/?api=1&destination=${coord}`;

  return (
    <div>
      <div style={grade}>
        <Acao href={pano} icone="👁" titulo="Ver a fachada" nota="Street View, na porta" destaque />
        <Acao href={aerea} icone="🛰" titulo="Vista aérea" nota="telhado, pátio, garagem" />
        <Acao href={rota} icone="🧭" titulo="Como chegar" nota="rota até o endereço" />
      </div>
      {numeroInferido && (
        <div style={{ fontSize: 11.5, color: "#8a6100", marginTop: 7, lineHeight: 1.5 }}>
          O número da porta foi deduzido — o Street View pode abrir no prédio
          vizinho. Confira a fachada antes de usar como referência.
        </div>
      )}
    </div>
  );
}

function Acao({
  href,
  icone,
  titulo,
  nota,
  destaque
}: {
  href: string;
  icone: string;
  titulo: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        ...cartao,
        background: destaque ? "#111" : "#fff",
        color: destaque ? "#fff" : "#111",
        borderColor: destaque ? "#111" : "#e2e6ea"
      }}
    >
      <span style={{ fontSize: 20 }}>{icone}</span>
      <span>
        <span style={{ display: "block", fontWeight: 700, fontSize: 13.5 }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 11.5, opacity: 0.7, marginTop: 1 }}>
          {nota}
        </span>
      </span>
      <span style={{ marginLeft: "auto", opacity: 0.5, fontSize: 13 }}>↗</span>
    </a>
  );
}

const grade: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 8
};

const cartao: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  border: "1px solid",
  borderRadius: 10,
  padding: "12px 14px",
  textDecoration: "none"
};
