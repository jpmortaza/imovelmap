import type { ImovelPayload } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SEARCH_URL =
  "https://www.imovelweb.com.br/imoveis-venda-porto-alegre-rs.html";

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

function normalizeListing(
  listing: Record<string, unknown>,
): ImovelPayload | null {
  try {
    const id = String(
      listing.id ?? listing.postingId ?? listing.aviso_id ?? "",
    );
    if (!id) return null;

    const title =
      (listing.title as string | undefined) ??
      (listing.address as string | undefined) ??
      "";

    const rawPrice =
      listing.price ??
      (listing.priceOperationTypes as Record<string, unknown>[] | undefined)?.[0]?.price ??
      listing.prices ??
      null;
    const price = parsePrice(
      typeof rawPrice === "object" && rawPrice !== null
        ? (rawPrice as Record<string, unknown>).amount as string | number | undefined
        : (rawPrice as string | number | undefined),
    );

    const priceFormatted =
      price !== null
        ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : null;

    const mainFeatures = listing.mainFeatures as Record<string, unknown> | undefined;
    const features = listing.features as Record<string, unknown> | undefined;

    const area = Number(
      mainFeatures?.surface ??
      mainFeatures?.CFT100 ??
      features?.surface ??
      listing.floorPlan ??
      listing.surface ??
      0,
    ) || null;

    const bedrooms = Number(
      mainFeatures?.bedrooms ??
      mainFeatures?.CFT2 ??
      features?.bedrooms ??
      listing.bedrooms ??
      0,
    ) || null;

    const bathrooms = Number(
      mainFeatures?.bathrooms ??
      mainFeatures?.CFT3 ??
      features?.bathrooms ??
      listing.bathrooms ??
      0,
    ) || null;

    const parkingSpaces = Number(
      mainFeatures?.parkingSpaces ??
      mainFeatures?.CFT7 ??
      features?.parkingSpaces ??
      listing.parkingSpaces ??
      listing.garages ??
      0,
    ) || null;

    const postingLocation = listing.postingLocation as Record<string, unknown> | undefined;
    const address = postingLocation?.address as Record<string, unknown> | undefined;

    const lat = Number(
      postingLocation?.latitude ??
      (listing.geoLocation as Record<string, unknown> | undefined)?.latitude ??
      listing.latitude ??
      0,
    ) || null;

    const lng = Number(
      postingLocation?.longitude ??
      (listing.geoLocation as Record<string, unknown> | undefined)?.longitude ??
      listing.longitude ??
      0,
    ) || null;

    const neighborhood =
      (postingLocation?.neighborhood as string | undefined) ??
      (address?.neighborhood as string | undefined) ??
      (listing.neighborhood as string | undefined) ??
      null;

    const city =
      (postingLocation?.city as string | undefined) ??
      (address?.city as string | undefined) ??
      "Porto Alegre";

    const state =
      (postingLocation?.state as string | undefined) ??
      (address?.state as string | undefined) ??
      "Rio Grande do Sul";

    const permalink =
      (listing.url as string | undefined) ??
      (listing.permalink as string | undefined) ??
      "";
    const url = permalink.startsWith("http")
      ? permalink
      : `https://www.imovelweb.com.br${permalink || `/imovel/${id}`}`;

    const rawImages =
      (listing.pictures as Array<Record<string, unknown>> | undefined) ??
      (listing.images as Array<Record<string, unknown>> | undefined) ??
      [];
    const images: string[] = [];
    for (const img of rawImages) {
      const imgUrl =
        (img.url730x532 as string | undefined) ??
        (img.url360x266 as string | undefined) ??
        (img.original as string | undefined) ??
        (img.url as string | undefined) ??
        (img.src as string | undefined);
      if (imgUrl) images.push(imgUrl);
    }

    const propertyType =
      (listing.realEstateType as Record<string, unknown> | undefined)?.name as string | undefined ??
      (listing.propertyType as string | undefined) ??
      null;

    return {
      id: `iw-${id}`,
      source: "ImovelWeb",
      url,
      title,
      transactionType: "sale",
      propertyType,
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
        (postingLocation?.address as string | undefined) ??
        (address?.street as string | undefined) ??
        null,
      latitude: lat,
      longitude: lng,
      neighborhood,
      city,
      state,
      images,
      imageCount: images.length,
      publishedAt: (listing.publishDate as string | undefined) ?? null,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[ImovelWeb] Failed to normalize listing:", err);
    return null;
  }
}

async function tryJsonApi(maxItems: number): Promise<ImovelPayload[] | null> {
  try {
    const params = new URLSearchParams({
      pagina: "1",
      formato: "json",
      limite: String(Math.min(maxItems, 50)),
      operacao: "venta",
      ubicacion: "Porto-Alegre",
    });

    const url = `https://www.imovelweb.com.br/rplis-api/postings?${params.toString()}`;
    const res = await fetchWithRetry(url, {
      headers: {
        accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = (await res.json()) as Record<string, unknown>;
    const listings =
      (data.listPostings as Array<Record<string, unknown>> | undefined) ??
      (data.postings as Array<Record<string, unknown>> | undefined) ??
      (data.data as Array<Record<string, unknown>> | undefined);

    if (!listings || listings.length === 0) return null;

    const results: ImovelPayload[] = [];
    for (const listing of listings) {
      if (results.length >= maxItems) break;
      const normalized = normalizeListing(listing);
      if (normalized) results.push(normalized);
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function tryJsonUrl(maxItems: number): Promise<ImovelPayload[] | null> {
  try {
    const url = "https://www.imovelweb.com.br/imoveis-venda-porto-alegre.json";
    const res = await fetchWithRetry(url, {
      headers: {
        accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = (await res.json()) as Record<string, unknown>;
    const listings =
      (data.listPostings as Array<Record<string, unknown>> | undefined) ??
      (data.postings as Array<Record<string, unknown>> | undefined) ??
      (data.data as Array<Record<string, unknown>> | undefined);

    if (!listings || listings.length === 0) return null;

    const results: ImovelPayload[] = [];
    for (const listing of listings) {
      if (results.length >= maxItems) break;
      const normalized = normalizeListing(listing);
      if (normalized) results.push(normalized);
    }
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function tryNextData(maxItems: number): Promise<ImovelPayload[] | null> {
  try {
    const res = await fetchWithRetry(SEARCH_URL, {
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

    const listings =
      (pageProps.listPostings as Array<Record<string, unknown>> | undefined) ??
      (pageProps.listingsProps as Record<string, unknown> | undefined)
        ?.listPostings as Array<Record<string, unknown>> | undefined ??
      (pageProps.initialListPostings as Array<Record<string, unknown>> | undefined) ??
      (pageProps.postings as Array<Record<string, unknown>> | undefined);

    if (!listings || listings.length === 0) return null;

    const results: ImovelPayload[] = [];
    for (const listing of listings) {
      if (results.length >= maxItems) break;
      const normalized = normalizeListing(listing);
      if (normalized) results.push(normalized);
    }
    return results.length > 0 ? results : null;
  } catch (err) {
    console.warn("[ImovelWeb] __NEXT_DATA__ extraction failed:", err);
    return null;
  }
}

export async function scrapeImovelWeb(config: {
  maxItems?: number;
}): Promise<ImovelPayload[]> {
  const maxItems = config.maxItems ?? 100;

  console.log(`[ImovelWeb] Starting scrape (maxItems=${maxItems})...`);

  // Attempt 1: JSON API
  console.log("[ImovelWeb] Trying JSON API (rplis-api)...");
  let results = await tryJsonApi(maxItems);
  if (results) {
    console.log(`[ImovelWeb] JSON API returned ${results.length} properties`);
    return results;
  }

  // Attempt 2: JSON URL
  console.log("[ImovelWeb] Trying JSON URL fallback...");
  results = await tryJsonUrl(maxItems);
  if (results) {
    console.log(`[ImovelWeb] JSON URL returned ${results.length} properties`);
    return results;
  }

  // Attempt 3: HTML __NEXT_DATA__
  console.log("[ImovelWeb] Trying HTML __NEXT_DATA__ extraction...");
  results = await tryNextData(maxItems);
  if (results) {
    console.log(
      `[ImovelWeb] __NEXT_DATA__ returned ${results.length} properties`,
    );
    return results;
  }

  console.warn("[ImovelWeb] All approaches failed, returning empty array");
  return [];
}
