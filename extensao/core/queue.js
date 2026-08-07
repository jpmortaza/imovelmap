// ImovelMap Radar — fila offline-first
//
// O corretor pode estar num predio sem sinal. A captura entra em IndexedDB
// e sobe quando der. Nada se perde, e a navegacao dele nunca trava esperando
// rede: o content script enfileira e devolve o controle na hora.
//
// Dedup local por (source, external_id): rolar a mesma busca tres vezes
// nao gera tres envios.

const DB = "imovelmap-radar";
const LOJA = "fila";
const VERSAO = 1;

let dbPromise = null;

function abrir() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((ok, erro) => {
    const req = indexedDB.open(DB, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA)) {
        const loja = db.createObjectStore(LOJA, { keyPath: "chave" });
        loja.createIndex("estado", "estado");
        loja.createIndex("criadoEm", "criadoEm");
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
  return dbPromise;
}

function tx(modo) {
  return abrir().then((db) => db.transaction(LOJA, modo).objectStore(LOJA));
}

function promessa(req) {
  return new Promise((ok, erro) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

const chaveDe = (item) => `${item.source}::${item.id}`;

/**
 * Enfileira itens. Item ja pendente com a mesma chave e sobrescrito
 * (o payload mais novo vale mais), item ja enviado volta so se mudou o preco.
 */
export async function enfileirar(itens, contexto = {}) {
  if (!Array.isArray(itens) || itens.length === 0) return 0;
  const loja = await tx("readwrite");
  const agora = Date.now();
  let novos = 0;

  for (const item of itens) {
    if (!item?.source || !item?.id) continue;
    const chave = chaveDe(item);
    const atual = await promessa(loja.get(chave));

    if (atual?.estado === "enviado" && atual.precoEnviado === (item.price ?? null)) {
      continue; // ja subiu e nada mudou
    }

    await promessa(
      loja.put({
        chave,
        item,
        contexto,
        estado: "pendente",
        tentativas: atual?.tentativas ?? 0,
        criadoEm: atual?.criadoEm ?? agora,
        atualizadoEm: agora,
      })
    );
    novos++;
  }
  return novos;
}

/** Proximo lote pendente, do mais antigo para o mais novo. */
export async function proximoLote(tamanho) {
  const loja = await tx("readonly");
  const registros = await promessa(loja.index("estado").getAll("pendente", tamanho));
  return registros;
}

export async function marcarEnviados(registros) {
  const loja = await tx("readwrite");
  const agora = Date.now();
  for (const r of registros) {
    await promessa(
      loja.put({
        ...r,
        estado: "enviado",
        precoEnviado: r.item?.price ?? null,
        atualizadoEm: agora,
      })
    );
  }
}

export async function marcarFalha(registros, erro) {
  const loja = await tx("readwrite");
  const agora = Date.now();
  for (const r of registros) {
    const tentativas = (r.tentativas ?? 0) + 1;
    await promessa(
      loja.put({
        ...r,
        // depois de 5 tentativas para de tentar para sempre; fica como
        // 'travado' e aparece no popup em vez de girar em looping
        estado: tentativas >= 5 ? "travado" : "pendente",
        tentativas,
        ultimoErro: String(erro).slice(0, 300),
        atualizadoEm: agora,
      })
    );
  }
}

export async function contagens() {
  const loja = await tx("readonly");
  const todos = await promessa(loja.getAll());
  const c = { pendente: 0, enviado: 0, travado: 0, total: todos.length };
  for (const r of todos) c[r.estado] = (c[r.estado] ?? 0) + 1;
  return c;
}

/** Limpa o que ja subiu ha mais de um dia — a fila nao e arquivo. */
export async function podar(idadeMs = 24 * 60 * 60 * 1000) {
  const loja = await tx("readwrite");
  const todos = await promessa(loja.getAll());
  const corte = Date.now() - idadeMs;
  let removidos = 0;
  for (const r of todos) {
    if (r.estado === "enviado" && r.atualizadoEm < corte) {
      await promessa(loja.delete(r.chave));
      removidos++;
    }
  }
  return removidos;
}

export async function limpar() {
  const loja = await tx("readwrite");
  await promessa(loja.clear());
}
