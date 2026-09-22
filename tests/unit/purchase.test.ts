import test from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  canPurchase,
  cartLines,
  orderQuantity,
  purchaseParts,
  unitPrice,
} from "../../src/lib/purchase";
import { normalizeOffers, searchDigiKey } from "../../src/lib/digikey";

const product = {
  Manufacturer: { Name: "Test manufacturer" },
  ManufacturerProductNumber: "TEST-LED",
  Description: {
    ProductDescription: "LED",
    DetailedDescription: "Green through-hole LED",
  },
  ProductUrl: "https://www.digikey.jp/ja/products/detail/test/1",
  ProductVariations: [
    {
      DigiKeyProductNumber: "TEST-LED-ND",
      PackageType: { Name: "Bulk" },
      QuantityAvailableforPackageType: 12,
      MinimumOrderQuantity: 5,
      MaxQuantityForDistribution: 10,
      StandardPricing: [
        { BreakQuantity: 1, UnitPrice: 20 },
        { BreakQuantity: 10, UnitPrice: 15 },
      ],
    },
  ],
};
const payload = {
  Products: [product],
  ExactMatches: [product],
  SearchLocaleUsed: { Currency: "JPY" },
};

test("BOM keeps LED colors, resistor values, board and supplies; no zero wires", () => {
  const circuit = demoCircuit("esp32", "led");
  circuit.parts[0] = { ...circuit.parts[0], value: "5mm", ledColor: "red" };
  circuit.parts.push({ ...circuit.parts[0], id: "D2", ledColor: "blue" });
  circuit.parts.find((p) => p.kind === "resistor")!.value = "4.7kΩ";
  const parts = purchaseParts(circuit);
  assert.match(parts.find((p) => p.ledColor === "red")!.query, /red/);
  assert.match(parts.find((p) => p.ledColor === "blue")!.query, /blue/);
  assert.match(parts.find((p) => p.kind === "resistor")!.query, /4700 ohm/);
  assert.equal(
    parts.find((p) => p.kind === "wire")!.quantity,
    circuit.wires.length,
  );
  assert.ok(parts.find((p) => p.kind === "board"));
  assert.ok(parts.find((p) => p.kind === "breadboard"));
  circuit.wires = [];
  assert.ok(!purchaseParts(circuit).find((p) => p.kind === "wire"));
});

test("normalization uses packaging stock, rejects unsafe URLs/currency, deduplicates exact matches", () => {
  const offers = normalizeOffers(payload);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].stock, 12);
  assert.equal(offers[0].minimum, 5);
  assert.equal(offers[0].maximum, 10);
  for (const url of [
    "javascript:alert(1)",
    "https://www.digikey.jp.evil.test/",
    "https://user@www.digikey.jp/",
  ])
    assert.deepEqual(
      normalizeOffers({ Products: [{ ...product, ProductUrl: url }] }),
      [],
    );
  assert.throws(() =>
    normalizeOffers({ ...payload, SearchLocaleUsed: { Currency: "USD" } }),
  );
  assert.throws(() => normalizeOffers({ error: "not a product response" }));
  assert.deepEqual(
    normalizeOffers({ Products: [{ ...product, Discontinued: true }] }),
    [],
  );
  assert.deepEqual(
    normalizeOffers({
      Products: [
        {
          ...product,
          ProductVariations: [
            { ...product.ProductVariations[0], DigiReelFee: 7 },
          ],
        },
      ],
    }),
    [],
  );
});

test("MOQ, tier prices, aggregated stock and distribution cap protect cart quantities", () => {
  const offer = normalizeOffers(payload)[0];
  assert.equal(orderQuantity(offer, 1), 5);
  assert.equal(unitPrice(offer, 5), 20);
  assert.equal(unitPrice(offer, 10), 15);
  assert.equal(unitPrice({ ...offer, prices: [] }, 5), null);
  for (const quantity of [0, -1, 4, 5.5, NaN, 11, 13])
    assert.equal(canPurchase(offer, quantity), false);
  assert.equal(canPurchase(offer, 10), true);
  const combined = cartLines([
    { offer, quantity: 6 },
    { offer, quantity: 6 },
  ]);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].quantity, 12);
  assert.equal(canPurchase(combined[0].offer, combined[0].quantity), false);
});

test("OAuth, cache, 401 retry, quota and provider failures without leaking secrets", async (t) => {
  const old = { ...process.env };
  t.after(() => { process.env = old; });
  process.env.DIGIKEY_CLIENT_ID = "test-client";
  process.env.DIGIKEY_CLIENT_SECRET = "never-expose-this";
  process.env.DIGIKEY_SANDBOX = "false";
  let tokens = 0,
    searches = 0,
    quota = 0;
  let status = 200;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/token")) {
      tokens++;
      assert.equal(
        new URLSearchParams(String(init.body)).get("grant_type"),
        "client_credentials",
      );
      return Response.json({
        access_token: `bearer-${tokens}`,
        expires_in: 600,
      });
    }
    searches++;
    assert.equal(url, "https://api.digikey.com/products/v4/search/keyword");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("X-DIGIKEY-Locale-Currency"), "JPY");
    assert.equal(headers.get("X-DIGIKEY-Locale-Site"), "JP");
    assert.equal(JSON.parse(String(init.body)).Limit, 10);
    if (status !== 200) {
      const s = status;
      if (status === 401) status = 200;
      return Response.json({ error: "never-expose-this" }, { status: s });
    }
    return Response.json(payload);
  });
  const takeQuota = async () => {
    quota++;
  };
  const first = await searchDigiKey("green", takeQuota);
  assert.equal(first.sandbox, false);
  await searchDigiKey("green", takeQuota);
  assert.equal(tokens, 1);
  assert.equal(searches, 1);
  assert.equal(quota, 1);
  status = 401;
  await searchDigiKey("red", takeQuota);
  assert.equal(tokens, 2);
  assert.equal(searches, 3);
  assert.equal(quota, 3);
  for (const s of [429, 403, 503]) {
    status = s;
    await assert.rejects(
      searchDigiKey(`error-${s}`, takeQuota),
      (e: Error) => !e.message.includes("never-expose-this"),
    );
  }
  const before = searches;
  await assert.rejects(
    searchDigiKey("quota-denied", async () => {
      throw new Error("quota");
    }),
    /quota/,
  );
  assert.equal(searches, before);
  process.env.DIGIKEY_CLIENT_SECRET = "";
  await assert.rejects(searchDigiKey("unconfigured", takeQuota), /準備中/);
});
