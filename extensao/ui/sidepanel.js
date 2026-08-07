// ImovelMap Radar — sidepanel: o que entrou nesta sessao

const $ = (id) => document.getElementById(id);

const msg = (bg) =>
  new Promise((ok) =>
    chrome.runtime.sendMessage(bg, (r) => {
      void chrome.runtime.lastError;
      ok(r ?? {});
    })
  );

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function preco(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? brl.format(n) : "Sob consulta";
}

function cartao(i) {
  const a = document.createElement("a");
  a.className = "card";
  a.href = i.url ?? "#";
  a.target = "_blank";
  a.rel = "noreferrer";

  const img = document.createElement("img");
  if (i.imagem) img.src = i.imagem;
  img.alt = "";
  a.appendChild(img);

  const dir = document.createElement("div");

  const p = document.createElement("div");
  p.className = "preco";
  p.textContent = preco(i.price);
  dir.appendChild(p);

  const t = document.createElement("div");
  t.className = "tit";
  t.textContent = i.title ?? "(sem título)";
  dir.appendChild(t);

  // ⭐ o endereco e o motivo do produto existir: destacado quando veio
  if (i.endereco) {
    const e = document.createElement("div");
    e.className = "end";
    e.textContent = `📍 ${i.endereco}${i.enderecoNumero ? ", " + i.enderecoNumero : ""}`;
    dir.appendChild(e);
  }

  const l = document.createElement("div");
  l.className = "local";
  l.textContent = [
    i.area ? `${i.area}m²` : null,
    i.bedrooms != null ? `${i.bedrooms} quartos` : null,
    i.neighborhood,
    i.city,
  ]
    .filter(Boolean)
    .join(" · ");
  dir.appendChild(l);

  const m = document.createElement("div");
  m.className = "marca";
  m.textContent = i.portal ?? i.source;
  dir.appendChild(m);

  a.appendChild(dir);
  return a;
}

async function pintar() {
  const { itens = [] } = await msg({ tipo: "sessao" });
  const lista = $("lista");

  if (!itens.length) {
    lista.innerHTML =
      '<div class="vazio">Nada capturado ainda.<br><br>' +
      "Abra uma busca num portal habilitado e role a página.</div>";
    $("resumo").textContent = "";
    return;
  }

  const comEndereco = itens.filter((i) => i.endereco).length;
  $("resumo").textContent =
    `${itens.length} imóveis · ${comEndereco} com endereço revelado`;

  lista.innerHTML = "";
  for (const i of itens) lista.appendChild(cartao(i));
}

$("btnLimpar").addEventListener("click", async () => {
  await msg({ tipo: "limpar-sessao" });
  await pintar();
});

pintar();
setInterval(pintar, 2500);
