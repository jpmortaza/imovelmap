// ImovelMap Radar — engine
//
// Um so motor para todos os portais. Recebe (url interceptada, corpo cru) e
// o descriptor do host, devolve ImovelPayload[]. Toda a variacao entre
// portais vive em descriptors.js.

import { acharDescriptor, GENERICO, DESCRIPTORS, slugDoHost } from "./descriptors.js";

/**
 * @param {string} hostname  host da aba
 * @param {string} url       url da resposta interceptada
 * @param {string} corpo     corpo cru (texto)
 * @param {object} opcoes    { pagina, permitirGenerico }
 * @returns {{ portal: string|null, itens: object[], motivo: string|null }}
 */
export function processar(hostname, url, corpo, opcoes = {}) {
  const { pagina = "", permitirGenerico = false } = opcoes;

  const d = acharDescriptor(hostname, { permitirGenerico });
  if (!d) return { portal: null, itens: [], motivo: "portal-nao-suportado" };

  const rotulo = d.generico ? slugDoHost(hostname) : d.slug;
  if (!d.aceita(url)) return { portal: rotulo, itens: [], motivo: "url-ignorada" };

  let json;
  try {
    json = JSON.parse(corpo);
  } catch {
    return { portal: rotulo, itens: [], motivo: "corpo-nao-json" };
  }

  let itens = [];
  try {
    itens = d.extrair(json, { url, hostname, pagina }) ?? [];
  } catch (e) {
    return { portal: rotulo, itens: [], motivo: `extrator-falhou: ${e.message}` };
  }

  // higiene: sem id/source o resto do pipeline nao tem o que fazer.
  // Dedup por (source,id) porque um descriptor pode combinar duas fontes
  // (glue-api + JSON-LD da mesma pagina, por exemplo).
  const vistos = new Set();
  itens = itens.filter((i) => {
    if (!i?.id || !i?.source) return false;
    const k = `${i.source}::${i.id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });

  return {
    portal: rotulo,
    itens,
    motivo: itens.length ? null : "sem-itens-no-json",
  };
}

/**
 * Diz de qual anuncio uma PAGINA fala, so pela URL — sem depender de ter
 * interceptado rede antes. E o que o HUD usa para saber o que perguntar
 * assim que o corretor abre o anuncio.
 *
 * @returns {{ source: string, externalId: string }|null}
 */
export function identificarAnuncio(hostname, url, { permitirGenerico = false } = {}) {
  const d = acharDescriptor(hostname, { permitirGenerico });
  if (!d?.idDaPagina) return null;

  const externalId = d.idDaPagina(url);
  if (!externalId) return null;

  return {
    source: d.generico ? slugDoHost(hostname) : d.slug,
    externalId: String(externalId),
  };
}

export { acharDescriptor, GENERICO, DESCRIPTORS, slugDoHost };
