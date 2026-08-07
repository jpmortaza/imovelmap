// ImovelMap Radar — HUD sobreposto (Fase 9)
//
// A feature que faz o corretor instalar e nunca desinstalar: enquanto ele
// olha um anuncio no portal, aparece por cima o que o portal esconde —
// endereco, em quantos outros portais o mesmo imovel esta anunciado, quanto
// o preco ja caiu, e qual cartorio guarda a matricula.
//
// Roda no world ISOLATED: o CSS e o JS do portal nao alcancam nada daqui, e
// o conteudo vive dentro de um shadow root fechado para nao vazar estilo
// nos dois sentidos.
//
// Nao ha `import` porque content script registrado nao aceita ES module —
// quem sabe falar com o banco e o service worker.

(() => {
  if (window.__imovelmapHud) return;
  window.__imovelmapHud = true;

  const ID = "imovelmap-hud";
  let ultimaUrl = "";
  let buscando = false;
  let recolhido = false;

  const brl = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1000) return "R$ " + Math.round(n / 1000) + "k";
    return "R$ " + n.toLocaleString("pt-BR");
  };

  const msg = (bg) =>
    new Promise((ok) => {
      try {
        chrome.runtime.sendMessage(bg, (r) => {
          void chrome.runtime.lastError;
          ok(r ?? {});
        });
      } catch {
        ok({});
      }
    });

  // ------------------------------------------------------------ montagem
  function raiz() {
    let host = document.getElementById(ID);
    if (host) return host.shadowRoot;

    host = document.createElement("div");
    host.id = ID;
    // z-index alto: portal costuma ter carrossel e modal em camadas altas
    host.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483647;" +
      "width:340px;max-width:calc(100vw - 32px);";
    document.documentElement.appendChild(host);

    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        :host { all: initial; }
        .cx {
          font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #11161d; color: #eef2f6;
          border-radius: 12px; overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,.4);
          border: 1px solid rgba(255,255,255,.08);
        }
        .top {
          display:flex; align-items:center; gap:8px;
          padding: 9px 12px; background: rgba(255,255,255,.04);
          cursor: pointer; user-select: none;
        }
        .marca { font-weight: 800; font-size: 12px; letter-spacing:-.2px; flex:1; }
        .x { opacity:.5; font-size:15px; padding:0 4px; cursor:pointer; }
        .x:hover { opacity:1; }
        .corpo { padding: 11px 12px 12px; display:flex; flex-direction:column; gap:9px; }
        .linha { display:flex; gap:8px; align-items:flex-start; }
        .ic { width:16px; flex:none; text-align:center; }
        .txt { flex:1; min-width:0; }
        .temp {
          display:flex; align-items:center; gap:9px;
          padding-bottom:9px; border-bottom:1px solid rgba(255,255,255,.08);
        }
        .bolha {
          font-weight:800; font-size:17px; padding:3px 11px; border-radius:999px;
        }
        .q { background:#7f1d1d; color:#fecaca; }
        .m { background:#78350f; color:#fde68a; }
        .f { background:#1e3a5f; color:#bfdbfe; }
        .rot { font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; opacity:.65; }
        .end { color:#86efac; font-weight:700; }
        .alerta { color:#fca5a5; font-weight:700; }
        .queda { color:#fdba74; font-weight:700; }
        .sub { font-size:11.5px; opacity:.7; }
        .btns { display:flex; gap:6px; margin-top:2px; }
        button {
          flex:1; font:inherit; font-size:11.5px; padding:7px 8px; cursor:pointer;
          background:rgba(255,255,255,.09); color:#eef2f6;
          border:1px solid rgba(255,255,255,.12); border-radius:7px;
        }
        button:hover { background:rgba(255,255,255,.16); }
        a { color:#93c5fd; text-decoration:none; }
        .oculto { display:none; }
        .novo { color:#a5b4fc; font-weight:700; }
        pre {
          margin:0; max-height:240px; overflow:auto; font-size:10.5px;
          background:rgba(0,0,0,.35); padding:8px; border-radius:6px;
          white-space:pre-wrap; word-break:break-all;
        }
      </style>
      <div class="cx">
        <div class="top">
          <span class="marca">ImovelMap</span>
          <span class="rot" id="tag"></span>
          <span class="x" id="fechar">✕</span>
        </div>
        <div class="corpo" id="corpo"></div>
      </div>`;

    sh.getElementById("fechar").addEventListener("click", (e) => {
      e.stopPropagation();
      host.remove();
      // fechou de proposito: nao reabre nesta pagina
      window.__imovelmapHudFechado = location.href;
    });

    sh.querySelector(".top").addEventListener("click", () => {
      recolhido = !recolhido;
      sh.getElementById("corpo").classList.toggle("oculto", recolhido);
    });

    return sh;
  }

  function linha(ic, htmlTxt) {
    return `<div class="linha"><div class="ic">${ic}</div><div class="txt">${htmlTxt}</div></div>`;
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );

  // -------------------------------------------------------------- render
  function desenhar(d) {
    const sh = raiz();
    const corpo = sh.getElementById("corpo");
    const tag = sh.getElementById("tag");

    if (!d?.ok) {
      tag.textContent = "";
      corpo.innerHTML = linha("⚠️", esc(d?.erro ?? "sem resposta"));
      return;
    }

    if (d.mapeado === false) {
      tag.textContent = "novo";
      corpo.innerHTML =
        linha("✨", '<span class="novo">Ainda não mapeado</span>') +
        linha("", '<span class="sub">Role a página: a captura entra na base ' +
          "e o dossiê aparece aqui.</span>");
      return;
    }

    const i = d.imovel ?? {};
    const t = Number(d.temperatura ?? 0);
    const classe = t >= 70 ? "q" : t >= 40 ? "m" : "f";
    tag.textContent = "já mapeado";

    const partes = [];

    partes.push(
      `<div class="temp">
         <span class="bolha ${classe}">${t}</span>
         <div><div class="rot">temperatura</div>
         <div class="sub">${esc(i.source ?? "")}${
        d.diasNoMercado ? " · " + d.diasNoMercado + " dias no mercado" : ""
      }</div></div>
       </div>`
    );

    // ⭐ o endereco: o portal esconde, a extensao mostra
    if (i.endereco) {
      const completo =
        esc(i.endereco) +
        (i.enderecoNumero ? ", " + esc(i.enderecoNumero) : "") +
        (i.complemento ? " · " + esc(i.complemento) : "");
      partes.push(
        linha("📍", `<span class="end">${completo}</span>` +
          (i.enderecoConfianca
            ? `<div class="sub">confiança ${i.enderecoConfianca}%</div>`
            : ""))
      );
    } else {
      partes.push(linha("📍", '<span class="sub">endereço ainda não resolvido</span>'));
    }

    // 🏢 cross-portal = sem exclusiva = o lead mais quente que existe
    if (d.portais > 1) {
      const outros = (d.grupo ?? []).map((g) => g.source);
      const precos = new Set(
        [i.price, ...(d.grupo ?? []).map((g) => g.price)]
          .filter((p) => p != null)
          .map((p) => Number(p))
      );
      partes.push(
        linha(
          "🏢",
          `também em: ${esc([...new Set(outros)].join(" · "))}` +
            (precos.size > 1
              ? `<div class="alerta">${precos.size} preços diferentes → SEM EXCLUSIVA</div>`
              : "")
        )
      );
    }

    // 📉 queda de preco
    if (Number(d.quedaPct) > 0 && d.precoPico) {
      partes.push(
        linha(
          "📉",
          `<span class="queda">${esc(brl(d.precoPico))} → ${esc(brl(d.precoAtual))}` +
            ` (−${esc(d.quedaPct)}%)</span>` +
            (d.diasNoMercado ? `<div class="sub">em ${d.diasNoMercado} dias</div>` : "")
        )
      );
    }

    if (d.valorVenal) {
      partes.push(linha("💰", `valor venal IPTU: ${esc(brl(d.valorVenal))}`));
    }

    if (d.cnpj?.razaoSocial) {
      const socio = d.cnpj.socios?.[0];
      partes.push(
        linha(
          "🕵️",
          esc(d.cnpj.nomeFantasia ?? d.cnpj.razaoSocial) +
            (socio ? `<div class="sub">${esc(socio.nome)} · ${esc(socio.qualificacao)}</div>` : "")
        )
      );
    }

    if (d.cartorio) {
      partes.push(linha("📜", `<span class="sub">${esc(d.cartorio)}</span>`));
    }

    if (d.proprietario?.nome) {
      partes.push(linha("👤", esc(d.proprietario.nome)));
    }

    partes.push(
      `<div class="btns">
         <button id="bDossie">dossiê</button>
         <button id="bIptu"${d.iptuUrl ? "" : " disabled"}>IPTU</button>
       </div>`
    );

    corpo.innerHTML = partes.join("");

    corpo.querySelector("#bDossie").addEventListener("click", () => {
      corpo.innerHTML =
        `<div class="btns"><button id="bVoltar">← voltar</button></div>` +
        `<pre>${esc(JSON.stringify(d, null, 2))}</pre>`;
      corpo.querySelector("#bVoltar").addEventListener("click", () => desenhar(d));
    });

    const bIptu = corpo.querySelector("#bIptu");
    if (d.iptuUrl) bIptu.addEventListener("click", () => window.open(d.iptuUrl, "_blank"));
  }

  // ------------------------------------------------------------ ciclo
  async function avaliar() {
    const url = location.href;
    if (url === ultimaUrl || buscando) return;
    if (window.__imovelmapHudFechado === url) return;
    ultimaUrl = url;

    const r = await msg({ tipo: "identificar-anuncio", url, hostname: location.hostname });
    if (!r?.ok || !r.externalId) {
      // nao e pagina de anuncio (busca, home, institucional): sem HUD
      document.getElementById(ID)?.remove();
      return;
    }

    buscando = true;
    try {
      const d = await msg({
        tipo: "dossie",
        source: r.source,
        externalId: r.externalId,
      });
      desenhar(d);
    } finally {
      buscando = false;
    }
  }

  // SPA nao dispara load a cada anuncio: observa a URL
  setInterval(avaliar, 1200);
  window.addEventListener("popstate", () => setTimeout(avaliar, 300));
  avaliar();
})();
