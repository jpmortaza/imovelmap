import type { ImovelPayload } from "./types";

const SITEMAP_URLS = [
  "https://www.redegauchadeimoveis.com.br/sitemap-imoveis.xml",
  "https://www.redegauchadeimoveis.com.br/sitemap-imoveis-2.xml",
  "https://www.redegauchadeimoveis.com.br/sitemap-imoveis-3.xml",
];

const USER_AGENT =
  "Mozilla/5.0 (compatible; ImovelMapBot/1.0; +https://imovelmap.com)";

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": USER_AGENT,
          ...(init?.headers ?? {}),
        },
      });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchSitemapUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (const sitemapUrl of SITEMAP_URLS) {
    try {
      const res = await fetchWithRetry(sitemapUrl);
      const xml = await res.text();
      const locRegex = /<loc>(.*?)<\/loc>/g;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(xml)) !== null) {
        const loc = match[1].trim();
        if (loc.includes("/imovel/")) {
          urls.push(loc);
        }
      }
    } catch (err) {
      console.warn(`Failed to fetch sitemap ${sitemapUrl}:`, err);
    }
  }
  return urls;
}

/**
 * Extract RSC chunks from Next.js HTML.
 * Looks for: self.__next_f.push([1,"..."])
 */
function extractRscChunks(html: string): string {
  const chunks: string[] = [];
  const regex = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      // Use JSON.parse to correctly handle all escape sequences (\xHH, \uXXXX, etc.)
      chunks.push(JSON.parse(`"${match[1]}"`));
    } catch {
      // skip malformed chunk
    }
  }
  return chunks.join("");
}

/**
 * Scan balanced JSON from s[start]. Returns index AFTER the closing bracket.
 */
function scanJsonEnd(s: string, start: number): number {
  const first = s[start];
  if (first === '"') {
    let j = start + 1;
    let esc = false;
    for (; j < s.length; j++) {
      if (esc) { esc = false; continue; }
      if (s[j] === '\\') { esc = true; continue; }
      if (s[j] === '"') return j + 1;
    }
    return -1;
  }
  if (first !== '{' && first !== '[') return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Parse RSC definitions from concatenated stream.
 * Format: `<hex>:<json>` blocks concatenated together.
 */
function parseRscDefinitions(stream: string): Map<string, unknown> {
  const defs = new Map<string, unknown>();
  const headerRe = /([0-9a-f]+):/g;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(stream)) !== null) {
    const start = m.index + m[0].length;
    if (start >= stream.length) break;
    const ch = stream[start];
    if (ch !== '{' && ch !== '[' && ch !== '"') continue;
    const end = scanJsonEnd(stream, start);
    if (end < 0) continue;
    const raw = stream.slice(start, end);
    try {
      defs.set(m[1], JSON.parse(raw));
      headerRe.lastIndex = end;
    } catch {
      continue;
    }
  }
  return defs;
}

/**
 * Resolve $NN references recursively.
 * In RSC payloads, "$NN" (where NN is hex) refers to another definition.
 */
function resolveRefs(
  value: unknown,
  defs: Map<string, unknown>,
  seen = new Set<string>(),
): unknown {
  if (typeof value === "string") {
    const refMatch = value.match(/^\$([0-9a-fA-F]+)$/);
    if (refMatch) {
      const refId = refMatch[1];
      if (seen.has(refId)) return value;
      seen.add(refId);
      const resolved = defs.get(refId);
      if (resolved !== undefined) {
        return resolveRefs(resolved, defs, seen);
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveRefs(v, defs, new Set(seen)));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveRefs(v, defs, new Set(seen));
    }
    return out;
  }
  return value;
}

/**
 * Find the property object in the resolved definitions.
 * It should have keys: code, address, contracts, bedrooms.
 */
function findPropertyObject(
  defs: Map<string, unknown>,
): Record<string, unknown> | null {
  for (const [id, value] of defs) {
    const resolved = resolveRefs(value, defs);
    if (isPropertyObject(resolved)) {
      return resolved as Record<string, unknown>;
    }
    // Also search inside arrays
    if (Array.isArray(resolved)) {
      for (const item of resolved) {
        if (isPropertyObject(item)) {
          return item as Record<string, unknown>;
        }
      }
    }
  }
  return null;
}

function isPropertyObject(val: unknown): boolean {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const obj = val as Record<string, unknown>;
  return (
    "code" in obj &&
    "address" in obj &&
    "contracts" in obj &&
    "bedrooms" in obj
  );
}

function normalizeProperty(
  prop: Record<string, unknown>,
  sourceUrl: string,
): ImovelPayload | null {
  try {
    const code = String(prop.code ?? "");
    const contracts = prop.contracts as Array<Record<string, unknown>> | undefined;
    const contract = contracts?.[0] as Record<string, unknown> | undefined;
    const priceObj = contract?.price as Record<string, unknown> | undefined;
    const rawPrice = priceObj?.value;
    const price =
      typeof rawPrice === "number" ? rawPrice / 100 : null;

    const contractId = contract?.id;
    let transactionType: "sale" | "rent" | null = null;
    if (contractId === 1) transactionType = "sale";
    else if (contractId === 2) transactionType = "rent";

    const address = prop.address as Record<string, unknown> | undefined;
    const coordinate = address?.coordinate as Record<string, unknown> | undefined;

    const privateArea = prop.privateArea as Record<string, unknown> | undefined;
    const usefulArea = prop.usefulArea as Record<string, unknown> | undefined;
    const totalArea = prop.totalArea as Record<string, unknown> | undefined;
    const area =
      (privateArea?.value as number | undefined) ??
      (usefulArea?.value as number | undefined) ??
      (totalArea?.value as number | undefined) ??
      null;

    const imagesRaw = prop.images as Array<Record<string, unknown>> | undefined;
    const images: string[] = [];
    if (Array.isArray(imagesRaw)) {
      for (const img of imagesRaw) {
        const imgUrl =
          (img.src as string | undefined) ??
          (img.url as string | undefined) ??
          (img.image as string | undefined);
        if (imgUrl) images.push(imgUrl);
      }
    }

    const priceFormatted =
      price !== null
        ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : null;

    const title =
      (prop.title as string | undefined) ??
      (prop.heading as string | undefined) ??
      `Imovel ${code}`;

    const propertyType =
      (prop.type as Record<string, unknown>)?.name as string | undefined ??
      (prop.propertyType as string | undefined) ??
      null;

    const propertySubType =
      (prop.subType as Record<string, unknown>)?.name as string | undefined ??
      null;

    const condominiumFeeObj = prop.condominiumFee as Record<string, unknown> | undefined;
    const condominiumFee =
      typeof condominiumFeeObj?.value === "number"
        ? condominiumFeeObj.value / 100
        : null;

    const iptuObj = prop.iptu as Record<string, unknown> | undefined;
    const iptu =
      typeof iptuObj?.value === "number" ? iptuObj.value / 100 : null;

    return {
      id: `rgi-${code}`,
      source: "Rede Gaucha de Imoveis",
      url: sourceUrl,
      title,
      transactionType,
      propertyType,
      propertySubType,
      price,
      priceFormatted,
      condominiumFee,
      iptu,
      pricePerSqm: price && area ? Math.round((price / area) * 100) / 100 : null,
      area,
      bedrooms: (prop.bedrooms as number | undefined) ?? null,
      bathrooms: (prop.bathrooms as number | undefined) ?? null,
      parkingSpaces: (prop.parkingSpaces as number | undefined) ?? null,
      endereco: (address?.street as string | undefined) ?? null,
      enderecoNumero: (address?.number as string | undefined) ?? null,
      complemento: (address?.complement as string | undefined) ?? null,
      cep: (address?.zipCode as string | undefined) ?? null,
      latitude: (coordinate?.latitude as number | undefined) ?? null,
      longitude: (coordinate?.longitude as number | undefined) ?? null,
      neighborhood: (address?.neighborhood as string | undefined) ?? null,
      city: (address?.city as string | undefined) ?? null,
      state: (address?.state as string | undefined) ?? null,
      images,
      imageCount: images.length,
      publishedAt: (prop.publishedAt as string | undefined) ?? null,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`Failed to normalize property from ${sourceUrl}:`, err);
    return null;
  }
}

async function scrapePropertyPage(
  url: string,
): Promise<ImovelPayload | null> {
  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const rscPayload = extractRscChunks(html);
    if (!rscPayload) return null;

    const defs = parseRscDefinitions(rscPayload);
    if (defs.size === 0) return null;

    const prop = findPropertyObject(defs);
    if (!prop) return null;

    return normalizeProperty(prop, url);
  } catch (err) {
    console.warn(`Failed to scrape ${url}:`, err);
    return null;
  }
}

/**
 * Run tasks with limited concurrency.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const currentIdx = idx++;
      results[currentIdx] = await tasks[currentIdx]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function scrapeRedeGaucha(config: {
  maxItems?: number;
  concurrency?: number;
}): Promise<ImovelPayload[]> {
  const maxItems = config.maxItems ?? 30;
  const concurrency = config.concurrency ?? 4;

  console.log("[RedeGaucha] Fetching sitemaps...");
  const allUrls = await fetchSitemapUrls();
  console.log(`[RedeGaucha] Found ${allUrls.length} property URLs in sitemaps`);

  const urls = allUrls.slice(0, maxItems);
  console.log(`[RedeGaucha] Scraping ${urls.length} properties (concurrency=${concurrency})...`);

  const tasks = urls.map((url) => () => scrapePropertyPage(url));
  const results = await runWithConcurrency(tasks, concurrency);

  const properties = results.filter(
    (r): r is ImovelPayload => r !== null,
  );
  console.log(
    `[RedeGaucha] Successfully scraped ${properties.length}/${urls.length} properties`,
  );

  return properties;
}
