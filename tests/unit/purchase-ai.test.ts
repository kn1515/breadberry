import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { recommendPurchase } from "../../src/lib/purchase-ai";
import { purchaseParts, type PurchaseOffer } from "../../src/lib/purchase";
import { demoCircuit } from "../../src/lib/demo";

const circuit = demoCircuit("esp32", "led");
const part = purchaseParts(circuit).find((p) => p.kind === "led")!;
const offer: PurchaseOffer = {
  partNumber: "GREEN-ND",
  manufacturerPartNumber: "GREEN",
  manufacturer: "Test",
  description: "Green through-hole LED",
  url: "https://www.digikey.jp/ja/products/detail/test/1",
  packaging: "Bulk",
  stock: 100,
  minimum: 1,
  maximum: null,
  prices: [{ quantity: 1, unitPrice: 20 }],
};
const products = [
  { store: "akizuki", url: "https://akizukidenshi.com/catalog/g/g100001/" },
  {
    store: "sengoku",
    url: "https://www.sengoku.co.jp/mod/sgk_cart/detail.php?code=TEST",
  },
  { store: "kyoritsu", url: "https://eleshop.jp/shop/g/g123456/" },
  { store: "marutsu", url: "https://www.marutsu.co.jp/pc/i/123456/" },
  { store: "amazon", url: "https://www.amazon.co.jp/dp/B012345678" },
];
const choice = {
  id: "web:1",
  name: "緑色スルーホールLED",
  compatible: true,
  availability: "in_stock",
  stockEvidence: "在庫あり",
  unitsPerPack: 1,
  minimumOrder: 1,
  availableQuantity: 100,
  unitPriceJPY: 10,
  reason: "回路に適合し、必要数量の費用が最小です。",
  checks: "販売元・送料を確認してください。",
};
function setup(t: TestContext) {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (old === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = old;
  });
  const state = {
    products: [products[4]],
    productBatches: [] as (typeof products)[],
    rankedBatches: [] as (typeof choice)[][],
    ranked: [choice],
    finishReason: "STOP",
    grounded: true,
    retrieved: products.map((p) => p.url),
    requests: [] as any[],
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      state.requests.push(body);
      const search = !!body.tools?.[0]?.google_search;
      return Response.json({
        candidates: [
          {
            finishReason: state.finishReason,
            content: {
              parts: [
                { thought: true, text: "private" },
                {
                  text: JSON.stringify(
                    search
                      ? {
                          products:
                            state.productBatches.shift() ?? state.products,
                        }
                      : {
                          reason: "確認結果",
                          ranked: state.rankedBatches.shift() ?? state.ranked,
                        },
                  ),
                },
              ],
            },
            ...(search && state.grounded
              ? {
                  groundingMetadata: {
                    groundingChunks: [{ web: { uri: products[0].url } }],
                    searchEntryPoint: {
                      renderedContent: "<div>Google Search</div>",
                    },
                  },
                }
              : {}),
            ...(!search
              ? {
                  urlContextMetadata: {
                    urlMetadata: state.retrieved.map((retrievedUrl) => ({
                      retrievedUrl,
                      urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS",
                    })),
                  },
                }
              : {}),
          },
        ],
      });
    },
  );
  return state;
}
const quota = async () => {};

test("returns the first verified Amazon listing after two calls without enumerating all stores", async (t) => {
  const state = setup(t);
  let calls = 0;
  const result = await recommendPurchase(
    part,
    circuit,
    part.query,
    [],
    async () => {
      calls++;
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.partNumber, null);
  assert.equal(result.best?.store, "amazon");
  assert.equal(result.best?.url, products[4].url);
  assert.equal(result.best?.totalPrice, 10);
  assert.match(result.searchSuggestions, /Google Search/);
  assert.ok(!("alternatives" in result));
  const search = JSON.parse(state.requests[0].contents[0].parts[0].text);
  assert.deepEqual(Object.keys(search.stores), [
    "akizuki",
    "sengoku",
    "kyoritsu",
    "marutsu",
    "amazon",
  ]);
  const selection = JSON.parse(state.requests[1].contents[0].parts[0].text);
  assert.deepEqual(selection.connections, circuit.wires);
  assert.equal(selection.requiredPart.ledColor, "green");
  assert.equal(selection.products.length, 1);
  assert.equal(selection.offers.length, 0);
  assert.equal(state.requests.length, 2);
  assert.match(
    state.requests[0].systemInstruction.parts[0].text,
    /do not search every store/,
  );
  assert.ok(state.requests[1].tools[0].url_context);
  assert.ok(state.requests[1].generationConfig.responseJsonSchema);
});

test("a suitable DigiKey offer ends search after one call; unavailable and excessive lots are excluded", async (t) => {
  const state = setup(t);
  state.ranked = [
    { ...choice, id: "digikey:GREEN-ND", unitPriceJPY: 99999 },
    choice,
  ];
  const checkedAt = "2026-09-01T00:00:00.000Z";
  const result = await recommendPurchase(
    { ...part, quantity: 2 },
    circuit,
    part.query,
    [
      offer,
      { ...offer, partNumber: "SOLD", stock: 0 },
      { ...offer, partNumber: "LOW", maximum: 1 },
      { ...offer, partNumber: "BULK", minimum: 1000, stock: 10000 },
    ],
    quota,
    "ja",
    checkedAt,
  );
  assert.equal(result.partNumber, offer.partNumber);
  assert.equal(result.best?.store, "digikey");
  assert.equal(result.best?.quantity, 2);
  assert.equal(result.best?.totalPrice, 40); // Authoritative API price, not invented AI price.
  assert.equal(result.best?.checkedAt, checkedAt);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].tools, undefined);
  const data = JSON.parse(state.requests[0].contents[0].parts[0].text);
  assert.deepEqual(
    data.offers.map((o: PurchaseOffer) => o.partNumber),
    [offer.partNumber],
  );
});

test("sold-out, unknown stock, inaccessible pages, missing pack size and insufficient stock are excluded", async (t) => {
  const state = setup(t);
  for (const patch of [
    { availability: "out_of_stock" },
    { availability: "unknown" },
    { stockEvidence: "売り切れ" },
    { stockEvidence: "Currently unavailable" },
    { stockEvidence: "" },
    { compatible: false },
    { availableQuantity: 0 },
    { unitsPerPack: null },
    { minimumOrder: null },
    { id: "web:invented" },
    { unitsPerPack: 1000 },
  ]) {
    state.ranked = [{ ...choice, ...patch } as typeof choice];
    const result = await recommendPurchase(
      part,
      circuit,
      part.query,
      [],
      quota,
    );
    assert.equal(result.best, null, JSON.stringify(patch));
  }
  state.ranked = [choice];
  state.retrieved = [];
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [], quota)).best,
    null,
  );
  state.ranked = [choice];
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [], quota)).best,
    null,
  );
});

test("sale quantities use pack size and minimum orders, reject insufficient packs and excess boards", async (t) => {
  const state = setup(t);
  state.ranked = [{ ...choice, unitsPerPack: 4, unitPriceJPY: 120 }];
  const required = { ...part, quantity: 6 };
  const result = await recommendPurchase(
    required,
    circuit,
    part.query,
    [],
    quota,
  );
  assert.equal(result.best?.quantity, 2);
  assert.equal(result.best?.unitsPerPack, 4);
  assert.equal(result.best?.totalPrice, 240);
  state.ranked[0].availableQuantity = 1;
  assert.equal(
    (await recommendPurchase(required, circuit, part.query, [], quota)).best,
    null,
  );
  state.ranked[0].availableQuantity = 100;
  const board = purchaseParts(circuit).find((p) => p.kind === "board")!;
  assert.equal(
    (await recommendPurchase(board, circuit, board.query, [], quota)).best,
    null,
  );
});

test("untrusted discovery URLs and ungrounded results cannot become product recommendations", async (t) => {
  const state = setup(t);
  state.products = [
    {
      store: "amazon",
      url: "https://www.amazon.co.jp.evil.test/dp/B012345678",
    },
  ];
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [], quota)).best,
    null,
  );
  assert.equal(
    state.requests.filter((r) => r.tools?.[0]?.url_context).length,
    0,
  );
  state.products = [products[4]];
  state.grounded = false;
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [], quota)).best,
    null,
  );
});

test("an existing suitable offer skips discovery; no matches remains explicitly empty", async (t) => {
  const state = setup(t);
  state.products = [];
  state.ranked = [{ ...choice, id: "digikey:GREEN-ND" }];
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [offer], quota))
      .partNumber,
    offer.partNumber,
  );
  assert.equal(state.requests[0].tools, undefined);
  const result = await recommendPurchase(part, circuit, part.query, [], quota);
  assert.equal(result.best, null);
  assert.match(result.reason, /在庫と適合性/);
});

test("English, quota on both calls, missing credentials and incomplete responses are handled", async (t) => {
  const state = setup(t);
  await recommendPurchase(part, circuit, part.query, [], quota, "en");
  assert.match(
    state.requests[1].systemInstruction.parts[0].text,
    /concise English reason/,
  );
  let count = 0;
  const before = state.requests.length;
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [], async () => {
      if (++count === 2) throw new Error("quota");
    }),
    /quota/,
  );
  assert.equal(state.requests.length - before, 1);
  state.finishReason = "MAX_TOKENS";
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [], quota),
    /選定結果/,
  );
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [], quota),
    /現在利用できません/,
  );
});

test("failed stock verification tries one other listing and stops immediately on success", async (t) => {
  const state = setup(t);
  state.productBatches = [[products[4]], [products[0]]];
  state.rankedBatches = [
    [{ ...choice, availability: "out_of_stock" }],
    [choice],
  ];
  const phases: string[] = [];
  const result = await recommendPurchase(
    part,
    circuit,
    part.query,
    [],
    quota,
    "ja",
    undefined,
    { onPhase: (phase) => phases.push(phase) },
  );
  assert.equal(result.best?.store, "akizuki");
  assert.equal(state.requests.length, 4);
  const retry = JSON.parse(state.requests[2].contents[0].parts[0].text);
  assert.deepEqual(retry.excludedUrls, [products[4].url]);
  assert.deepEqual(phases, [
    "discovery",
    "verification",
    "discovery",
    "verification",
  ]);
});

test("overkill DigiKey offers fall through to one suitable store, including all five allowed shops", async (t) => {
  const state = setup(t);
  for (const product of products) {
    state.requests = [];
    state.products = [product];
    state.rankedBatches = [[], [choice]];
    const result = await recommendPurchase(
      part,
      circuit,
      part.query,
      [offer],
      quota,
    );
    assert.equal(result.best?.store, product.store);
    assert.equal(state.requests.length, 3);
    assert.equal(state.requests[0].tools, undefined);
    assert.ok(state.requests[1].tools[0].google_search);
    assert.ok(state.requests[2].tools[0].url_context);
  }
});

test("cancelling after a failed candidate never starts another store search", async (t) => {
  const state = setup(t);
  state.ranked = [];
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(
    recommendPurchase(
      part,
      circuit,
      part.query,
      [],
      async () => {
        if (++count === 2) controller.abort(new Error("stopped"));
      },
      "ja",
      undefined,
      { signal: controller.signal },
    ),
    /stopped/,
  );
  assert.equal(state.requests.length, 1);
});
