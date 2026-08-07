// ImovelMap Radar — descriptors declarativos
//
// Padrao do mtzSpider 5.x: portal novo = uma entrada aqui, nao um scraper
// novo. O engine (engine.js) e sempre o mesmo.
//
// Tres familias de extrator:
//   glueApi   ZAP e VivaReal (mesmo grupo, mesma API)
//   nextData  OLX (SPA Next.js: os anuncios vem no __NEXT_DATA__)
//   jsonLd    ImovelWeb e QUALQUER imobiliaria que embuta schema.org
//
// ⚠️ CALIBRAGEM: os caminhos de campo nao puderam ser verificados contra
// resposta real — os portais devolvem 403 para IP de datacenter, que e
// exatamente o motivo desta extensao existir. Cada campo e lido por uma
// lista de caminhos candidatos, e o modo debug do popup guarda a primeira
// resposta de cada portal para conferencia. Ver README.

/** primeiro elemento util de array, ou o proprio valor */
const um = (v) => (Array.isArray(v) ? (v.length ? v[0] : null) : v ?? null);

/** primeiro caminho que resolver para valor nao-vazio */
function caminho(obj, ...caminhos) {
  for (const c of caminhos) {
    let v = obj;
    for (const parte of c.split(".")) {
      if (v == null) break;
      v = v[parte];
    }
    v = um(v);
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

function normalizarMidia(url) {
  if (typeof url !== "string") return null;
  return url
    .replace("{action}", "fit-in")
    .replace("{width}x{height}", "870x653")
    .replace("{width}", "870")
    .replace("{height}", "653");
}

function negocio(tipo) {
  const t = String(tipo ?? "").toUpperCase();
  if (t.includes("SALE") || t.includes("VENDA") || t.includes("COMPRA")) return "sale";
  if (t.includes("RENTAL") || t.includes("RENT") || t.includes("ALUG") || t.includes("LOCA"))
    return "rent";
  return null;
}

/** id estavel a partir da URL, quando o anuncio nao traz identificador */
function idDaUrl(url) {
  try {
    const u = new URL(url);
    const partes = u.pathname.split("/").filter(Boolean);
    // muitos sites terminam em .../imovel-xyz-id-12345 ou /imovel/12345
    for (let i = partes.length - 1; i >= 0; i--) {
      const m = partes[i].match(/(\d{4,})/);
      if (m) return m[1];
    }
    return partes.length ? partes[partes.length - 1].slice(0, 120) : null;
  } catch {
    return null;
  }
}

/** hostname sem www, serve de `source` para site desconhecido */
function slugDoHost(hostname) {
  return String(hostname ?? "")
    .replace(/^www\./i, "")
    .toLowerCase()
    .slice(0, 60);
}

function imagensDe(lista, max = 30) {
  if (!Array.isArray(lista)) lista = lista ? [lista] : [];
  return [
    ...new Set(
      lista
        .map((m) =>
          normalizarMidia(
            typeof m === "string" ? m : m?.url ?? m?.original ?? m?.contentUrl ?? null
          )
        )
        .filter((u) => typeof u === "string" && u.startsWith("http"))
    ),
  ].slice(0, max);
}

// ======================================================== família glue-api
function extrairGlueApi(json, { slug, baseUrl }) {
  let lista =
    json?.search?.result?.listings ??
    json?.result?.listings ??
    json?.listings ??
    (Array.isArray(json) ? json : null);

  if (!Array.isArray(lista) || lista.length === 0) {
    // portal refatorou o envelope: acha a lista onde quer que esteja
    lista = acharListasDeAnuncios(json)[0] ?? null;
  }
  if (!Array.isArray(lista)) return [];

  const itens = [];
  for (const bruto of lista) {
    const l = bruto?.listing ?? bruto;
    if (!l) continue;

    const id = caminho(l, "id", "listingId", "externalId");
    if (!id) continue;

    const p = um(bruto?.pricingInfos ?? l?.pricingInfos ?? []) ?? {};
    const href = caminho(bruto, "link.href") ?? caminho(l, "link.href");
    const url = href
      ? href.startsWith("http")
        ? href
        : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`
      : `${baseUrl}/imovel/${id}`;

    const images = imagensDe(bruto?.medias ?? l?.medias ?? l?.images ?? []);

    itens.push({
      id: String(id),
      source: slug,
      url,
      title: caminho(l, "title", "name", "description"),
      transactionType: negocio(p.businessType ?? caminho(l, "businessType")),
      propertyType: caminho(l, "unitTypes", "propertyType", "unitSubTypes"),
      propertySubType: caminho(l, "unitSubTypes", "usageTypes"),
      price: p.price ?? p.rentalTotalPrice ?? caminho(l, "price"),
      priceFormatted: null,
      condominiumFee: p.monthlyCondoFee ?? null,
      iptu: p.yearlyIptu ?? null,
      area: caminho(l, "usableAreas", "totalAreas", "area"),
      bedrooms: caminho(l, "bedrooms"),
      bathrooms: caminho(l, "bathrooms"),
      parkingSpaces: caminho(l, "parkingSpaces"),
      endereco: caminho(l, "address.street"),
      enderecoNumero: caminho(l, "address.streetNumber"),
      complemento: caminho(l, "address.complement", "address.unitNumber"),
      cep: caminho(l, "address.zipCode"),
      latitude: caminho(l, "address.point.lat", "address.geoLocation.location.lat"),
      longitude: caminho(l, "address.point.lon", "address.geoLocation.location.lon"),
      neighborhood: caminho(l, "address.neighborhood"),
      city: caminho(l, "address.city"),
      state: caminho(l, "address.stateAcronym", "address.state"),
      images,
      imageCount: images.length,
      publishedAt: caminho(l, "createdAt", "publicationDate"),
      scrapedAt: new Date().toISOString(),
    });
  }
  return itens;
}


// ─────────────────────────────────────────────────────────────────────────
// Busca profunda por listas de anuncios
//
// Caminho fixo (props.pageProps.ads) quebra toda vez que o portal refatora,
// e quebra em SILENCIO: o extrator devolve [] e a pagina parece "so ter um
// imovel". Em vez de adivinhar o caminho, varremos a arvore inteira e
// pegamos qualquer array cujos elementos TENHAM CARA de anuncio.
//
// Sobrevive a refatoracao do portal sem precisar de manutencao.
// ─────────────────────────────────────────────────────────────────────────

function pareceAnuncio(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const id = o.listId ?? o.id ?? o.adId ?? o.listingId ?? o.externalId;
  if (id === undefined || id === null || id === "") return false;
  const titulo = o.subject ?? o.title ?? o.name ?? o.description;
  const preco = o.price ?? o.priceValue ?? o.pricingInfos ?? o.offers ?? o.oldPrice;
  const local = o.location ?? o.address ?? o.locationData ?? o.geo;
  const extra = o.images ?? o.photos ?? o.medias ?? o.thumbnail;
  // titulo + (preco | local | fotos) e assinatura suficiente
  return Boolean(titulo) && Boolean(preco || local || extra);
}

/** Todas as listas de anuncios da arvore, da maior para a menor. */
function acharListasDeAnuncios(raiz, maxProf = 9) {
  const achadas = [];
  const visto = new Set();

  const visitar = (n, prof) => {
    if (!n || typeof n !== "object" || prof > maxProf) return;
    if (visto.has(n)) return;
    visto.add(n);

    if (Array.isArray(n)) {
      const objetos = n.filter((x) => x && typeof x === "object");
      if (objetos.length >= 1) {
        const amostra = objetos.slice(0, 6);
        const parecem = amostra.filter(pareceAnuncio).length;
        // maioria da amostra parece anuncio -> e a lista que queremos
        if (parecem >= Math.ceil(amostra.length / 2)) {
          achadas.push(n);
          return; // nao desce mais: os itens sao folhas para nos
        }
      }
      for (const x of n.slice(0, 80)) visitar(x, prof + 1);
      return;
    }

    for (const k of Object.keys(n)) visitar(n[k], prof + 1);
  };

  visitar(raiz, 0);
  return achadas.sort((a, b) => b.length - a.length);
}

// ====================================================== família __NEXT_DATA__
// OLX: os anuncios da busca ficam em props.pageProps.ads; a pagina de um
// anuncio traz props.pageProps.ad. Atributos variaveis vem numa lista
// [{name, value}] em vez de campos fixos.
function propriedadesOlx(ad) {
  const mapa = {};
  const props = ad?.properties ?? ad?.attributes ?? [];
  if (Array.isArray(props)) {
    for (const p of props) {
      const k = String(p?.name ?? p?.label ?? "").toLowerCase();
      if (k) mapa[k] = p?.value ?? p?.values ?? null;
    }
  }
  return mapa;
}

function extrairNextDataOlx(json, { slug, baseUrl }) {
  const pp = json?.props?.pageProps ?? json?.pageProps ?? json;

  // caminhos conhecidos primeiro (mais barato); se falharem, varre a arvore
  let lista = pp?.ads ?? pp?.listings ?? pp?.adList ?? (pp?.ad ? [pp.ad] : null);
  if (!Array.isArray(lista) || lista.length === 0) {
    const candidatas = acharListasDeAnuncios(json);
    lista = candidatas[0] ?? null;
  }
  if (!Array.isArray(lista)) return [];

  const itens = [];
  for (const ad of lista) {
    const id = caminho(ad, "listId", "id", "adId");
    if (!id) continue;

    const p = propriedadesOlx(ad);
    const loc = ad?.location ?? ad?.locationData ?? {};

    itens.push({
      id: String(id),
      source: slug,
      url: caminho(ad, "url", "friendlyUrl", "link") ?? `${baseUrl}/${id}`,
      title: caminho(ad, "subject", "title", "name"),
      // OLX separa venda/aluguel pela categoria; o rotulo textual e o sinal
      transactionType: negocio(
        p["tipo de anúncio"] ?? p["categoria"] ?? ad?.category ?? ad?.categoryName ?? ""
      ),
      propertyType: p["tipo"] ?? p["tipo do imóvel"] ?? null,
      propertySubType: null,
      price: ad?.price ?? ad?.priceValue ?? null,
      priceFormatted: typeof ad?.price === "string" ? ad.price : null,
      condominiumFee: p["condomínio"] ?? p["condominio"] ?? null,
      iptu: p["iptu"] ?? null,
      area: p["área útil"] ?? p["area util"] ?? p["metragem"] ?? p["tamanho"] ?? null,
      bedrooms: p["quartos"] ?? null,
      bathrooms: p["banheiros"] ?? null,
      parkingSpaces: p["vagas na garagem"] ?? p["vagas"] ?? null,
      endereco: loc?.address ?? p["endereço"] ?? null,
      enderecoNumero: null,
      complemento: null,
      cep: loc?.zipcode ?? loc?.zipCode ?? p["cep"] ?? null,
      latitude: loc?.lat ?? loc?.latitude ?? null,
      longitude: loc?.lon ?? loc?.lng ?? loc?.longitude ?? null,
      neighborhood: loc?.neighbourhood ?? loc?.neighborhood ?? null,
      city: loc?.municipality ?? loc?.city ?? null,
      state: loc?.uf ?? loc?.state ?? null,
      images: imagensDe(ad?.images ?? ad?.photos ?? []),
      imageCount: (ad?.images ?? ad?.photos ?? []).length || 0,
      publishedAt: ad?.date ?? ad?.publishedAt ?? null,
      scrapedAt: new Date().toISOString(),
    });
  }
  return itens.map((i) => ({ ...i, imageCount: i.images.length || i.imageCount }));
}

// ========================================================= família JSON-LD
// schema.org. Cobre ImovelWeb e a imobiliaria pequena de qualquer cidade —
// e o que faz a promessa de "funciona em qualquer site" ser verdade sem
// escrever um scraper por site.
const TIPOS_IMOVEL = new Set([
  "realestatelisting", "product", "offer", "residence", "apartment", "house",
  "singlefamilyresidence", "accommodation", "place",
]);

function achatarGrafo(json) {
  const saida = [];
  const visitar = (n, prof = 0) => {
    if (!n || prof > 6) return;
    if (Array.isArray(n)) return n.forEach((x) => visitar(x, prof + 1));
    if (typeof n !== "object") return;
    saida.push(n);
    if (n["@graph"]) visitar(n["@graph"], prof + 1);
    if (n.itemListElement) visitar(n.itemListElement, prof + 1);
    if (n.item) visitar(n.item, prof + 1);
    if (n.mainEntity) visitar(n.mainEntity, prof + 1);
  };
  visitar(json);
  return saida;
}

/**
 * schema.org junta tudo em streetAddress ("Rua Souza Reis, 88"). O funil de
 * endereco da Fase 8 cruza logradouro + numero separados no cadastro do IPTU,
 * entao separamos aqui. Conservador: so corta quando o fim e mesmo um numero.
 */
function separarEndereco(streetAddress) {
  const s = String(streetAddress ?? "").trim();
  if (!s) return { rua: null, numero: null };

  const m = s.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)\s*(?:[-–—]\s*(.*))?$/);
  if (!m) return { rua: s, numero: null };

  const rua = m[1].trim().replace(/[,\s]+$/, "");
  if (!rua) return { rua: s, numero: null };
  return { rua, numero: m[2] };
}

function ehImovel(n) {
  const t = n?.["@type"];
  const tipos = (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => String(x).toLowerCase());
  if (!tipos.some((x) => TIPOS_IMOVEL.has(x))) return false;
  // Product/Place so contam se parecerem imovel de verdade
  return Boolean(
    n.address || n.geo || n.floorSize || n.numberOfRooms || n.offers || n.price
  );
}

function extrairJsonLd(json, { slug, pagina, hostname }) {
  const nos = achatarGrafo(json).filter(ehImovel);
  if (!nos.length) return [];

  const itens = [];
  for (const n of nos) {
    const offer = um(n.offers) ?? {};
    const addr = n.address ?? {};
    const url = String(n.url ?? offer.url ?? pagina ?? "");
    const id = String(
      caminho(n, "sku", "productID", "identifier", "@id") ?? idDaUrl(url) ?? ""
    ).slice(0, 200);
    if (!id) continue;

    const images = imagensDe(n.image ?? n.photo ?? []);
    const areaBruta = n.floorSize?.value ?? n.floorSize ?? n.area ?? null;
    const end = separarEndereco(caminho(addr, "streetAddress"));

    itens.push({
      id,
      source: slug ?? slugDoHost(hostname),
      url: url || pagina,
      title: caminho(n, "name", "headline", "description"),
      transactionType: negocio(
        offer.businessFunction ?? n.businessFunction ?? n.category ?? url
      ),
      propertyType: caminho(n, "additionalType", "category"),
      propertySubType: null,
      price: offer.price ?? offer.lowPrice ?? n.price ?? null,
      priceFormatted: null,
      condominiumFee: null,
      iptu: null,
      area: typeof areaBruta === "object" ? areaBruta?.value ?? null : areaBruta,
      bedrooms: caminho(n, "numberOfRooms", "numberOfBedrooms"),
      bathrooms: caminho(n, "numberOfBathroomsTotal", "numberOfBathrooms"),
      parkingSpaces: null,
      endereco: end.rua,
      enderecoNumero: end.numero,
      complemento: null,
      cep: caminho(addr, "postalCode"),
      latitude: caminho(n, "geo.latitude"),
      longitude: caminho(n, "geo.longitude"),
      // sem cair em addressLocality: la mora a CIDADE. Bairro errado
      // envenena o filtro do painel e o match de alerta.
      neighborhood: caminho(addr, "addressNeighborhood", "neighborhood", "addressSublocality"),
      city: caminho(addr, "addressLocality"),
      state: caminho(addr, "addressRegion"),
      images,
      imageCount: images.length,
      publishedAt: caminho(n, "datePosted", "datePublished"),
      scrapedAt: new Date().toISOString(),
    });
  }
  return itens;
}


/**
 * URL da pagina N de uma busca. Cada portal tem o seu parametro; quando nao
 * sabemos, `?pagina=N` cobre a maioria dos sites de imobiliaria.
 */
function paginarPadrao(url, n, param = "pagina") {
  if (n <= 1) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(param, String(n));
    return u.toString();
  } catch {
    return url;
  }
}

// ============================================================== descriptors
const URL_LISTAGEM = /glue-api|\/v\d\/listings|listing|__NEXT_DATA__|ld\+json|\/api\/search/i;

/**
 * Id do anuncio a partir da URL da PAGINA (nao da resposta de rede).
 * E o que permite o HUD saber de qual imovel falar assim que a pagina abre,
 * sem depender de ter interceptado alguma requisicao antes.
 */
function idPorPadroes(url, padroes) {
  for (const re of padroes) {
    const m = String(url).match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

export const DESCRIPTORS = [
  {
    slug: "zapimoveis",
    nome: "ZAP Imóveis",
    hosts: [/(^|\.)zapimoveis\.com\.br$/i],
    baseUrl: "https://www.zapimoveis.com.br",
    origem: "https://*.zapimoveis.com.br/*",
    aceita: (url) => URL_LISTAGEM.test(url),
    idDaPagina: (url) => idPorPadroes(url, [/[-\/]id-(\d{4,})/i, /\/imovel\/(\d{4,})/i]),
    paginar: (url, n) => paginarPadrao(url, n, "pagina"),
    extrair(json, ctx) {
      return (
        extrairGlueApi(json, { slug: this.slug, baseUrl: this.baseUrl }) ??
        []
      ).concat(
        // pagina de anuncio individual costuma ter so o JSON-LD
        extrairJsonLd(json, { slug: this.slug, pagina: ctx.pagina, hostname: ctx.hostname })
      );
    },
  },
  {
    slug: "vivareal",
    nome: "VivaReal",
    hosts: [/(^|\.)vivareal\.com\.br$/i],
    baseUrl: "https://www.vivareal.com.br",
    origem: "https://*.vivareal.com.br/*",
    aceita: (url) => URL_LISTAGEM.test(url),
    idDaPagina: (url) => idPorPadroes(url, [/[-\/]id-(\d{4,})/i, /\/imovel\/(\d{4,})/i]),
    paginar: (url, n) => paginarPadrao(url, n, "pagina"),
    extrair(json, ctx) {
      return extrairGlueApi(json, { slug: this.slug, baseUrl: this.baseUrl }).concat(
        extrairJsonLd(json, { slug: this.slug, pagina: ctx.pagina, hostname: ctx.hostname })
      );
    },
  },
  {
    slug: "olx",
    nome: "OLX",
    hosts: [/(^|\.)olx\.com\.br$/i],
    baseUrl: "https://www.olx.com.br",
    origem: "https://*.olx.com.br/*",
    aceita: (url) => URL_LISTAGEM.test(url),
    idDaPagina: (url) => idPorPadroes(url, [/-(\d{9,})(?:[?#/]|$)/, /\/(\d{9,})(?:[?#/]|$)/]),
    paginar: (url, n) => paginarPadrao(url, n, "o"),
    extrair(json, ctx) {
      const porNext = extrairNextDataOlx(json, { slug: this.slug, baseUrl: this.baseUrl });
      if (porNext.length) return porNext;
      return extrairJsonLd(json, { slug: this.slug, pagina: ctx.pagina, hostname: ctx.hostname });
    },
  },
  {
    slug: "imovelweb",
    nome: "ImovelWeb",
    hosts: [/(^|\.)imovelweb\.com\.br$/i],
    baseUrl: "https://www.imovelweb.com.br",
    origem: "https://*.imovelweb.com.br/*",
    aceita: (url) => URL_LISTAGEM.test(url),
    idDaPagina: (url) => idPorPadroes(url, [/-(\d{6,})\.html/i, /[-\/]id-(\d{4,})/i]),
    paginar: (url, n) => paginarPadrao(url, n, "pagina"),
    // nao e do Grupo ZAP: nao tem glue-api. Vai por JSON-LD / __NEXT_DATA__.
    extrair(json, ctx) {
      return extrairJsonLd(json, { slug: this.slug, pagina: ctx.pagina, hostname: ctx.hostname });
    },
  },
];

/**
 * Descriptor generico: qualquer site que o corretor autorizar. `source` vira
 * o hostname, entao cada imobiliaria fica separada na base sem cadastro
 * previo de fonte.
 */
export const GENERICO = {
  slug: null,
  nome: "Site genérico (JSON-LD)",
  generico: true,
  aceita: (url) => URL_LISTAGEM.test(url),
  idDaPagina: (url) => idDaUrl(url),
  paginar: (url, n) => paginarPadrao(url, n),
  extrair(json, ctx) {
    return extrairJsonLd(json, {
      slug: slugDoHost(ctx.hostname),
      pagina: ctx.pagina,
      hostname: ctx.hostname,
    });
  },
};

export function acharDescriptor(hostname, { permitirGenerico = false } = {}) {
  const d = DESCRIPTORS.find((x) => x.hosts.some((h) => h.test(hostname)));
  if (d) return d;
  return permitirGenerico ? GENERICO : null;
}

export { slugDoHost };
