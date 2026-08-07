// ImovelMap Radar — cliente da EF `ingerir`

import { EF_INGERIR, EF_DOSSIE, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { pegarToken } from "./auth.js";

/**
 * Sobe um lote. Devolve o resumo da EF:
 *   { ok, total, novos, atualizados, erros, descartados, resultados[] }
 * Lanca em falha de rede ou HTTP != 2xx — o chamador aplica backoff.
 */
export async function enviarLote(itens, { portal = null, modo = "passivo" } = {}) {
  const token = await pegarToken();

  const resp = await fetch(EF_INGERIR, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items: itens, portal, modo }),
  });

  if (!resp.ok) {
    let detalhe = "";
    try {
      detalhe = (await resp.json())?.error ?? "";
    } catch {
      /* corpo nao-JSON */
    }
    const erro = new Error(`ingerir HTTP ${resp.status}${detalhe ? `: ${detalhe}` : ""}`);
    erro.status = resp.status;
    throw erro;
  }

  return resp.json();
}

/**
 * Dossie de um anuncio, por (source, externalId) — que e o que o HUD
 * consegue deduzir da URL da pagina. Se o imovel ainda nao esta na base,
 * a EF devolve { ok:true, mapeado:false }, e isso tambem e informacao:
 * anuncio novo que ninguem viu ainda.
 */
export async function pedirDossie({ source, externalId, imovelId, cnpj } = {}) {
  const token = await pegarToken();

  const resp = await fetch(EF_DOSSIE, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ source, externalId, imovelId, cnpj }),
  });

  if (!resp.ok) {
    let detalhe = "";
    try {
      detalhe = (await resp.json())?.error ?? "";
    } catch {
      /* corpo nao-JSON */
    }
    const erro = new Error(`dossie HTTP ${resp.status}${detalhe ? `: ${detalhe}` : ""}`);
    erro.status = resp.status;
    throw erro;
  }

  return resp.json();
}
