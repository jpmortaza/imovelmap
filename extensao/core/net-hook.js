// ImovelMap Radar — interceptador de rede (roda no MAIN world)
//
// ZAP, VivaReal e ImovelWeb sao SPAs: o proprio site chama a glue-api e
// recebe o JSON completo e estruturado. Aqui so escutamos essa resposta.
// O portal faz o scraping pra gente — zero parsing de HTML, zero quebra
// quando eles mexem no layout, e dado mais rico do que o scraper antigo
// conseguia de fora (que hoje toma 403).
//
// Regra de ouro: NUNCA alterar o que a pagina recebe. Lemos um clone da
// resposta. Se qualquer coisa aqui falhar, a navegacao do corretor segue
// intacta — todo o corpo esta em try/catch por isso.

(() => {
  if (window.__imovelmapHook) return;
  window.__imovelmapHook = true;

  const MARCA = "imovelmap:rede";
  const MAX_BYTES = 4 * 1024 * 1024; // ignora resposta gigante

  function interessa(url) {
    if (typeof url !== "string") return false;
    return (
      url.includes("glue-api") ||
      url.includes("/v2/listings") ||
      url.includes("/v3/listings") ||
      url.includes("/api/search") ||
      url.includes("listing") ||
      url.includes("/api/v1/anuncios")
    );
  }

  function publicar(url, texto) {
    try {
      if (!texto || texto.length > MAX_BYTES) return;
      window.postMessage({ marca: MARCA, url, corpo: texto }, window.location.origin);
    } catch {
      /* silencio: nao e problema do usuario */
    }
  }

  // ---------------------------------------------------------------- fetch
  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const resposta = await fetchOriginal.apply(this, args);
    try {
      const url =
        typeof args[0] === "string" ? args[0] : args[0]?.url ?? String(args[0] ?? "");
      if (interessa(url) && resposta.ok) {
        const tipo = resposta.headers.get("content-type") ?? "";
        if (tipo.includes("json")) {
          // clone: a pagina continua consumindo o corpo original
          resposta
            .clone()
            .text()
            .then((t) => publicar(url, t))
            .catch(() => {});
        }
      }
    } catch {
      /* nunca deixar o hook quebrar o fetch da pagina */
    }
    return resposta;
  };

  // ------------------------------------------------------------------ XHR
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    try {
      this.__imovelmapUrl = url;
    } catch {
      /* ignore */
    }
    return abrirOriginal.call(this, metodo, url, ...resto);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      const url = this.__imovelmapUrl;
      if (interessa(url)) {
        this.addEventListener("load", () => {
          try {
            if (this.status >= 200 && this.status < 300) {
              const t =
                this.responseType === "" || this.responseType === "text"
                  ? this.responseText
                  : this.responseType === "json"
                  ? JSON.stringify(this.response)
                  : null;
              if (t) publicar(url, t);
            }
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      /* ignore */
    }
    return enviarOriginal.apply(this, args);
  };

  // ------------------------------------------------- estado inicial da SPA
  // A primeira pagina costuma vir renderizada no servidor, com os dados em
  // __NEXT_DATA__ ou num JSON-LD. Sem isto, o primeiro resultado da busca
  // (o que o corretor ve antes de rolar) escaparia.
  function estadoInicial() {
    try {
      const next = document.getElementById("__NEXT_DATA__");
      if (next?.textContent) publicar(location.href + "#__NEXT_DATA__", next.textContent);

      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        if (el.textContent) publicar(location.href + "#ld+json", el.textContent);
      }
    } catch {
      /* ignore */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", estadoInicial, { once: true });
  } else {
    estadoInicial();
  }
})();
