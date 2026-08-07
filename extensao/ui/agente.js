// ImovelMap Radar — tela do agente autônomo

const $ = (id) => document.getElementById(id);

const msg = (bg) =>
  new Promise((ok) =>
    chrome.runtime.sendMessage(bg, (r) => {
      void chrome.runtime.lastError;
      ok(r ?? {});
    })
  );

let estado = null;

const quando = (t) =>
  !t ? "—" : new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function nomeDaBusca(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const trecho = u.pathname.split("/").filter(Boolean).slice(0, 3).join(" / ");
    return trecho ? `${host} · ${trecho}` : host;
  } catch {
    return url.slice(0, 60);
  }
}

async function pintar() {
  const s = await msg({ tipo: "agente-status" });
  estado = s;

  const buscas = s.buscas ?? [];
  const tbody = $("lista");
  tbody.innerHTML = "";
  $("vazio").style.display = buscas.length ? "none" : "block";

  buscas.forEach((b, i) => {
    const tr = document.createElement("tr");

    const td1 = document.createElement("td");
    td1.innerHTML = `<div>${escapar(b.nome ?? nomeDaBusca(b.url))}</div>`;
    const u = document.createElement("div");
    u.className = "url";
    u.textContent = b.url;
    td1.appendChild(u);
    tr.appendChild(td1);

    const td2 = document.createElement("td");
    td2.textContent = b.paginas ?? 5;
    tr.appendChild(td2);

    const td3 = document.createElement("td");
    td3.textContent = quando(b.ultimaExecucao);
    tr.appendChild(td3);

    const td4 = document.createElement("td");
    const pill = document.createElement("span");
    const ligada = b.ativo !== false;
    pill.className = `pill ${ligada ? "on" : "off"}`;
    pill.textContent = ligada ? "ativa" : "pausada";
    pill.style.cursor = "pointer";
    pill.onclick = async () => {
      const todas = [...buscas];
      todas[i] = { ...b, ativo: !ligada };
      await msg({ tipo: "agente-buscas", buscas: todas });
      pintar();
    };
    td4.appendChild(pill);
    tr.appendChild(td4);

    const td5 = document.createElement("td");
    const rm = document.createElement("button");
    rm.className = "sec";
    rm.textContent = "remover";
    rm.style.fontSize = "11.5px";
    rm.style.padding = "5px 9px";
    rm.onclick = async () => {
      await msg({ tipo: "agente-buscas", buscas: buscas.filter((_, k) => k !== i) });
      pintar();
    };
    td5.appendChild(rm);
    tr.appendChild(td5);

    tbody.appendChild(tr);
  });

  // execução
  $("rodar").disabled = s.rodando;
  $("rodar").textContent = s.rodando ? "rodando…" : "Buscar imóveis agora";
  $("parar").disabled = !s.rodando;
  $("auto").checked = Boolean(s.estado?.ligado);

  const p = s.estado?.progresso;
  const box = $("progresso");
  if (p) {
    box.style.display = "block";
    box.textContent = `▶ ${p.busca} — página ${p.pagina}/${p.de}\n${p.url}`;
  } else if (s.estado?.ultimoCiclo) {
    const u = s.estado.ultimoCiclo;
    box.style.display = "block";
    box.textContent =
      `último ciclo: ${u.paginas} páginas em ${Math.round((u.duracaoMs ?? 0) / 1000)}s` +
      (u.bloqueios ? ` · ${u.bloqueios} bloqueio(s)` : "") +
      (u.cancelado ? " · interrompido" : "");
  } else {
    box.style.display = "none";
  }

  const h = $("hist");
  h.innerHTML = "";
  for (const e of s.estado?.historico ?? []) {
    const d = document.createElement("div");
    d.innerHTML = `<span class="hora">${quando(e.quando)}</span>` +
      `${escapar(e.msg ?? e.tipo)}${e.portal ? ` <em>(${escapar(e.portal)})</em>` : ""}`;
    h.appendChild(d);
  }
  if (!(s.estado?.historico ?? []).length) {
    h.innerHTML = '<div style="color:#999">Nada ainda.</div>';
  }
}

const escapar = (t) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

$("add").addEventListener("click", async () => {
  const url = $("url").value.trim();
  $("erro").textContent = "";

  let u;
  try {
    u = new URL(url);
    if (u.protocol !== "https:") throw new Error();
  } catch {
    $("erro").textContent = "Informe uma URL https válida da página de resultados.";
    return;
  }

  // sem permissão de host o content script não roda ali e a captura não acontece
  const origem = `https://*.${u.hostname.replace(/^www\./, "")}/*`;
  const tem = await chrome.permissions.contains({ origins: [origem] });
  if (!tem) {
    const ok = await chrome.permissions.request({ origins: [origem] });
    if (!ok) {
      $("erro").textContent = "Sem permissão para esse site, a captura não funciona.";
      return;
    }
    await msg({ tipo: "site-generico", origem, ligar: true });
  }

  const paginas = Math.max(1, Math.min(5, Number($("paginas").value) || 5));
  const buscas = [...(estado?.buscas ?? [])];
  if (buscas.some((b) => b.url === url)) {
    $("erro").textContent = "Essa busca já está cadastrada.";
    return;
  }
  buscas.push({ url, nome: nomeDaBusca(url), paginas, ativo: true });
  await msg({ tipo: "agente-buscas", buscas });
  $("url").value = "";
  pintar();
});

$("rodar").addEventListener("click", async () => {
  await msg({ tipo: "agente-rodar" });
  setTimeout(pintar, 400);
});

$("parar").addEventListener("click", async () => {
  await msg({ tipo: "agente-parar" });
  setTimeout(pintar, 400);
});

$("auto").addEventListener("change", async (e) => {
  await msg({ tipo: "agente-auto", ligado: e.target.checked });
  pintar();
});

pintar();
setInterval(pintar, 2500);
