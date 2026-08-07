// ImovelMap Radar — sessao
//
// A extensao nao tem tela de login. O corretor loga no site, e a pagina
// /extensao/conectar entrega a sessao. Guardamos SO o refresh_token: o
// access_token vive em memoria no service worker e e renovado sob demanda.
//
// Consequencia pratica: revogar o acesso da extensao = encerrar a sessao
// no site. Nenhuma senha passa por aqui em momento algum.

import { SUPABASE_PUBLISHABLE_KEY, AUTH_TOKEN_URL, CHAVES } from "./config.js";

let accessToken = null;
let expiraEm = 0; // epoch ms

const MARGEM_MS = 60_000; // renova 1 min antes de expirar

export async function guardarSessao({ refresh_token, access_token, expires_in, user }) {
  if (!refresh_token) throw new Error("sessao sem refresh_token");

  await chrome.storage.local.set({
    [CHAVES.refreshToken]: refresh_token,
    [CHAVES.corretor]: user
      ? { id: user.id, email: user.email, nome: user.user_metadata?.nome ?? null }
      : null,
  });

  if (access_token) {
    accessToken = access_token;
    expiraEm = Date.now() + (Number(expires_in) || 3600) * 1000;
  }
}

export async function estaConectado() {
  const s = await chrome.storage.local.get(CHAVES.refreshToken);
  return Boolean(s[CHAVES.refreshToken]);
}

export async function corretorAtual() {
  const s = await chrome.storage.local.get(CHAVES.corretor);
  return s[CHAVES.corretor] ?? null;
}

export async function desconectar() {
  accessToken = null;
  expiraEm = 0;
  await chrome.storage.local.remove([CHAVES.refreshToken, CHAVES.corretor]);
}

/**
 * Devolve um access_token valido, renovando se preciso.
 * Lanca se nao houver sessao — quem chama decide se para a fila ou avisa a UI.
 */
export async function pegarToken() {
  if (accessToken && Date.now() < expiraEm - MARGEM_MS) return accessToken;

  const s = await chrome.storage.local.get(CHAVES.refreshToken);
  const refresh = s[CHAVES.refreshToken];
  if (!refresh) throw new Error("SEM_SESSAO");

  const resp = await fetch(`${AUTH_TOKEN_URL}?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!resp.ok) {
    // refresh token queimado (logout no site, troca de senha, expirou)
    if (resp.status === 400 || resp.status === 401) {
      await desconectar();
      throw new Error("SESSAO_EXPIRADA");
    }
    throw new Error(`falha ao renovar sessao: HTTP ${resp.status}`);
  }

  const d = await resp.json();
  accessToken = d.access_token;
  expiraEm = Date.now() + (Number(d.expires_in) || 3600) * 1000;

  // o Supabase rotaciona o refresh_token a cada uso
  if (d.refresh_token) {
    await chrome.storage.local.set({ [CHAVES.refreshToken]: d.refresh_token });
  }
  return accessToken;
}
