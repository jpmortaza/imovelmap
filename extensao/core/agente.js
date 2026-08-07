// ImovelMap Radar — agente autônomo
//
// Modo "máquina dedicada": o operador cadastra buscas, aperta **Buscar
// imóveis** e a extensão percorre tudo sozinha, em ciclos, sem ninguém na
// frente do computador.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUE OS FREIOS EXISTEM
//
// Isto abre páginas por conta própria — é um crawler. O que mantém ele vivo
// não é velocidade, é não parecer um script:
//
//   · pausa aleatória entre páginas (nunca o mesmo intervalo)
//   · rolagem no ritmo de leitura, deixando a própria SPA pedir os dados
//   · teto de páginas por busca e por ciclo
//   · UMA aba por vez — nada de paralelismo, que é assinatura de robô
//   · detecção de bloqueio: ao ver 403/captcha, PARA e espera horas
//
// Um robô rápido coleta muito por três dias e nada depois. Um robô paciente
// coleta para sempre. Os números abaixo são conservadores de propósito;
// dá para afrouxar em `LIMITES`, sabendo o que se troca.
// ─────────────────────────────────────────────────────────────────────────

import { CHAVES, VARREDURA } from "./config.js";
import { acharDescriptor, slugDoHost } from "./engine.js";

export const LIMITES_AGENTE = {
  paginasPorBusca: 5,          // páginas de resultado por busca, por ciclo
  paginasPorCiclo: 40,         // teto global de um ciclo
  esperaEntrePaginasMs: [8_000, 22_000],
  esperaEntreBuscasMs: [45_000, 120_000],
  timeoutCarregarMs: 45_000,
  // ao detectar bloqueio, o portal fica de castigo por este tempo
  castigoAposBloqueioMs: 4 * 60 * 60_000,
  intervaloCicloMin: 180,      // ciclo automático a cada 3h
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = ([a, b]) => a + Math.random() * (b - a);

let rodando = false;
let cancelar = false;

// ------------------------------------------------------------ persistência
export async function lerBuscas() {
  const s = await chrome.storage.local.get(CHAVES.buscas);
  return s[CHAVES.buscas] ?? [];
}

export async function salvarBuscas(buscas) {
  await chrome.storage.local.set({ [CHAVES.buscas]: buscas });
  return buscas;
}

export async function lerEstado() {
  const s = await chrome.storage.local.get(CHAVES.agente);
  return s[CHAVES.agente] ?? { ligado: false, historico: [] };
}

async function gravarEstado(patch) {
  const atual = await lerEstado();
  const novo = { ...atual, ...patch };
  await chrome.storage.local.set({ [CHAVES.agente]: novo });
  return novo;
}

async function registrar(evento) {
  const e = await lerEstado();
  const historico = [{ quando: Date.now(), ...evento }, ...(e.historico ?? [])].slice(0, 60);
  await gravarEstado({ historico });
}

// ------------------------------------------------------------- castigo
async function emCastigo(portal) {
  const e = await lerEstado();
  const ate = e.castigo?.[portal] ?? 0;
  return Date.now() < ate;
}

async function porDeCastigo(portal) {
  const e = await lerEstado();
  const castigo = { ...(e.castigo ?? {}) };
  castigo[portal] = Date.now() + LIMITES_AGENTE.castigoAposBloqueioMs;
  await gravarEstado({ castigo });
  await registrar({ tipo: "bloqueio", portal, msg: "portal bloqueou — pausando 4h" });
}

// ------------------------------------------------------------- navegação
/** abre a URL numa aba de fundo e espera terminar de carregar */
function abrirEAguardar(url) {
  return new Promise((resolve, reject) => {
    let tabId = null;
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(ouvinte);
      resolve({ tabId, timeout: true });
    }, LIMITES_AGENTE.timeoutCarregarMs);

    function ouvinte(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(ouvinte);
        clearTimeout(timer);
        resolve({ tabId, timeout: false });
      }
    }

    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        clearTimeout(timer);
        return reject(new Error(chrome.runtime.lastError?.message ?? "sem aba"));
      }
      tabId = tab.id;
      chrome.tabs.onUpdated.addListener(ouvinte);
    });
  });
}

const fechar = (tabId) =>
  new Promise((r) => chrome.tabs.remove(tabId, () => (void chrome.runtime.lastError, r())));

/**
 * O portal devolveu bloqueio? Não temos o status HTTP de uma navegação de
 * aba, então lemos os sinais na página: título e texto característicos.
 */
async function pareceBloqueio(tabId) {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const t = (document.title || "").toLowerCase();
        const c = (document.body?.innerText || "").slice(0, 3000).toLowerCase();
        const sinais = [
          "access denied", "acesso negado", "forbidden", "403",
          "captcha", "are you a robot", "verifique que voce", "unusual traffic",
          "attention required", "cloudflare", "bloqueado",
        ];
        const achou = sinais.some((s) => t.includes(s) || c.includes(s));
        // página de resultado legítima tem muito conteúdo; bloqueio é curto
        return { achou, tamanho: c.length };
      },
    });
    const d = r?.result;
    if (!d) return false;
    return d.achou || d.tamanho < 200;
  } catch {
    return false;
  }
}

/** rola no ritmo de leitura para a SPA pedir a próxima leva sozinha */
async function rolarPagina(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [VARREDURA],
      func: async (cfg) => {
        const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
        let semNovidade = 0;
        let altura = document.body.scrollHeight;
        for (let i = 0; i < cfg.maxRolagens; i++) {
          window.scrollBy(0, cfg.passoPx);
          await dormir(cfg.pausaMinMs + Math.random() * (cfg.pausaMaxMs - cfg.pausaMinMs));
          const nova = document.body.scrollHeight;
          if (nova <= altura) {
            if (++semNovidade >= cfg.semNovidadeParaParar) break;
          } else {
            semNovidade = 0;
            altura = nova;
          }
        }
      },
    });
  } catch {
    /* aba fechada no meio: segue o baile */
  }
}

// ------------------------------------------------------------------ ciclo
export function estaRodando() {
  return rodando;
}

export function pedirParada() {
  cancelar = true;
}

/**
 * Um ciclo completo: percorre todas as buscas ativas, página a página.
 * Devolve o resumo. Só roda um ciclo por vez.
 */
export async function rodarCiclo({ aoProgresso } = {}) {
  if (rodando) return { ok: false, erro: "ciclo ja em andamento" };

  rodando = true;
  cancelar = false;
  const inicio = Date.now();
  let paginas = 0;
  let bloqueios = 0;

  await gravarEstado({ cicloEm: inicio, progresso: null });
  await registrar({ tipo: "inicio", msg: "ciclo iniciado" });

  try {
    const buscas = (await lerBuscas()).filter((b) => b.ativo !== false);
    if (!buscas.length) {
      await registrar({ tipo: "aviso", msg: "nenhuma busca cadastrada" });
      return { ok: true, paginas: 0, aviso: "cadastre ao menos uma busca" };
    }

    for (const busca of buscas) {
      if (cancelar || paginas >= LIMITES_AGENTE.paginasPorCiclo) break;

      const host = (() => {
        try {
          return new URL(busca.url).hostname;
        } catch {
          return "";
        }
      })();
      const d = acharDescriptor(host, { permitirGenerico: true });
      const portal = d?.generico ? slugDoHost(host) : d?.slug ?? slugDoHost(host);

      if (await emCastigo(portal)) {
        await registrar({ tipo: "pulado", portal, msg: "em castigo" });
        continue;
      }

      const maxPag = Math.min(
        busca.paginas ?? LIMITES_AGENTE.paginasPorBusca,
        LIMITES_AGENTE.paginasPorBusca
      );

      for (let n = 1; n <= maxPag; n++) {
        if (cancelar || paginas >= LIMITES_AGENTE.paginasPorCiclo) break;

        const url = d?.paginar ? d.paginar(busca.url, n) : busca.url;
        const prog = { busca: busca.nome ?? portal, pagina: n, de: maxPag, url };
        await gravarEstado({ progresso: prog });
        aoProgresso?.(prog);

        let tabId = null;
        try {
          const r = await abrirEAguardar(url);
          tabId = r.tabId;
          if (!tabId) throw new Error("aba nao abriu");

          if (await pareceBloqueio(tabId)) {
            bloqueios++;
            await porDeCastigo(portal);
            await fechar(tabId);
            break; // desiste desta busca agora
          }

          await rolarPagina(tabId);
          paginas++;
        } catch (e) {
          await registrar({ tipo: "erro", portal, msg: String(e?.message ?? e) });
        } finally {
          if (tabId) await fechar(tabId);
        }

        // a fila sobe sozinha (background sincroniza); só respiramos aqui
        await dormir(entre(LIMITES_AGENTE.esperaEntrePaginasMs));
      }

      // marca quando esta busca rodou
      const todas = await lerBuscas();
      const i = todas.findIndex((x) => x.url === busca.url);
      if (i >= 0) {
        todas[i] = { ...todas[i], ultimaExecucao: Date.now() };
        await salvarBuscas(todas);
      }

      if (!cancelar) await dormir(entre(LIMITES_AGENTE.esperaEntreBuscasMs));
    }

    const resumo = {
      ok: true,
      paginas,
      bloqueios,
      duracaoMs: Date.now() - inicio,
      cancelado: cancelar,
    };
    await registrar({
      tipo: "fim",
      msg: `${paginas} páginas${bloqueios ? `, ${bloqueios} bloqueio(s)` : ""}${
        cancelar ? " (interrompido)" : ""
      }`,
    });
    await gravarEstado({ progresso: null, ultimoCiclo: resumo });
    return resumo;
  } finally {
    rodando = false;
    cancelar = false;
  }
}
