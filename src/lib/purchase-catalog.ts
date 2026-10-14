import { resistanceOhms, type Board, type Circuit, type Kind } from "./circuit";
import type { LedColor } from "./led";
import {
  storeProductUrl,
  storeSearchUrl,
  type DomesticStore,
  type PurchasePart,
} from "./purchase";

type Match =
  | { kind: "led"; color: LedColor }
  | { kind: "resistor"; ohms: number }
  | { kind: "board"; board: Board }
  | { kind: "breadboard" }
  // Without a value, any part of the kind matches (e.g. DHT22 labels vary).
  | { kind: Exclude<Kind, "led" | "resistor"> | "wire"; value?: string };

export type RegisteredProduct = {
  id: string;
  name: string;
  store: DomesticStore;
  url: string;
  match: Match;
  /** Identity/specification review date, NEVER evidence of current stock. */
  reviewedOn: string;
  enabled: boolean;
  /**
   * A store keyword search instead of a product page, for parts that no
   * verifiable store sells. Shown as a manual link only; never verified.
   */
  search?: boolean;
};

// Retrieval seeds only: verify live price, stock, pack size and compatibility.
export const purchaseCatalog: readonly RegisteredProduct[] = [
  {
    id: "akizuki-112117",
    name: "OSPG5111A · 5mm green LED",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g112117/",
    match: { kind: "led", color: "green" },
    reviewedOn: "2026-10-03",
    enabled: true,
  },
  {
    id: "akizuki-112605",
    name: "OSR5JA5E34B · 5mm red LED",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g112605/",
    match: { kind: "led", color: "red" },
    reviewedOn: "2026-10-03",
    enabled: true,
  },
  {
    id: "akizuki-116877",
    name: "MF25B10KBD · 10kΩ 1/4W ±0.1%",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g116877/",
    match: { kind: "resistor", ohms: 10000 },
    reviewedOn: "2026-10-03",
    enabled: true,
  },
  {
    id: "akizuki-125221",
    name: "カーボン抵抗 1/4W 220Ω · 100本入",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g125221/",
    match: { kind: "resistor", ohms: 220 },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-125331",
    name: "カーボン抵抗 1/4W 330Ω · 100本入",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g125331/",
    match: { kind: "resistor", ohms: 330 },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-125102",
    name: "カーボン抵抗 1/4W 1kΩ · 100本入",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g125102/",
    match: { kind: "resistor", ohms: 1000 },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-125103",
    name: "カーボン抵抗 1/4W 10kΩ · 100本入",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g125103/",
    match: { kind: "resistor", ohms: 10000 },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-107002",
    name: "AM2302 (DHT22) 温湿度センサー",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g107002/",
    match: { kind: "dht22" },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-130088",
    name: "ZYJ-W1 · ジャンパーワイヤ オス-オス 60本以上",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g130088/",
    match: { kind: "wire", value: "オス–オス" },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    id: "akizuki-102315",
    name: "ジャンパーワイヤ オス-オス 14種類×5本",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g102315/",
    match: { kind: "wire", value: "オス–オス" },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
  {
    // No domestic store sells the 30-pin DevKit V1, and Amazon product pages
    // cannot be retrieved for verification, so only a search can be offered.
    id: "amazon-search-esp32-devkit-v1-30pin",
    name: "ESP32 DevKit V1 30ピン ESP-WROOM-32",
    store: "amazon",
    url: "https://www.amazon.co.jp/s?k=ESP32+DevKit+V1+30%E3%83%94%E3%83%B3+ESP-WROOM-32",
    match: { kind: "board", board: "esp32" },
    reviewedOn: "2026-10-15",
    enabled: true,
    search: true,
  },
  {
    id: "akizuki-100315",
    name: "EIC-801",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g100315/",
    match: { kind: "breadboard" },
    reviewedOn: "2026-10-03",
    enabled: true,
  },
  {
    id: "akizuki-105294",
    name: "BB-801",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g105294/",
    match: { kind: "breadboard" },
    reviewedOn: "2026-10-03",
    enabled: true,
  },
  {
    id: "akizuki-131019",
    name: "M154-240240-RGB · ST7789 1.54-inch 240×240 TFT LCD",
    store: "akizuki",
    url: "https://akizukidenshi.com/catalog/g/g131019/",
    match: { kind: "st7789", value: "M154-240240-RGB" },
    reviewedOn: "2026-10-15",
    enabled: true,
  },
];

/** Free-text queries cannot override the circuit's hard specification filters. */
export function registeredCandidates(
  part: PurchasePart,
  circuit: Circuit,
  entries: readonly RegisteredProduct[] = purchaseCatalog,
): RegisteredProduct[] {
  const urls = new Set<string>();
  return entries
    .filter((entry) => {
      if (!entry.enabled || entry.match.kind !== part.kind) return false;
      const match = entry.match;
      if (match.kind === "led" && match.color !== part.ledColor) return false;
      if (
        match.kind === "resistor" &&
        match.ohms !== resistanceOhms(part.value)
      )
        return false;
      if (match.kind === "board" && match.board !== circuit.board) return false;
      if ("value" in match && match.value && match.value !== part.value)
        return false;
      const url = entry.search
        ? storeSearchUrl(entry.store, entry.url)
        : storeProductUrl(entry.store, entry.url);
      if (!url || urls.has(url)) return false;
      urls.add(url);
      return true;
    })
    .slice(0, 3);
}
