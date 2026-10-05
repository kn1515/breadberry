import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  database,
  newSession,
  takeDigiKeyQuota,
  takePurchaseAiQuota,
} from "../../src/lib/server";
import { POST } from "../../src/app/api/purchase/search/route";
import { ServiceError } from "../../src/lib/ai";
import { demoCircuit } from "../../src/lib/demo";
import {
  purchaseParts,
  type PurchaseSearchEvent,
} from "../../src/lib/purchase";

const day = () => new Date().toISOString().slice(0, 10);
const productUrl = "https://www.amazon.co.jp/dp/B012345678";
function setup(t: TestContext) {
  const values = {
    GOOGLE_CLOUD_PROJECT: "test-purchase-quota",
    SESSION_SECRET: "test-purchase-quota-session-secret-with-32-characters",
    DIGIKEY_CLIENT_ID: "test-id",
    DIGIKEY_CLIENT_SECRET: "test-secret",
    DIGIKEY_SANDBOX: "false",
    GEMINI_API_KEY: "test-key",
    DIGIKEY_DAILY_LIMIT: "2",
    DIGIKEY_SESSION_DAILY_LIMIT: "2",
    PURCHASE_AI_DAILY_LIMIT: "100",
    PURCHASE_AI_SESSION_DAILY_LIMIT: "100",
  };
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const counts = new Map<string, number>();
  t.mock.method(
    database(),
    "runTransaction",
    async (work: (tx: unknown) => Promise<unknown>) => {
      const writes: [string, number][] = [];
      const result = await work({
        getAll: async (...refs: { id: string }[]) =>
          refs.map((ref) => ({
            data: () => ({ count: counts.get(ref.id) ?? 0 }),
          })),
        set: (
          ref: { id: string },
          data: { count: number; expiresAt: Date },
        ) => {
          assert.ok(data.expiresAt instanceof Date);
          writes.push([ref.id, data.count]);
        },
      });
      for (const [key, value] of writes) counts.set(key, value);
      return result;
    },
  );
  return counts;
}

test("DigiKey global and session limits do not consume or block the Gemini quota", async (t) => {
  const counts = setup(t);
  for (const key of [`digikey-global-${day()}`, `digikey-user-${day()}`]) {
    counts.clear();
    counts.set(key, 2);
    await assert.rejects(
      takeDigiKeyQuota("user"),
      (e: unknown) => e instanceof ServiceError && e.status === 429,
    );
    await takePurchaseAiQuota("user");
    assert.equal(counts.get(key), 2);
    assert.equal(counts.get(`purchase-ai-global-${day()}`), 1);
    assert.equal(counts.get(`purchase-ai-user-${day()}`), 1);
    assert.equal(counts.has(`global-${day()}`), false);
  }
});

test("Gemini has independent configurable global and session limits", async (t) => {
  const counts = setup(t);
  for (const key of [
    `purchase-ai-global-${day()}`,
    `purchase-ai-user-${day()}`,
  ]) {
    counts.clear();
    counts.set(key, 100);
    await assert.rejects(
      takePurchaseAiQuota("user"),
      /ショップ検索・商品確認回数/,
    );
    await takeDigiKeyQuota("user");
    assert.equal(counts.get(key), 100);
    assert.equal(counts.get(`digikey-global-${day()}`), 1);
    assert.equal(counts.get(`digikey-user-${day()}`), 1);
  }
});

for (const exhausted of ["global", "session", "provider", "both"] as const) {
  test(`search route continues through real quota and recommendation code when DigiKey is limited: ${exhausted}`, async (t) => {
    const counts = setup(t);
    const session = newSession();
    const user = session.split(".")[0];
    const key =
      exhausted === "session"
        ? `digikey-${user}-${day()}`
        : `digikey-global-${day()}`;
    if (exhausted !== "provider") counts.set(key, 2);
    if (exhausted === "both") counts.set(`purchase-ai-global-${day()}`, 100);
    let aiCalls = 0;
    let productCalls = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (url: string, init: RequestInit) => {
        if (url.includes("/oauth2/token"))
          return Response.json({
            access_token: "test-token",
            expires_in: 3600,
          });
        if (url.includes("/products/v4/search/keyword")) {
          productCalls++;
          assert.equal(
            exhausted,
            "provider",
            "local quota must prevent the DigiKey API call",
          );
          return Response.json({}, { status: 429 });
        }
        assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
        aiCalls++;
        const body = JSON.parse(String(init.body));
        const search = !!body.tools?.[0]?.google_search;
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify(
                      search
                        ? { products: [{ store: "amazon", url: productUrl }] }
                        : {
                            reason: "適合する少量商品です。",
                            ranked: [
                              {
                                id: "web:1",
                                name: "緑色LED",
                                compatible: true,
                                availability: "in_stock",
                                stockEvidence: "在庫あり",
                                unitsPerPack: 1,
                                minimumOrder: 1,
                                availableQuantity: 100,
                                unitPriceJPY: 10,
                                reason: "適合する少量商品です。",
                                checks: "送料を確認",
                              },
                            ],
                          },
                    ),
                  },
                ],
              },
              ...(search
                ? {
                    groundingMetadata: {
                      groundingChunks: [{ web: { uri: productUrl } }],
                    },
                  }
                : {
                    urlContextMetadata: {
                      urlMetadata: [
                        {
                          retrievedUrl: productUrl,
                          urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS",
                        },
                      ],
                    },
                  }),
            },
          ],
        });
      },
    );
    const circuit = demoCircuit("esp32", "led");
    const part = purchaseParts(circuit).find((p) => p.kind === "led")!;
    const response = await POST(
      new NextRequest("http://localhost:3000/api/purchase/search", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/x-ndjson",
          cookie: `bb_session=${session}`,
        },
        body: JSON.stringify({ circuit, partId: part.id, query: part.query }),
      }),
    );
    assert.equal(response.status, 200);
    const events: PurchaseSearchEvent[] = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      events.some(
        (e) =>
          e.type === "offers" &&
          e.search.digikeyLimited &&
          !e.search.offers.length,
      ),
    );
    if (exhausted === "both") {
      const last = events.at(-1);
      assert.equal(last?.type, "error");
      assert.ok(
        last?.type === "error" &&
          last.status === 429 &&
          /ショップ検索・商品確認回数/.test(last.error),
      );
      assert.equal(aiCalls, 0);
      assert.equal(counts.get(`purchase-ai-global-${day()}`), 100);
    } else {
      const last = events.at(-1);
      assert.equal(last?.type, "result");
      assert.ok(
        last?.type === "result" &&
          last.result.digikeyLimited &&
          last.result.recommendation.best?.store === "amazon",
      );
      assert.equal(aiCalls, 2);
      assert.equal(counts.get(`purchase-ai-global-${day()}`), 2);
      assert.equal(counts.get(`purchase-ai-${user}-${day()}`), 2);
    }
    assert.equal(productCalls, exhausted === "provider" ? 1 : 0);
    assert.equal(counts.get(key), exhausted === "provider" ? 1 : 2);
  });
}
