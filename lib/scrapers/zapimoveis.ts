import type { ImovelPayload } from "./types";

const BASE_URL = "https://glue-api.zapimoveis.com.br/v2/listings";
const DOMAIN = "www.zapimoveis.com.br";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_PARAMS: Record<string, string> = {
  addressCity: "Porto Alegre",
  addressState: "Rio Grande do Sul",
  addressLocationId: "BR>Rio Grande do Sul>NULL>Porto Alegre",
  listingType: "USED",
  size: "24",
};

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

function normalizeListing(
  listing: Record<string, unknown>,
  business: string,
): ImovelPayload | null {
  try {
    const id = String(listing.id ?? "");
    const title = (listing.title as string | undefined) ?? "";
    const address = listing.address as Record<string, unknown> | undefined;
    const point = address?.point as Record<string, unknown> | undefined;

    const pricingInfos = listing.pricingInfos as Array<Record<string, unknown>> | undefined;
    const pricing = pricingInfos?.[0];
    const rawPrice = pricing?.price;
    const price = rawPrice ? Number(rawPrice) : null;

    const usableAreas = listing.usableAreas as number[] | undefined;
    const area = usableAreas?.[0] ?? null;

    const bedroomsArr = listing.bedrooms as number[] | undefined;
    const bathroomsArr = listing.bathrooms as number[] | undefined;
    const parkingArr = listing.parkingSpaces as number[] | undefined;

    const imagesRaw = listing.images as Array<Record<string, unknown>> | undefined;
    const images: string[] = [];
    if (Array.isArray(imagesRaw)) {
      for (const img of imagesRaw) {
        const imgUrl = (img.url as string | undefined) ?? (img.src as string | undefined);
        if (imgUrl) images.push(imgUrl);
      }
    }

    const transactionType: "sale" | "rent" | null =
      business === "SALE" ? "sale" : business === "RENTAL" ? "rent" : null;

    const priceFormatted =
      price !== null
        ? `R$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : null;

    const condoFee = pricing?.monthlyCondoFee
      ? Number(pricing.monthlyCondoFee)
      : null;
    const iptu = pricing?.yearlyIptu ? Number(pricing.yearlyIptu) : null;

    return {
      id: `zap-${id}`,
      source: "ZAP Imoveis",
      url: `https://www.zapimoveis.com.br/imovel/${id}`,
      title,
      transactionType,
      propertyType: (listing.unitTypes as string[] | undefined)?.[0] ?? null,
      propertySubType: null,
      price,
      priceFormatted,
      condominiumFee: condoFee,
      iptu,
      pricePerSqm:
        price && area ? Math.round((price / area) * 100) / 100 : null,
      area,
      bedrooms: bedroomsArr?.[0] ?? null,
      bathrooms: bathroomsArr?.[0] ?? null,
      parkingSpaces: parkingArr?.[0] ?? null,
      endereco: (address?.street as string | undefined) ?? null,
      enderecoNumero: (address?.streetNumber as string | undefined) ?? null,
      cep: (address?.zipCode as string | undefined) ?? null,
      latitude: point?.lat != null ? Number(point.lat) : null,
      longitude: point?.lon != null ? Number(point.lon) : null,
      neighborhood: (address?.neighborhood as string | undefined) ?? null,
      city: (address?.city as string | undefined) ?? null,
      state: (address?.state as string | undefined) ?? null,
      images,
      imageCount: images.length,
      publishedAt: (listing.createdAt as string | undefined) ?? null,
      scrapedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[ZAP] Failed to normalize listing:", err);
    return null;
  }
}

export async function scrapeZap(config: {
  maxItems?: number;
  business?: string;
}): Promise<ImovelPayload[]> {
  const maxItems = config.maxItems ?? 100;
  const business = config.business ?? "SALE";
  const pageSize = 24;
  const results: ImovelPayload[] = [];

  let page = 1;

  console.log(`[ZAP] Starting scrape (business=${business}, maxItems=${maxItems})...`);

  while (results.length < maxItems) {
    const params = new URLSearchParams({
      ...DEFAULT_PARAMS,
      business,
      page: String(page),
      size: String(pageSize),
    });

    const url = `${BASE_URL}?${params.toString()}`;

    try {
      const res = await fetchWithRetry(url, {
        headers: {
          "x-domain": DOMAIN,
          accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });

      const data = (await res.json()) as Record<string, unknown>;
      const search = data.search as Record<string, unknown> | undefined;
      const result = search?.result as Record<string, unknown> | undefined;
      const listings = result?.listings as Array<Record<string, unknown>> | undefined;

      if (!listings || listings.length === 0) {
        console.log(`[ZAP] No more listings at page ${page}`);
        break;
      }

      for (const entry of listings) {
        if (results.length >= maxItems) break;
        const listing = entry.listing as Record<string, unknown> | undefined;
        if (!listing) continue;
        const normalized = normalizeListing(listing, business);
        if (normalized) results.push(normalized);
      }

      console.log(`[ZAP] Page ${page}: ${listings.length} listings (total: ${results.length})`);

      if (listings.length < pageSize) break;
      page++;
    } catch (err) {
      console.warn(`[ZAP] Failed at page ${page}:`, err);
      break;
    }
  }

  console.log(`[ZAP] Scraped ${results.length} properties`);
  return results;
}
