import { resistanceOhms, type Board, type Circuit, type Kind } from "./circuit";
import type { LedColor } from "./led";
import {
  storeProductUrl,
  type DomesticStore,
  type PurchasePart,
} from "./purchase";

type Match =
  | { kind: "led"; color: LedColor }
  | { kind: "resistor"; ohms: number }
  | { kind: "board"; board: Board }
  | { kind: "breadboard" }
  | { kind: Exclude<Kind, "led" | "resistor"> | "wire"; value: string };

export type RegisteredProduct = {
  id: string;
  name: string;
  store: DomesticStore;
  url: string;
  match: Match;
  /** Identity/specification review date, NEVER evidence of current stock. */
  reviewedOn: string;
  enabled: boolean;
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
      if ("value" in match && match.value !== part.value) return false;
      const url = storeProductUrl(entry.store, entry.url);
      if (!url || urls.has(url)) return false;
      urls.add(url);
      return true;
    })
    .slice(0, 3);
}
