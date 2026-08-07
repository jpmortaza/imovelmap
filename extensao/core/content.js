// ImovelMap Radar — content script dos portais (world ISOLATED)
//
// Faz duas coisas e mais nada:
//   1. injeta o net-hook no MAIN world (so la da pra enxergar o fetch da SPA);
//   2. repassa o corpo cru para o service worker.
//
// O parsing acontece no background de proposito: nada de gastar CPU da aba
// que o corretor esta usando. Aqui nao ha `import` porque content script
// declarado no manifest nao aceita ES module.

(() => {
  const MARCA = "imovelmap:rede";

  // 1. injeta o hook
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("core/net-hook.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.remove(); // ja executou; nao precisa sujar o DOM
  } catch (e) {
    console.debug("[ImovelMap] nao consegui injetar o hook:", e);
  }

  // 2. repassa
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.marca !== MARCA || typeof d.corpo !== "string") return;

    try {
      chrome.runtime.sendMessage(
        {
          tipo: "rede-capturada",
          hostname: location.hostname,
          pagina: location.href,
          url: d.url,
          corpo: d.corpo,
        },
        () => void chrome.runtime.lastError // service worker dormindo: ok
      );
    } catch {
      // contexto invalidado (extensao recarregada) — nada a fazer
    }
  });
})();
