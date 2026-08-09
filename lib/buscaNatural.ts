/**
 * Busca em linguagem natural para o corretor.
 *
 * "casa de 2 dormitórios no Menino Deus até 500 mil com garagem"
 *   → { tipo: 'casa', quartosMin: 2, bairro: 'Menino Deus',
 *       precoMax: 500000, vagasMin: 1 }
 *
 * ⚠️ NÃO USA LLM, e não é por economia: consulta de imóvel em português é
 *    formulaica, e regra determinística tem duas vantagens que importam mais
 *    que flexibilidade — ela é instantânea (o corretor digita e vê o resultado
 *    mudar) e é AUDITÁVEL. O corretor vê exatamente o que foi entendido e
 *    corrige, em vez de receber um resultado inexplicável.
 *
 * ⚠️ E O MAIS IMPORTANTE: o que ela NÃO entende ela DEVOLVE em `ignorado`.
 *    Não capturamos a descrição do anúncio — só campos estruturados. Então
 *    "sol da manhã", "mobiliado", "aceita pet", "andar alto" não têm como ser
 *    respondidos (orientação solar aparece em 11 anúncios de 72.812). Aceitar
 *    o termo em silêncio e devolver casas sem sol da manhã seria pior que
 *    dizer que não sabe.
 */

export type FiltrosNaturais = {
  tipo?: string;
  transacao?: "sale" | "rent";
  quartosMin?: number;
  banheirosMin?: number;
  vagasMin?: number;
  areaMin?: number;
  areaMax?: number;
  precoMin?: number;
  precoMax?: number;
  bairro?: string;
  cidade?: string;
  comMatricula?: boolean;
  comContato?: boolean;
  oportunidade?: boolean;
  caro?: boolean;
  semExclusiva?: boolean;
};

export type Leitura = {
  filtros: FiltrosNaturais;
  entendido: string[];
  ignorado: string[];
};

const NUM: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6
};

/**
 * "500 mil" → 500000 · "1,2 milhões" → 1200000 · "450.000" → 450000
 *
 * ⚠️ `aluguel` muda a leitura de número pequeno. Em venda, "até 500" é
 *    500 mil; em aluguel, "até 2500" são R$ 2.500 por mês. Sem isso o
 *    teste devolvia R$ 2,5 milhões de aluguel.
 */
function valor(texto: string, aluguel = false): number | null {
  const m = texto.match(/([\d.,]+)\s*(milh[õo]es|milh[ãa]o|mil|mi)?/);
  if (!m) return null;
  let n = Number(m[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const u = m[2] ?? "";
  // ⚠️ testar milhão ANTES de mil: /^mil/ casa "milhao" também
  if (/^milh/.test(u)) n *= 1_000_000;
  else if (/^mi?l?$/.test(u) && u) n *= u === "mi" ? 1_000_000 : 1_000;
  else if (!aluguel && n < 10_000) n *= 1_000;
  return Math.round(n);
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Termos que o corretor vai digitar e que NÃO temos como responder, porque
 * dependem da descrição do anúncio — que os coletores não capturam.
 */
const NAO_TEMOS: { re: RegExp; oq: string }[] = [
  { re: /\bsol\b|nascente|poente|face (norte|sul|leste|oeste)|orienta[çc][ãa]o solar/, oq: "orientação solar" },
  { re: /mobiliad|semimobiliad/, oq: "mobiliado" },
  { re: /\bpet\b|aceita animal|animais/, oq: "aceita pet" },
  { re: /andar alto|[úu]ltimo andar|t[ée]rreo/, oq: "andar" },
  { re: /piscina|academia|sal[ãa]o de festas|churrasqueira|port[ãa]ria 24/, oq: "itens de lazer" },
  { re: /reformad|novo|na planta|usado/, oq: "estado de conservação" },
  { re: /vista|sacada|varanda/, oq: "vista e sacada" },
  { re: /elevador/, oq: "elevador" }
];

const TIPOS: { re: RegExp; v: string }[] = [
  { re: /\bcasas?\b|sobrado/, v: "casa" },
  { re: /\bapartamentos?\b|\bapto?s?\b|\bap\b/, v: "apartamento" },
  { re: /cobertura/, v: "cobertura" },
  { re: /\bterrenos?\b|\blotes?\b/, v: "terreno" },
  { re: /\bsalas?\b|conjunto|escrit[óo]rio/, v: "sala" },
  { re: /\blojas?\b|comercial/, v: "loja" },
  { re: /galp[ãa]o|pavilh[ãa]o/, v: "galpao" },
  { re: /kitnet|kitchenette|jk\b|studio|est[úu]dio/, v: "kitnet" }
];

export function lerBusca(texto: string, bairrosConhecidos: string[] = []): Leitura {
  const t = semAcento(texto);
  const f: FiltrosNaturais = {};
  const entendido: string[] = [];
  const ignorado: string[] = [];

  // ── tipo ────────────────────────────────────────────────────────────────
  for (const { re, v } of TIPOS) {
    if (re.test(t)) {
      f.tipo = v;
      entendido.push(v);
      break;
    }
  }

  // ── venda ou aluguel ────────────────────────────────────────────────────
  if (/alug|loca[çc]/.test(t)) {
    f.transacao = "rent";
    entendido.push("aluguel");
  } else if (/venda|comprar|vender/.test(t)) {
    f.transacao = "sale";
    entendido.push("venda");
  }

  // ── quartos, banheiros, vagas ───────────────────────────────────────────
  const quant = (re: RegExp) => {
    const m = t.match(re);
    if (!m) return null;
    const bruto = m[1];
    return /^\d+$/.test(bruto) ? Number(bruto) : NUM[bruto] ?? null;
  };

  const q = quant(/(\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s*(?:dormit[óo]rios?|dorm\b|quartos?)/);
  if (q) { f.quartosMin = q; entendido.push(`${q} dormitório${q > 1 ? "s" : ""}`); }

  const b = quant(/(\d+|um|uma|dois|duas|tres|quatro)\s*(?:banheiros?|banhos?|su[íi]tes?)/);
  if (b) { f.banheirosMin = b; entendido.push(`${b} banheiro${b > 1 ? "s" : ""}`); }

  const v = quant(/(\d+|um|uma|dois|duas|tres|quatro)\s*(?:vagas?|garagens?)/);
  if (v) { f.vagasMin = v; entendido.push(`${v} vaga${v > 1 ? "s" : ""}`); }
  else if (/\b(com garagem|com vaga)\b/.test(t)) {
    f.vagasMin = 1;
    entendido.push("com garagem");
  }

  // ── área ────────────────────────────────────────────────────────────────
  const area = t.match(/(?:acima de|mais de|a partir de|min[íi]mo de|no m[íi]nimo)?\s*(\d{2,4})\s*(?:m2|m²|metros)/);
  if (area) {
    f.areaMin = Number(area[1]);
    entendido.push(`${area[1]} m² ou mais`);
  }

  // ── preço ───────────────────────────────────────────────────────────────
  // ⚠️ A ÁREA SAI DO TEXTO ANTES DE PROCURAR PREÇO. "acima de 120 m2" casava
  //    com o padrão de preço mínimo e virava R$ 120.000; e em "acima de 300
  //    metros a partir de 1 milhão" o 300 comia o lugar do milhão.
  const semArea = t.replace(/(\d{2,4})\s*(?:m2|m²|metros)/g, " ");
  const aluguel = f.transacao === "rent";

  const ate = semArea.match(/(?:at[ée]|no m[áa]ximo|abaixo de|menos de)\s*(?:r\$)?\s*([\d.,]+\s*(?:milh[õo]es|milh[ãa]o|mil|mi)?)/);
  if (ate) {
    const n = valor(ate[1], aluguel);
    if (n) { f.precoMax = n; entendido.push(`até ${fmt(n)}`); }
  }
  const apartir = semArea.match(/(?:a partir de|acima de|mais de|no m[íi]nimo)\s*(?:r\$)?\s*([\d.,]+\s*(?:milh[õo]es|milh[ãa]o|mil|mi)?)/);
  if (apartir) {
    const n = valor(apartir[1], aluguel);
    if (n) { f.precoMin = n; entendido.push(`a partir de ${fmt(n)}`); }
  }
  const entre = semArea.match(/entre\s*(?:r\$)?\s*([\d.,]+\s*(?:milh[õo]es|milh[ãa]o|mil|mi)?)\s*e\s*(?:r\$)?\s*([\d.,]+\s*(?:milh[õo]es|milh[ãa]o|mil|mi)?)/);
  if (entre) {
    const a = valor(entre[1], aluguel);
    const z = valor(entre[2], aluguel);
    if (a && z) {
      // "entre X e Y" manda: apaga o que "a partir de"/"até" tiverem posto
      f.precoMin = Math.min(a, z);
      f.precoMax = Math.max(a, z);
      const i = entendido.findIndex((x) => x.startsWith("a partir de") || x.startsWith("até"));
      if (i >= 0) entendido.splice(i, 1);
      entendido.push(`entre ${fmt(f.precoMin)} e ${fmt(f.precoMax)}`);
    }
  }

  // ── bairro: casa contra a lista real, do maior nome para o menor, senão
  //    "Vila Nova" seria achado dentro de "Vila Nova do Sul"
  const ordenados = [...bairrosConhecidos].sort((a, z) => z.length - a.length);
  for (const nome of ordenados) {
    if (nome.length >= 4 && t.includes(semAcento(nome))) {
      f.bairro = nome;
      entendido.push(nome);
      break;
    }
  }

  // ── os nossos sinais ────────────────────────────────────────────────────
  if (/matr[íi]cula|certid[ãa]o|propriet[áa]rio|dono/.test(t)) {
    f.comMatricula = true;
    entendido.push("com matrícula");
  }
  if (/telefone|contato|falar com/.test(t)) {
    f.comContato = true;
    entendido.push("com contato");
  }
  if (/oportunidade|n[ãa]o (e|é) nosso|fora da (nossa )?carteira/.test(t)) {
    f.oportunidade = true;
    entendido.push("só oportunidades");
  }
  if (/caro|acima do (pre[çc]o|mercado|pr[ée]dio)|sobrepre[çc]o|encalhad/.test(t)) {
    f.caro = true;
    entendido.push("pedindo acima do prédio");
  }
  if (/sem exclusiv|v[áa]rios portais|v[áa]rias imobili/.test(t)) {
    f.semExclusiva = true;
    entendido.push("sem exclusividade");
  }

  // ── o que não temos como responder ──────────────────────────────────────
  for (const { re, oq } of NAO_TEMOS) {
    if (re.test(t) && !ignorado.includes(oq)) ignorado.push(oq);
  }

  return { filtros: f, entendido, ignorado };
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  });
}

/** Converte a leitura nos parâmetros que /imoveis já entende. */
export function paraQuery(f: FiltrosNaturais): URLSearchParams {
  const p = new URLSearchParams();
  if (f.transacao) p.set("tipo", f.transacao);
  if (f.bairro) p.set("bairro", f.bairro);
  if (f.cidade) p.set("cidade", f.cidade);
  if (f.quartosMin) p.set("quartos_min", String(f.quartosMin));
  if (f.areaMin) p.set("area_min", String(f.areaMin));
  if (f.precoMin) p.set("preco_min", String(f.precoMin));
  if (f.precoMax) p.set("preco_max", String(f.precoMax));
  if (f.comMatricula) p.set("com_matricula", "1");
  if (f.comContato) p.set("com_contato", "2");
  if (f.oportunidade) p.set("sem_auxiliadora", "1");
  if (f.caro) p.set("caro", "1");
  if (f.semExclusiva) p.set("sem_exclusiva", "1");
  if (f.tipo) p.set("q", f.tipo);
  return p;
}
