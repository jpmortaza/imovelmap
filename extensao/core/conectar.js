// ImovelMap Radar — handoff de sessao (roda em imovelmap.com)
//
// A pagina /extensao/conectar ja tem a sessao Supabase do corretor logado.
// Ela dispara o CustomEvent `imovelmap:conectar` com a sessao; este script
// entrega ao service worker e responde `imovelmap:conectado`.
//
// Esse e o caminho que funciona em modo desenvolvedor. Com a extensao
// publicada na Web Store, a pagina tambem consegue falar direto por
// chrome.runtime.sendMessage(<id>, ...) via externally_connectable —
// os dois caminhos coexistem e o primeiro que responder vence.

(() => {
  // avisa a pagina que a extensao esta instalada (some o "instale a extensao")
  const anunciar = () => {
    try {
      window.dispatchEvent(
        new CustomEvent("imovelmap:extensao-presente", {
          detail: { versao: chrome.runtime.getManifest().version },
        })
      );
    } catch {
      /* ignore */
    }
  };

  anunciar();
  window.addEventListener("imovelmap:ola", anunciar);

  window.addEventListener("imovelmap:conectar", (ev) => {
    const sessao = ev.detail;
    if (!sessao?.refresh_token) {
      window.dispatchEvent(
        new CustomEvent("imovelmap:conectado", {
          detail: { ok: false, erro: "sessao sem refresh_token" },
        })
      );
      return;
    }

    chrome.runtime.sendMessage({ tipo: "conectar", sessao }, (resp) => {
      const erro = chrome.runtime.lastError?.message;
      window.dispatchEvent(
        new CustomEvent("imovelmap:conectado", {
          detail: erro ? { ok: false, erro } : resp ?? { ok: true },
        })
      );
    });
  });

  window.addEventListener("imovelmap:desconectar", () => {
    chrome.runtime.sendMessage({ tipo: "desconectar" }, () => {
      void chrome.runtime.lastError;
      window.dispatchEvent(new CustomEvent("imovelmap:desconectado", { detail: { ok: true } }));
    });
  });
})();
