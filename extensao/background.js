// ImovelMap Radar — service worker
//
// Roteador de mensagens, parsing e fila. O corretor navega; isto acompanha.
//
// Privacidade (PROJETO.md §3.4): nenhum content script de captura esta
// declarado no manifest. Cada portal — e cada site generico — so passa a
// ser observado depois que o corretor autoriza aquele dominio. Sem
// autorizacao, a extensao nao ve nada. Nada de navegacao pessoal.

import { LIMITES, CHAVES, PAGINA_CONECTAR, VARREDURA } from "./core/config.js";
import { guardarSessao, desconectar, estaConectado, corretorAtual } from "./core/auth.js";
import { processar, identificarAnuncio, DESCRIPTORS, slugDoHost } from "./core/engine.js";
import * as fila from "./core/queue.js";
import { enviarLote, pedirDossie } from "./core/api.js";
import * as agente from "./core/agente.js";

const ALARME_SYNC = "imovelmap-sync";
const ALARME_PODA = "imovelmap-poda";
const ALARME_AGENTE = "imovelmap-agente";
const MAX_SESSAO = 200; // itens guardados para o sidepanel

let sincronizando = false;
let backoffMs = 0;
let proximaTentativa = 0;
const varreduraPorAba = new Map(); // tabId -> { rolagens, capturados }

// ------------------------------------------------------------------ ciclo
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(ALARME_SYNC, { periodInMinutes: 1 });
  chrome.alarms.create(ALARME_PODA, { periodInMinutes: 60 });
  await registrarCaptura();
  await atualizarBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await registrarCaptura();
  await atualizarBadge();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARME_SYNC) sincronizar();
  if (a.name === ALARME_PODA) fila.podar().catch(() => {});
  if (a.name === ALARME_AGENTE) cicloAgendado();
});

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => {});

// ------------------------------------------------------- registro dinamico
async function origensAutorizadas() {
  const s = await chrome.storage.local.get([CHAVES.portaisAtivos, CHAVES.sitesGenericos]);
  const slugs = s[CHAVES.portaisAtivos] ?? [];
  const genericos = s[CHAVES.sitesGenericos] ?? [];

  const origens = [];
  for (const slug of slugs) {
    const d = DESCRIPTORS.find((x) => x.slug === slug);
    if (d) origens.push(d.origem);
  }
  return { origens, genericos };
}

/** Registra o content script so onde ha permissao de host concedida. */
async function registrarCaptura() {
  const existentes = await chrome.scripting.getRegisteredContentScripts().catch(() => []);
  const antigos = existentes.filter((c) => c.id.startsWith("imovelmap-")).map((c) => c.id);
  if (antigos.length) {
    await chrome.scripting.unregisterContentScripts({ ids: antigos }).catch(() => {});
  }

  const { origens, genericos } = await origensAutorizadas();
  const alvos = [...origens, ...genericos];

  const matches = [];
  for (const padrao of alvos) {
    const tem = await chrome.permissions.contains({ origins: [padrao] }).catch(() => false);
    if (tem) matches.push(padrao);
  }
  if (!matches.length) return;

  await chrome.scripting
    .registerContentScripts([
      {
        id: "imovelmap-captura",
        matches,
        // content.js captura; hud.js desenha o overlay sobre o anuncio
        js: ["core/content.js", "core/hud.js"],
        runAt: "document_start",
        world: "ISOLATED",
      },
    ])
    .catch((e) => console.warn("[ImovelMap] registro falhou:", e));
}

// ------------------------------------------------------------- mensageria
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  (async () => {
    try {
      switch (msg?.tipo) {
        case "rede-capturada":
          responder(await aoCapturar(msg, sender));
          break;
        case "conectar":
          await guardarSessao(msg.sessao);
          await atualizarBadge();
          responder({ ok: true });
          break;
        case "desconectar":
          await desconectar();
          await atualizarBadge();
          responder({ ok: true });
          break;
        case "status":
          responder(await status());
          break;
        case "portais":
          responder(await definirPortais(msg.ativos ?? []));
          break;
        case "site-generico":
          responder(await alternarGenerico(msg.origem, msg.ligar));
          break;
        case "sincronizar-agora":
          backoffMs = 0;
          proximaTentativa = 0;
          responder(await sincronizar());
          break;
        case "sessao":
          responder({ ok: true, itens: await lerSessao() });
          break;
        case "limpar-sessao":
          await chrome.storage.local.set({ [CHAVES.sessao]: [] });
          responder({ ok: true });
          break;
        case "agente-status":
          responder({
            ok: true,
            rodando: agente.estaRodando(),
            buscas: await agente.lerBuscas(),
            estado: await agente.lerEstado(),
            limites: agente.LIMITES_AGENTE,
          });
          break;
        case "agente-buscas":
          responder({ ok: true, buscas: await agente.salvarBuscas(msg.buscas ?? []) });
          break;
        case "agente-rodar":
          // nao damos await: o ciclo dura minutos e o popup fecha antes
          agente.rodarCiclo().then((r) => console.log("[agente] ciclo:", r));
          responder({ ok: true, iniciado: true });
          break;
        case "agente-parar":
          agente.pedirParada();
          responder({ ok: true });
          break;
        case "agente-auto":
          responder(await ligarAutomatico(Boolean(msg.ligado)));
          break;
        case "identificar-anuncio":
          responder(await identificarPagina(msg));
          break;
        case "dossie":
          responder(await buscarDossie(msg));
          break;
        case "varredura":
          responder(await varrer(msg.tabId, msg.ligar));
          break;
        case "varredura-progresso":
          responder(await aoProgressoVarredura(msg, sender));
          break;
        case "debug":
          await chrome.storage.local.set({ [CHAVES.debug]: Boolean(msg.ligado) });
          responder({ ok: true });
          break;
        case "abrir-conectar":
          await chrome.tabs.create({ url: PAGINA_CONECTAR });
          responder({ ok: true });
          break;
        case "limpar-fila":
          await fila.limpar();
          await atualizarBadge();
          responder({ ok: true });
          break;
        default:
          responder({ ok: false, erro: "mensagem desconhecida" });
      }
    } catch (e) {
      responder({ ok: false, erro: String(e?.message ?? e) });
    }
  })();
  return true; // resposta assincrona
});

// --------------------------------------------------------------- captura
async function aoCapturar(msg, sender) {
  const hostname = msg.hostname ?? (sender.url ? new URL(sender.url).hostname : "");

  // generico so vale onde o corretor autorizou explicitamente
  const s = await chrome.storage.local.get([CHAVES.sitesGenericos, CHAVES.debug]);
  const genericos = s[CHAVES.sitesGenericos] ?? [];
  const permitirGenerico = genericos.some((o) => casaOrigem(o, hostname));

  const { portal, itens, motivo } = processar(hostname, msg.url ?? "", msg.corpo ?? "", {
    pagina: msg.pagina ?? "",
    permitirGenerico,
  });

  if (s[CHAVES.debug] && portal) await guardarDebug(portal, msg, itens, motivo);

  if (!itens.length) return { ok: true, novos: 0, motivo };

  const modo = varreduraPorAba.has(sender.tab?.id) ? "varredura" : "passivo";
  const novos = await fila.enfileirar(itens, { portal, pagina: msg.pagina, modo });

  await contabilizar(portal, novos);
  await registrarNaSessao(itens, portal);
  if (sender.tab?.id && varreduraPorAba.has(sender.tab.id)) {
    const v = varreduraPorAba.get(sender.tab.id);
    v.capturados += novos;
  }
  await atualizarBadge();

  sincronizar(); // nao espera a rede: a aba do corretor segue solta
  return { ok: true, novos, portal };
}

function casaOrigem(padrao, hostname) {
  // "https://*.exemplo.com.br/*" -> testa o host
  const m = padrao.match(/^https:\/\/(\*\.)?([^/]+)\//);
  if (!m) return false;
  const base = m[2];
  return hostname === base || hostname.endsWith("." + base);
}

async function guardarDebug(portal, msg, itens, motivo) {
  const chave = `imovelmap.debug.${portal}`;
  const ja = await chrome.storage.local.get(chave);
  if (ja[chave]) return;
  await chrome.storage.local.set({
    [chave]: {
      url: msg.url,
      pagina: msg.pagina,
      quando: new Date().toISOString(),
      itensExtraidos: itens.length,
      motivo,
      corpo: String(msg.corpo).slice(0, 200_000),
    },
  });
}

// ------------------------------------------------------------------ sync
async function sincronizar() {
  if (sincronizando) return { ok: true, pulado: "ja-rodando" };
  if (Date.now() < proximaTentativa) return { ok: true, pulado: "backoff" };
  if (!(await estaConectado())) return { ok: false, erro: "SEM_SESSAO" };

  sincronizando = true;
  try {
    let enviados = 0;
    for (;;) {
      const lote = await fila.proximoLote(LIMITES.itensPorLote);
      if (!lote.length) break;

      const portal = lote[0]?.contexto?.portal ?? null;
      const modo = lote[0]?.contexto?.modo ?? "passivo";

      try {
        const r = await enviarLote(
          lote.map((x) => x.item),
          { portal, modo }
        );
        await fila.marcarEnviados(lote);
        enviados += r?.novos ?? 0;
        backoffMs = 0;
        proximaTentativa = 0;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (msg.includes("SEM_SESSAO") || msg.includes("SESSAO_EXPIRADA")) {
          await atualizarBadge();
          return { ok: false, erro: "SESSAO_EXPIRADA" };
        }
        await fila.marcarFalha(lote, msg);
        backoffMs = Math.min(
          backoffMs ? backoffMs * 2 : LIMITES.backoffInicialMs,
          LIMITES.backoffMaxMs
        );
        proximaTentativa = Date.now() + backoffMs;
        return { ok: false, erro: msg, backoffMs };
      }
    }
    await atualizarBadge();
    return { ok: true, enviados };
  } finally {
    sincronizando = false;
  }
}

// ------------------------------------------------------------------ agente
async function ligarAutomatico(ligado) {
  if (ligado) {
    chrome.alarms.create(ALARME_AGENTE, {
      periodInMinutes: agente.LIMITES_AGENTE.intervaloCicloMin,
      delayInMinutes: 1,
    });
  } else {
    await chrome.alarms.clear(ALARME_AGENTE);
  }
  const e = await chrome.storage.local.get(CHAVES.agente);
  await chrome.storage.local.set({
    [CHAVES.agente]: { ...(e[CHAVES.agente] ?? {}), ligado },
  });
  return { ok: true, ligado };
}

async function cicloAgendado() {
  if (!(await estaConectado())) return;   // sem sessao nao adianta capturar
  if (agente.estaRodando()) return;
  const r = await agente.rodarCiclo();
  console.log("[agente] ciclo agendado:", r);
  await sincronizar();
}

// -------------------------------------------------------------------- HUD
async function identificarPagina({ hostname, url }) {
  const s = await chrome.storage.local.get(CHAVES.sitesGenericos);
  const genericos = s[CHAVES.sitesGenericos] ?? [];
  const permitirGenerico = genericos.some((o) => casaOrigem(o, hostname));

  const r = identificarAnuncio(hostname ?? "", url ?? "", { permitirGenerico });
  return r ? { ok: true, ...r } : { ok: true, externalId: null };
}

/** Cache curto: o HUD reavalia a cada 1,2 s e a SPA troca de URL o tempo todo. */
const cacheDossie = new Map(); // chave -> { quando, dado }
const TTL_DOSSIE = 60_000;

async function buscarDossie({ source, externalId, imovelId, cnpj }) {
  if (!(await estaConectado())) return { ok: false, erro: "não conectado" };

  const chave = imovelId ?? `${source}::${externalId}`;
  const em = cacheDossie.get(chave);
  if (em && Date.now() - em.quando < TTL_DOSSIE) return em.dado;

  try {
    const dado = await pedirDossie({ source, externalId, imovelId, cnpj });
    cacheDossie.set(chave, { quando: Date.now(), dado });
    if (cacheDossie.size > 200) {
      cacheDossie.delete(cacheDossie.keys().next().value);
    }
    return dado;
  } catch (e) {
    const m = String(e?.message ?? e);
    return {
      ok: false,
      erro: m.includes("SESSAO_EXPIRADA") ? "sessão expirada — reconecte" : m,
    };
  }
}

// -------------------------------------------------------------- varredura
// Nao dispara requisicao nossa: injeta um rolador que desce a pagina no
// ritmo de gente e deixa a propria SPA pedir a proxima leva. O net-hook
// colhe. Zero trafego sintetico.
async function varrer(tabId, ligar) {
  if (!tabId) return { ok: false, erro: "sem aba" };

  if (!ligar) {
    varreduraPorAba.delete(tabId);
    await chrome.scripting
      .executeScript({ target: { tabId }, func: () => (window.__imovelmapVarrer = false) })
      .catch(() => {});
    return { ok: true, ligado: false };
  }

  varreduraPorAba.set(tabId, { rolagens: 0, capturados: 0 });

  await chrome.scripting.executeScript({
    target: { tabId },
    args: [VARREDURA],
    func: async (cfg) => {
      if (window.__imovelmapVarrer) return;
      window.__imovelmapVarrer = true;

      const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
      let semNovidade = 0;
      let alturaAnterior = document.body.scrollHeight;

      for (let i = 0; i < cfg.maxRolagens; i++) {
        if (!window.__imovelmapVarrer) break;

        window.scrollBy(0, cfg.passoPx);
        // pausa com jitter: ritmo de leitura, nao de robo
        await dormir(
          cfg.pausaMinMs + Math.random() * (cfg.pausaMaxMs - cfg.pausaMinMs)
        );

        const altura = document.body.scrollHeight;
        if (altura <= alturaAnterior) {
          semNovidade++;
          if (semNovidade >= cfg.semNovidadeParaParar) break;
        } else {
          semNovidade = 0;
          alturaAnterior = altura;
        }

        try {
          chrome.runtime.sendMessage(
            { tipo: "varredura-progresso", rolagens: i + 1 },
            () => void chrome.runtime.lastError
          );
        } catch {
          break; // extensao recarregada
        }
      }
      window.__imovelmapVarrer = false;
      try {
        chrome.runtime.sendMessage({ tipo: "varredura-progresso", fim: true }, () =>
          void chrome.runtime.lastError
        );
      } catch {
        /* ignore */
      }
    },
  });

  return { ok: true, ligado: true };
}

async function aoProgressoVarredura(msg, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { ok: true };
  const v = varreduraPorAba.get(tabId);
  if (!v) return { ok: true };
  if (msg.fim) varreduraPorAba.delete(tabId);
  else v.rolagens = msg.rolagens ?? v.rolagens;
  return { ok: true };
}

chrome.tabs.onRemoved.addListener((tabId) => varreduraPorAba.delete(tabId));

// ------------------------------------------------------------------ apoio
async function registrarNaSessao(itens, portal) {
  const s = await chrome.storage.local.get(CHAVES.sessao);
  const lista = s[CHAVES.sessao] ?? [];
  const vistos = new Set(lista.map((x) => `${x.source}::${x.id}`));

  for (const i of itens) {
    const k = `${i.source}::${i.id}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    lista.unshift({
      id: i.id,
      source: i.source,
      portal,
      title: i.title,
      price: i.price,
      area: i.area,
      bedrooms: i.bedrooms,
      neighborhood: i.neighborhood,
      city: i.city,
      endereco: i.endereco,
      enderecoNumero: i.enderecoNumero,
      url: i.url,
      imagem: i.images?.[0] ?? null,
      quando: Date.now(),
    });
  }
  await chrome.storage.local.set({ [CHAVES.sessao]: lista.slice(0, MAX_SESSAO) });
}

async function lerSessao() {
  const s = await chrome.storage.local.get(CHAVES.sessao);
  return s[CHAVES.sessao] ?? [];
}

async function contabilizar(portal, quantos) {
  if (!portal || !quantos) return;
  const s = await chrome.storage.local.get(CHAVES.contadores);
  const c = s[CHAVES.contadores] ?? {};
  const hoje = new Date().toISOString().slice(0, 10);
  c[hoje] = c[hoje] ?? {};
  c[hoje][portal] = (c[hoje][portal] ?? 0) + quantos;
  for (const dia of Object.keys(c)) {
    if (dia < hoje && Object.keys(c).length > 14) delete c[dia];
  }
  await chrome.storage.local.set({ [CHAVES.contadores]: c });
}

async function definirPortais(ativos) {
  await chrome.storage.local.set({ [CHAVES.portaisAtivos]: ativos });
  await registrarCaptura();
  return { ok: true, ativos };
}

async function alternarGenerico(origem, ligar) {
  if (!origem) return { ok: false, erro: "sem origem" };
  const s = await chrome.storage.local.get(CHAVES.sitesGenericos);
  const lista = new Set(s[CHAVES.sitesGenericos] ?? []);
  if (ligar) lista.add(origem);
  else lista.delete(origem);
  await chrome.storage.local.set({ [CHAVES.sitesGenericos]: [...lista] });
  await registrarCaptura();
  return { ok: true, sitesGenericos: [...lista] };
}

async function status() {
  const [conectado, corretor, contagens, s] = await Promise.all([
    estaConectado(),
    corretorAtual(),
    fila.contagens(),
    chrome.storage.local.get([
      CHAVES.portaisAtivos,
      CHAVES.sitesGenericos,
      CHAVES.contadores,
      CHAVES.debug,
    ]),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    conectado,
    corretor,
    fila: contagens,
    portaisAtivos: s[CHAVES.portaisAtivos] ?? [],
    sitesGenericos: s[CHAVES.sitesGenericos] ?? [],
    hoje: s[CHAVES.contadores]?.[hoje] ?? {},
    debug: Boolean(s[CHAVES.debug]),
    portaisDisponiveis: DESCRIPTORS.map((d) => ({
      slug: d.slug,
      nome: d.nome,
      origem: d.origem,
    })),
    varrendo: [...varreduraPorAba.keys()],
    backoffMs,
  };
}

async function atualizarBadge() {
  try {
    const c = await fila.contagens();
    const conectado = await estaConectado();
    const texto = !conectado ? "!" : c.pendente ? String(c.pendente) : "";
    await chrome.action.setBadgeText({ text: texto });
    await chrome.action.setBadgeBackgroundColor({
      color: !conectado ? "#e53e3e" : "#2b6cb0",
    });
  } catch {
    /* ignore */
  }
}

chrome.permissions.onAdded.addListener(registrarCaptura);
chrome.permissions.onRemoved.addListener(registrarCaptura);

export { slugDoHost };
