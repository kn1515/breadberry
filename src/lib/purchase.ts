import {
  billOfMaterials,
  catalog,
  resistanceOhms,
  type Circuit,
  type Kind,
} from "./circuit";

export type PurchasePart = ReturnType<typeof billOfMaterials>[number] & {
  id: string;
  query: string;
  note: string;
};
export type PurchaseOffer = {
  partNumber: string;
  manufacturerPartNumber: string;
  manufacturer: string;
  description: string;
  url: string;
  packaging: string;
  stock: number;
  minimum: number;
  maximum: number | null;
  prices: { quantity: number; unitPrice: number }[];
};
export type PurchaseSearch = {
  offers: PurchaseOffer[];
  sandbox: boolean;
  checkedAt?: string;
};
export const domesticStores = {
  akizuki: { name: "秋月電子通商", domain: "akizukidenshi.com" },
  sengoku: { name: "千石電商", domain: "sengoku.co.jp" },
  kyoritsu: { name: "共立エレショップ", domain: "eleshop.jp" },
  marutsu: { name: "マルツ", domain: "marutsu.co.jp" },
  amazon: { name: "Amazon.co.jp", domain: "amazon.co.jp" },
} as const;
export type DomesticStore = keyof typeof domesticStores;
export type RecommendedProduct = {
  store: DomesticStore | "digikey";
  name: string;
  url: string;
  /** Number of sale units (packs for a multipack). */
  quantity: number;
  unitsPerPack: number;
  totalPrice: number | null;
  reason: string;
  checks: string;
  stockEvidence: string;
  checkedAt: string;
};
// Only actual product pages on the five configured stores may be retrieved/linked.
export function storeProductUrl(
  store: DomesticStore,
  value: string,
): string | null {
  try {
    const url = new URL(value);
    const domain = domesticStores[store].domain;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      ![domain, `www.${domain}`].includes(url.hostname)
    )
      return null;
    const productPaths = {
      akizuki: /^\/catalog\/g\/g[\w-]+\/?$/,
      sengoku: /^\/mod\/sgk_cart\/detail\.php$/,
      kyoritsu: /^\/shop\/g\/g[\w-]+\/?$/,
      marutsu: /^\/pc\/i\/\d+\/?$/,
      amazon: /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i,
    };
    if (!productPaths[store].test(url.pathname)) return null;
    if (store === "sengoku" && !url.searchParams.get("code")) return null;
    if (store === "amazon")
      return `https://www.amazon.co.jp/dp/${url.pathname.match(productPaths.amazon)![1].toUpperCase()}`;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
// Avoid automatically ordering an industrial lot for a small breadboard circuit.
// Larger lots remain available for explicit manual selection.
export function maxAutomaticQuantity(requested: number) {
  return Math.max(10, requested * 3);
}
export type PurchaseRecommendation = {
  partNumber: string | null;
  reason: string;
  best: RecommendedProduct | null;
  searchSuggestions: string;
};
export type RecommendedPurchaseSearch = PurchaseSearch & {
  recommendation: PurchaseRecommendation;
};

export function purchaseParts(circuit: Circuit): PurchasePart[] {
  return billOfMaterials(circuit)
    .filter((p) => p.quantity > 0)
    .map((p, index) => {
      let query = `${p.name} ${p.value}`;
      if (p.kind === "board")
        query = circuit.board === "raspberry-pi" ? "Raspberry Pi 5" : p.name;
      if (p.kind === "breadboard") query = "solderless breadboard 400";
      if (p.kind === "wire") query = "jumper wires breadboard";
      if (p.kind === "led")
        query = `LED ${p.ledColor ?? "green"} through hole ${p.value}`;
      if (p.kind === "resistor") {
        const ohms = resistanceOhms(p.value);
        query = `resistor ${Number.isFinite(ohms) ? `${ohms} ohm` : p.value} axial through hole`;
      }
      const note =
        p.kind in catalog
          ? catalog[p.kind as Kind].note
          : p.kind === "wire"
            ? "必要数は配線の本数です。セット商品の入数と、オス・メス端子を確認して購入数量を調整してください。"
            : p.kind === "board"
              ? "基板の型番・ピン数・ヘッダーの有無を確認してください。"
              : "400穴・30列のブレッドボードを確認してください。";
      return { ...p, id: `bom-${index}`, query: query.slice(0, 200), note };
    });
}
export function orderQuantity(offer: PurchaseOffer, requested: number) {
  return Math.max(requested, offer.minimum);
}
export function canPurchase(offer: PurchaseOffer, quantity: number) {
  return (
    Number.isSafeInteger(quantity) &&
    quantity >= offer.minimum &&
    quantity <= 100000 &&
    quantity <= offer.stock &&
    (offer.maximum === null || quantity <= offer.maximum)
  );
}
export function unitPrice(
  offer: PurchaseOffer,
  quantity: number,
): number | null {
  return (
    [...offer.prices]
      .sort((a, b) => b.quantity - a.quantity)
      .find((p) => p.quantity <= quantity)?.unitPrice ?? null
  );
}
// Official FastAdd POST contract. Preserve the user's existing cart.
export const DIGIKEY_CART_ACTION =
  "https://www.digikey.com/classic/ordering/fastadd.aspx?newcart=false";
export function cartLines(lines: { offer: PurchaseOffer; quantity: number }[]) {
  const grouped = new Map<string, { offer: PurchaseOffer; quantity: number }>();
  for (const line of lines) {
    const old = grouped.get(line.offer.partNumber);
    grouped.set(line.offer.partNumber, {
      ...line,
      quantity: (old?.quantity ?? 0) + line.quantity,
    });
  }
  return [...grouped.values()];
}
