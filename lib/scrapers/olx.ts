import type { ImovelPayload } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SEARCH_PAGE_URL =
  "https://rs.olx.com.br/regiao-de-porto-alegre-e-novo-hamburgo/imoveis/venda";

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 3,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
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

function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function getProperty(
  properties: Array<Record<string, unknown>> | undefined,
  name: string,
): string | null {
  if (!Array.isArray(properties)) return null;
  const prop = properties.find(
    (p) =>
      (p.name as string)?.toLowerCase() === name.toLowerCase() ||
      (p.label as string)?.toLowerCase() === name.toLowerCase(),
  );
  return prop ? String(prop.value ?? "") : null;
}

function normalizeListing(
  ad: Record<string, unknown>,
): ImovelPayload | null {
  try {
    const id = String(ad.listId ?? ad.id ?? ad.adId ?? "");
    if (!id) return null;

    const title = (ad.subject as string | undefined) ?? (ad.title as string | undefined) ?? "";

    const rawPrice =
      ad.price ??
      (ad.priceLabel as string | undefined) ??
      null;
    const price = parsePrice(rawPrice as string | number | undefined);

    const priceFormatted =
      price !== null
        ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : null;

    const location = ad.location as Record<string, unknown> | undefined;
    const neighborhood =
      (location?.neighbourhood as string | undefined) ??
      (location?.neighborhood as string | undefined) ??
      null;
    const city =
      (location?.municipality as string | undefined) ??
      (location?.city as string | undefined) ??
      "Porto Alegre";
    const state =
      (location?.uf as string | undefined) ??
      (location?.state as string | undefined) ??
      "RS";

    const lat = Number(
      (location?.mapLati as string | number | undefined) ??
      location?.latitude ??
      0,
    ) || null;
    const lng = Number(
      (location?.mapLong as string | number | undefined) ??
      location?.longitude ??
      0,
    ) || null;

    const properties = ad.properties as Array<Record<string, unknown>> | undefined;

    const areaRaw = getProperty(properties, "size") ?? getProperty(properties, "area_util");
    const area = areaRaw ? (Number(areaRaw.replace(/[^\d]/g, "")) || null) : null;

    const bedroomsRaw = getProperty(properties, "rooms") ?? getProperty(properties, "bedrooms");
    const bedrooms = bedroomsRaw ? (Number(bedroomsRaw) || null) : null;

    const bathroomsRaw = getProperty(properties, "bathrooms");
    const bathrooms = bathroomsRaw ? (Number(bathroomsRaw) || null) : null;

    const parkingRaw = getProperty(properties, "garage_spaces") ?? getProperty(properties, "parking_spaces");
    const parkingSpaces = parkingRaw ? (Number(parkingRaw) || null) : null;

    const rawImages = ad.images as Array<Record<string, unknown>> | string[] | undefined;
    const images: string[] = [];
    if (Array.isArray(rawImages)) {
      for (const img of rawImages) {
        if (typeof img === "string") {
          images.push(img);
        } else {
          const imgUrl =
            (img.original as string | undefined) ??
            (img.thumbnail as string | undefined) ??
            (img.url as string | undefined);
          if (imgUrl) images.push(imgUrl);
        }
      }
    }

    // Thumbnails might be in a separate field
    const thumbnails = ad.thumbnail as string | undefined;
    if (thumbnails && images.length === 0) {
      images.push(thumbnails);
    }

    const permalink =
      (ad.url as string | undefined) ??
      (ad.permalink as string | undefined) ??
      "";
    const url = permalink.startsWith("http")
      ? permalink
      : `https://www.olx.com.br${permalink || `/imovel/${id}`}`;

    const category =
      (ad.category as string | undefined) ??
      (ad.categoryName as string | undefined) ??
      null;

    return {
      id: `olx-${id}`,
      source: "OLX Imoveis",
      url,
      title,
      transactionType: "sale",
      propertyType: category,
      propertySubType: null,
      price,
      priceFormatted,
      condominiumFee: null,
      iptu: null,
      pricePerSqm:
        price && area ? Math.round((price / area) * 100) / 100 : null,
      area,
      bedrooms,
      bathrooms,
      parkingSpaces,
      endereco:
        (location?.address as string | undefined) ??
        (location?.street as string | undefined) ??
        null,
      latitude: lat,
      longitude: lng,
      neighborhood,
      city,
      state,
      images,
      imageCount: images.length,
      publishedAt: (ad.listTime as string | undefined) ?? (ad.date as string | undefined) ?? null,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[OLX] Failed to normalize listing:", err);
    return null;
  }
}

async function trySearchApi(maxItems: number): Promise<ImovelPayload[] | null> {
  try {
    const results: ImovelPayload[] = [];
    let offset = 0;
    const limit = Math.min(maxItems, 50);

    while (results.length < maxItems) {
      const params = new URLSearchParams({
        category: "1020",
        region: "10",
        state: "12",
        o: String(Math.floor(offset / limit) + 1),
        limit: String(limit),
      });

      const url = `https://www.olx.com.br/autos/api/v2/search?${params.toString()}`;
      const res = await fetchWithRetry(url, {
        headers: {
          accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      const data = (await res.json()) as Record<string, unknown>;
      const ads =
        (data.ads as Array<Record<string, unknown>> | undefined) ??
        (data.data as Array<Record<string, unknown>> | undefined);

      if (!ads || ads.length === 0) break;

      for (const ad of ads) {
        if (results.length >= maxItems) break;
        const normalized = normalizeListing(ad);
        if (normalized) results.push(normalized);
      }

      if (ads.length < limit) break;
      offset += limit;
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function tryNextData(maxItems: number): Promise<ImovelPayload[] | null> {
  try {
    const res = await fetchWithRetry(SEARCH_PAGE_URL, {
      headers: {
        accept: "text/html",
        "User-Agent": USER_AGENT,
      },
    });

    const html = await res.text();
    const match = html.match(
      /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (!match?.[1]) return null;

    const nextData = JSON.parse(match[1]) as Record<string, unknown>;
    const pageProps = (nextData.props as Record<string, unknown>)
      ?.pageProps as Record<string, unknown> | undefined;
    if (!pageProps) return null;

    const searchProps = pageProps.searchProps as Record<string, unknown> | undefined;
    const ads =
      (searchProps?.adList as Array<Record<string, unknown>> | undefined) ??
      (pageProps.adList as Array<Record<string, unknown>> | undefined) ??
      (pageProps.ads as Array<Record<string, unknown>> | undefined) ??
      (searchProps?.ads as Array<Record<string, unknown>> | undefined);

    if (!ads || ads.length === 0) return null;

    const results: ImovelPayload[] = [];
    for (const ad of ads) {
      if (results.length >= maxItems) break;
      const normalized = normalizeListing(ad);
      if (normalized) results.push(normalized);
    }
    return results.length > 0 ? results : null;
  } catch (err) {
    console.warn("[OLX] __NEXT_DATA__ extraction failed:", err);
    return null;
  }
}

export async function scrapeOlx(config: {
  maxItems?: number;
}): Promise<ImovelPayload[]> {
  const maxItems = config.maxItems ?? 100;

  console.log(`[OLX] Starting scrape (maxItems=${maxItems})...`);

  // Attempt 1: Public search API
  console.log("[OLX] Trying search API...");
  let results = await trySearchApi(maxItems);
  if (results) {
    console.log(`[OLX] Search API returned ${results.length} properties`);
    return results;
  }

  // Attempt 2: HTML __NEXT_DATA__
  console.log("[OLX] Trying HTML __NEXT_DATA__ extraction...");
  results = await tryNextData(maxItems);
  if (results) {
    console.log(`[OLX] __NEXT_DATA__ returned ${results.length} properties`);
    return results;
  }

  console.warn("[OLX] All approaches failed, returning empty array");
  return [];
}
