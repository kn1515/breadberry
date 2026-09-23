import { test } from "node:test";
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
  minimum: 5,
  maximum: null,
  prices: [{ quantity: 1, unitPrice: 20 }],
};

test("Gemini selects an eligible API product with circuit context and counts cached-search AI calls", async (t) => {
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  });
  let quota = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const data = JSON.parse(body.contents[0].parts[0].text);
      assert.equal(data.requiredPart.ledColor, "green");
      assert.deepEqual(data.connections, circuit.wires);
      assert.deepEqual(
        data.offers.map((o: PurchaseOffer) => o.partNumber),
        [offer.partNumber],
      );
      assert.ok(body.generationConfig.responseJsonSchema);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "private thinking" },
                {
                  text: JSON.stringify({
                    partNumber: offer.partNumber,
                    reason: "緑色・スルーホールのLEDです。",
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  );
  for (let i = 0; i < 2; i++) {
    const result = await recommendPurchase(
      part,
      circuit,
      part.query,
      [
        { ...offer, partNumber: "SOLD-OUT", stock: 0 },
        { ...offer, partNumber: "OVER-MAX", maximum: 1 },
        offer,
      ],
      async () => {
        quota++;
      },
    );
    assert.equal(result.partNumber, offer.partNumber);
  }
  assert.equal(quota, 2);
});

test("no candidates skips Gemini; unknown, unavailable and malformed selections are rejected", async (t) => {
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  });
  let answer: unknown = {
    partNumber: null,
    reason: "互換性を確認できません。",
  };
  let finishReason = "STOP";
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          finishReason,
          content: { parts: [{ text: JSON.stringify(answer) }] },
        },
      ],
    }),
  );
  const takeQuota = async () => {};
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [], takeQuota))
      .partNumber,
    null,
  );
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(
    (await recommendPurchase(part, circuit, part.query, [offer], takeQuota))
      .partNumber,
    null,
  );
  for (const invalid of [
    { partNumber: "INVENTED", reason: "match" },
    { partNumber: "SOLD-OUT", reason: "match" },
    { partNumber: offer.partNumber, reason: "" },
    { unexpected: true },
  ]) {
    answer = invalid;
    await assert.rejects(
      recommendPurchase(
        part,
        circuit,
        part.query,
        [offer, { ...offer, partNumber: "SOLD-OUT", stock: 0 }],
        takeQuota,
      ),
      /選定結果/,
    );
  }
  answer = { partNumber: offer.partNumber, reason: "match" };
  finishReason = "MAX_TOKENS";
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [offer], takeQuota),
    /選定結果/,
  );
  const calls = fetch.mock.callCount();
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [offer], async () => {
      throw new Error("quota");
    }),
    /quota/,
  );
  assert.equal(fetch.mock.callCount(), calls);
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    recommendPurchase(part, circuit, part.query, [offer], takeQuota),
    /未設定/,
  );
});

test("English preference is used for product selection reasons", async (t) => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.match(
        body.systemInstruction.parts[0].text,
        /concise English reason/,
      );
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    partNumber: offer.partNumber,
                    reason: "Green through-hole LED matches the circuit.",
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  );
  const result = await recommendPurchase(
    part,
    circuit,
    part.query,
    [offer],
    async () => {},
    "en",
  );
  assert.equal(result.partNumber, offer.partNumber);
  assert.match(result.reason, /matches the circuit/);
});
