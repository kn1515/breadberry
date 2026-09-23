import { z } from "zod";
import { ServiceError } from "./ai";
import { abortable } from "./async";
import type { PurchaseOffer, PurchaseSearch } from "./purchase";

const priceSchema = z.object({
  BreakQuantity: z.number().int().positive(),
  UnitPrice: z.number().nonnegative(),
});
const productSchema = z.object({
  Manufacturer: z.object({ Name: z.string() }).optional(),
  ManufacturerProductNumber: z.string(),
  Description: z.object({
    ProductDescription: z.string(),
    DetailedDescription: z.string().optional(),
  }),
  ProductUrl: z.string(),
  Discontinued: z.boolean().optional(),
  ProductVariations: z.array(
    z.object({
      DigiKeyProductNumber: z.string().min(1).max(120),
      PackageType: z.object({ Name: z.string() }).optional(),
      QuantityAvailableforPackageType: z.number().int().nonnegative(),
      MinimumOrderQuantity: z.number().int().positive(),
      MaxQuantityForDistribution: z.number().int().nonnegative().optional(),
      StandardPricing: z.array(priceSchema).optional(),
      DigiReelFee: z.number().optional(),
    }),
  ),
});
const searchSchema = z.object({
  Products: z.array(z.unknown()),
  ExactMatches: z.array(z.unknown()).optional(),
  SearchLocaleUsed: z.object({ Currency: z.string() }).optional(),
});

export function normalizeOffers(input: unknown): PurchaseOffer[] {
  const parsed = searchSchema.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.SearchLocaleUsed &&
      parsed.data.SearchLocaleUsed.Currency !== "JPY")
  )
    throw new ServiceError(
      "DigiKeyの商品情報・通貨を確認できませんでした。再検索してください。",
      502,
    );
  const offers = new Map<string, PurchaseOffer>();
  for (const raw of [
    ...(parsed.data.ExactMatches ?? []),
    ...parsed.data.Products,
  ]) {
    const result = productSchema.safeParse(raw);
    if (!result.success) continue;
    const p = result.data;
    if (p.Discontinued) continue;
    let url: URL;
    try {
      url = new URL(p.ProductUrl);
    } catch {
      continue;
    }
    if (
      url.protocol !== "https:" ||
      !["www.digikey.jp", "www.digikey.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      continue;
    for (const v of p.ProductVariations) {
      // Digi-Reel adds a separate fee; offer ordinary packaging only.
      if (v.DigiReelFee && v.DigiReelFee > 0) continue;
      offers.set(v.DigiKeyProductNumber, {
        partNumber: v.DigiKeyProductNumber,
        manufacturerPartNumber: p.ManufacturerProductNumber,
        manufacturer: p.Manufacturer?.Name ?? "",
        description:
          p.Description.DetailedDescription || p.Description.ProductDescription,
        url: url.href,
        packaging: v.PackageType?.Name ?? "",
        stock: v.QuantityAvailableforPackageType,
        minimum: v.MinimumOrderQuantity,
        maximum:
          v.MaxQuantityForDistribution && v.MaxQuantityForDistribution > 0
            ? v.MaxQuantityForDistribution
            : null,
        prices: (v.StandardPricing ?? []).map((b) => ({
          quantity: b.BreakQuantity,
          unitPrice: b.UnitPrice,
        })),
      });
    }
  }
  return [...offers.values()].slice(0, 30);
}

export function digiKeyConfigured() {
  return !!(process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET);
}
type Credentials = {
  id: string;
  secret: string;
  base: string;
  sandbox: boolean;
};
function credentials(): Credentials {
  if (!digiKeyConfigured())
    throw new ServiceError(
      "DigiKeyの商品検索は準備中です。管理者に連携設定を依頼してください。",
      503,
    );
  const sandbox = process.env.DIGIKEY_SANDBOX === "true";
  return {
    id: process.env.DIGIKEY_CLIENT_ID!,
    secret: process.env.DIGIKEY_CLIENT_SECRET!,
    sandbox,
    base: sandbox
      ? "https://sandbox-api.digikey.com"
      : "https://api.digikey.com",
  };
}
async function request(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch {
    init.signal?.throwIfAborted();
    throw new ServiceError(
      "DigiKeyに接続できませんでした。時間をおいて再検索してください。",
      504,
    );
  }
}
function failure(status: number): never {
  if (status === 429)
    throw new ServiceError(
      "DigiKeyの検索上限に達しました。時間をおいて再検索してください。",
      429,
    );
  if (status === 401 || status === 403)
    throw new ServiceError(
      "DigiKeyの認証に失敗しました。管理者に連携設定の確認を依頼してください。",
      502,
    );
  throw new ServiceError(
    "DigiKeyの商品検索に失敗しました。時間をおいて再検索してください。",
    502,
  );
}
async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ServiceError("DigiKeyから不正な応答が返されました。", 502);
  }
}
// Instance-local, bounded caches. No tokens or provider payloads are logged or sent to clients.
let token: { key: string; value: string; expires: number } | undefined;
let pendingToken: { key: string; promise: Promise<string> } | undefined;
async function accessToken(c: Credentials) {
  const key = `${c.base}:${c.id}:${c.secret}`;
  if (token?.key === key && token.expires > Date.now()) return token.value;
  if (pendingToken?.key === key) return pendingToken.promise;
  const promise = (async () => {
    const response = await request(`${c.base}/v1/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: c.id,
        client_secret: c.secret,
        grant_type: "client_credentials",
      }),
    });
    if (!response.ok) failure(response.status);
    const parsed = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(await json(response));
    if (!parsed.success)
      throw new ServiceError("DigiKeyの認証応答が不正です。", 502);
    token = {
      key,
      value: parsed.data.access_token,
      expires: Date.now() + Math.max(0, parsed.data.expires_in - 30) * 1000,
    };
    return token.value;
  })();
  pendingToken = { key, promise };
  try {
    return await promise;
  } finally {
    if (pendingToken?.promise === promise) pendingToken = undefined;
  }
}
const cache = new Map<string, { expires: number; result: PurchaseSearch }>();
export async function searchDigiKey(
  query: string,
  takeQuota: () => Promise<void>,
  signal?: AbortSignal,
): Promise<PurchaseSearch> {
  signal?.throwIfAborted();
  const c = credentials();
  const key = `${c.base}:${c.id}:${query}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  for (let attempt = 0; attempt < 2; attempt++) {
    const bearer = signal
      ? await abortable(() => accessToken(c), signal)
      : await accessToken(c);
    signal?.throwIfAborted();
    await takeQuota();
    signal?.throwIfAborted();
    const response = await request(`${c.base}/products/v4/search/keyword`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "X-DIGIKEY-Client-Id": c.id,
        "X-DIGIKEY-Locale-Site": "JP",
        "X-DIGIKEY-Locale-Language": "ja",
        "X-DIGIKEY-Locale-Currency": "JPY",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Keywords: query, Limit: 10, Offset: 0 }),
    });
    if (response.status === 401 && attempt === 0) {
      if (token?.value === bearer) token = undefined;
      continue;
    }
    if (!response.ok) failure(response.status);
    const result = {
      offers: normalizeOffers(await json(response)),
      sandbox: c.sandbox,
      checkedAt: new Date().toISOString(),
    };
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + 5 * 60000 });
    return result;
  }
  return failure(401);
}
