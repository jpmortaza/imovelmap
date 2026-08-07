// ImovelMap Radar — popup

const $ = (id) => document.getElementById(id);

const msg = (bg) =>
  new Promise((ok) =>
    chrome.runtime.sendMessage(bg, (r) => {
      void chrome.runtime.lastError;
      ok(r ?? {});
    })
  );

let estadoAtual = null;
let abaAtual = null;

async function pegarAba() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  return aba ?? null;
}

/** "https://*.exemplo.com.br/*" a partir de uma URL de aba */
function origemDe(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const partes = u.hostname.replace(/^www\./, "").split(".");
    const base = partes.length > 2 ? partes.slice(-3).join(".") : partes.join(".");
    return { padrao: `https://*.${base}/*`, base };
  } catch {
    return null;
  }
}

function conhecido(hostname, portais) {
  return portais.some((p) => {
    const m = p.origem.match(/^https:\/\/(\*\.)?([^/]+)\//);
    return m && (hostname === m[2] || hostname.endsWith("." + m[2]));
  });
}

async function pintar() {
  const s = await msg({ tipo: "status" });
  estadoAtual = s;
  abaAtual = await pegarAba();

  $("quem").textContent = s.conectado
    ? s.corretor?.email ?? "corretor conectado"
    : "não conectado";

  const pill = $("estado");
  pill.textContent = s.conectado ? "capturando" : "desligado";
  pill.className = `pilula ${s.conectado ? "ok" : "off"}`;
  $("avisoSessao").hidden = Boolean(s.conectado);

  const hoje = Object.values(s.hoje ?? {}).reduce((a, b) => a + b, 0);
  $("hoje").textContent = hoje;
  $("pendentes").textContent = s.fila?.pendente ?? 0;
  $("travados").textContent = s.fila?.travado ?? 0;
  $("linhaTravados").hidden = !(s.fila?.travado > 0);

  $("btnConectar").textContent = s.conectado
    ? "Reconectar / trocar conta"
    : "Conectar ao ImovelMap";
  $("btnDebug").textContent = `Debug: ${s.debug ? "on" : "off"}`;

  // portais conhecidos
  const div = $("portais");
  div.innerHTML = "";
  for (const p of s.portaisDisponiveis ?? []) {
    const lab = document.createElement("label");
    lab.className = "portal";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = (s.portaisAtivos ?? []).includes(p.slug);
    cb.addEventListener("change", () => alternarPortal(p, cb));
    lab.append(cb, document.createTextNode(p.nome));
    div.appendChild(lab);
  }

  // site atual, quando nao for um dos conhecidos
  const org = abaAtual?.url ? origemDe(abaAtual.url) : null;
  const host = abaAtual?.url ? new URL(abaAtual.url).hostname : "";
  const mostrar = Boolean(org) && !conhecido(host, s.portaisDisponiveis ?? []);
  $("cartaoSite").hidden = !mostrar;
  if (mostrar) {
    $("siteAtual").textContent = org.base;
    $("chkSite").checked = (s.sitesGenericos ?? []).includes(org.padrao);
  }

  $("btnVarrer").textContent = (s.varrendo ?? []).includes(abaAtual?.id)
    ? "Parar varredura"
    : "Varrer esta busca";
}

async function alternarPortal(portal, checkbox) {
  const ativos = new Set(estadoAtual?.portaisAtivos ?? []);

  if (checkbox.checked) {
    // permissao tem que ser pedida no gesto do usuario (exigencia do Chrome)
    const ok = await chrome.permissions.request({ origins: [portal.origem] });
    if (!ok) {
      checkbox.checked = false;
      $("msg").textContent = "Permissão negada para " + portal.nome;
      return;
    }
    ativos.add(portal.slug);
  } else {
    ativos.delete(portal.slug);
    await chrome.permissions.remove({ origins: [portal.origem] }).catch(() => {});
  }

  await msg({ tipo: "portais", ativos: [...ativos] });
  $("msg").textContent = "";
  await pintar();
}

$("chkSite").addEventListener("change", async (ev) => {
  const org = origemDe(abaAtual?.url ?? "");
  if (!org) return;

  if (ev.target.checked) {
    const ok = await chrome.permissions.request({ origins: [org.padrao] });
    if (!ok) {
      ev.target.checked = false;
      $("msg").textContent = "Permissão negada para " + org.base;
      return;
    }
    await msg({ tipo: "site-generico", origem: org.padrao, ligar: true });
    $("msg").textContent = "Recarregue a página para começar a capturar.";
  } else {
    await msg({ tipo: "site-generico", origem: org.padrao, ligar: false });
    await chrome.permissions.remove({ origins: [org.padrao] }).catch(() => {});
  }
  await pintar();
});

$("btnVarrer").addEventListener("click", async () => {
  if (!abaAtual?.id) return;
  const ligado = (estadoAtual?.varrendo ?? []).includes(abaAtual.id);
  const r = await msg({ tipo: "varredura", tabId: abaAtual.id, ligar: !ligado });
  $("msg").textContent = r.ok
    ? r.ligado
      ? "varrendo… pode fechar este popup"
      : "varredura parada"
    : `erro: ${r.erro}`;
  await pintar();
});

$("btnAgente").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

$("btnPainel").addEventListener("click", async () => {
  if (!abaAtual?.id) return;
  await chrome.sidePanel.open({ tabId: abaAtual.id }).catch(() => {});
  window.close();
});

$("btnConectar").addEventListener("click", async () => {
  await msg({ tipo: "abrir-conectar" });
  window.close();
});

$("btnSync").addEventListener("click", async () => {
  $("btnSync").disabled = true;
  $("msg").textContent = "sincronizando…";
  const r = await msg({ tipo: "sincronizar-agora" });
  $("msg").textContent = r.ok
    ? r.enviados
      ? `${r.enviados} imóveis enviados`
      : "nada pendente"
    : `erro: ${r.erro}`;
  $("btnSync").disabled = false;
  await pintar();
});

$("btnDebug").addEventListener("click", async () => {
  await msg({ tipo: "debug", ligado: !estadoAtual?.debug });
  await pintar();
  $("msg").textContent = estadoAtual?.debug
    ? "grava o 1º JSON de cada portal em chrome.storage.local"
    : "";
});

pintar();
setInterval(pintar, 3000);
