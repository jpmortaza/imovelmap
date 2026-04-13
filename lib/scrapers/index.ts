import { scrapeRedeGaucha } from "./redegaucha";
import { scrapeZap } from "./zapimoveis";
import { scrapeVivaReal } from "./vivareal";
import { scrapeImovelWeb } from "./imovelweb";
import { scrapeOlx } from "./olx";
import type { ImovelPayload } from "./types";

export type { ImovelPayload };
export type ScraperConfig = { maxItems?: number; [key: string]: unknown };

export const SCRAPERS: Record<string, {
  nome: string;
  fn: (config: ScraperConfig) => Promise<ImovelPayload[]>;
}> = {
  "rgi-poa": { nome: "Rede Gaucha (POA)", fn: scrapeRedeGaucha },
  "zap-poa": { nome: "ZAP Imoveis (POA)", fn: scrapeZap },
  "vr-poa": { nome: "VivaReal (POA)", fn: scrapeVivaReal },
  "iw-poa": { nome: "ImovelWeb (POA)", fn: scrapeImovelWeb },
  "olx-poa": { nome: "OLX Imoveis (POA)", fn: scrapeOlx },
};
