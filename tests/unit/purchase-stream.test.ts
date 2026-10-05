import { test } from "node:test";
import assert from "node:assert/strict";
import { providerJson, ServiceError } from "../../src/lib/ai";
import { requestPurchase } from "../../src/lib/purchase-client";
import { runPurchaseSearch } from "../../src/lib/purchase-search";
import { demoCircuit } from "../../src/lib/demo";
import {
  purchaseParts,
  type PurchaseSearchEvent,
} from "../../src/lib/purchase";

const circuit = demoCircuit("esp32", "led");
const part = purchaseParts(circuit).find((p) => p.kind === "led")!;
const empty = { offers: [], sandbox: false };
const recommendation = {
  partNumber: null,
  best: null,
  reason: "確認済み",
  searchSuggestions: "",
};
const encoder = new TextEncoder();
const wire = (event: PurchaseSearchEvent) =>
  encoder.encode(JSON.stringify(event) + "\n");
function options(emit: (event: PurchaseSearchEvent) => void = () => {}) {
  return {
    part,
    circuit,
    query: part.query,
    locale: "ja" as const,
    digikey: true,
    takeDigiKeyQuota: async () => {},
    takePurchaseAiQuota: async () => {},
    signal: new AbortController().signal,
    emit,
  };
}
const services = {
  search: async () => empty,
  recommend: async () => recommendation,
  timeoutMs: 1000,
  quotaTimeoutMs: 20,
};

test("offers reach the client before recommendation finishes", async () => {
  const events: PurchaseSearchEvent[] = [];
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const pending = runPurchaseSearch(
    options((e) => events.push(e)),
    {
      ...services,
      recommend: async (...args) => {
        assert.equal(events.at(-1)?.type, "offers");
        args[7]?.onPhase?.("verification");
        await gate;
        return recommendation;
      },
    },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    events.map((e) => e.type),
    ["phase", "offers", "phase"],
  );
  finish();
  assert.equal((await pending).recommendation.reason, "確認済み");
});

test("a stalled quota check terminates search and never starts the next provider", async () => {
  let nextProvider = false;
  let finishQuota!: () => void;
  const gate = new Promise<void>((resolve) => {
    finishQuota = resolve;
  });
  const pending = runPurchaseSearch(
    { ...options(), takeDigiKeyQuota: () => gate },
    {
      ...services,
      search: async (_query, quota) => {
        await quota();
        nextProvider = true;
        return empty;
      },
    },
  );
  await assert.rejects(
    pending,
    (e: unknown) =>
      e instanceof ServiceError &&
      e.status === 504 &&
      /利用状況/.test(e.message),
  );
  finishQuota();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nextProvider, false);
});

test("cancellation and overall deadline stop orchestration even if a provider ignores its signal", async () => {
  for (const cancel of [true, false]) {
    const controller = new AbortController();
    let finish!: () => void;
    let recommendCalls = 0;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const pending = runPurchaseSearch(
      { ...options(), signal: controller.signal },
      {
        ...services,
        timeoutMs: 20,
        search: async () => {
          await gate;
          return empty;
        },
        recommend: async () => {
          recommendCalls++;
          return recommendation;
        },
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    if (cancel) controller.abort(new Error("user stopped"));
    await assert.rejects(pending, cancel ? /user stopped/ : /中断/);
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(recommendCalls, 0);
  }
});

test("client decodes split UTF-8 events and delivers partial offers before final result", async (t) => {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(stream.readable, {
        headers: { "content-type": "application/x-ndjson" },
      }),
  );
  const events: PurchaseSearchEvent[] = [];
  const pending = requestPurchase(
    {},
    new AbortController().signal,
    (e) => events.push(e),
    1000,
  );
  const writer = stream.writable.getWriter();
  await writer.write(wire({ type: "offers", search: empty }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 1);
  const final = wire({ type: "result", result: { ...empty, recommendation } });
  for (const byte of final) await writer.write(new Uint8Array([byte]));
  await pending;
  assert.equal(events.length, 2);
  assert.equal(
    events[1].type === "result" && events[1].result.recommendation.reason,
    "確認済み",
  );
});

test("client preserves offers when stream fails or ends without a result", async (t) => {
  for (const errorEvent of [true, false]) {
    const events: PurchaseSearchEvent[] = [];
    t.mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(wire({ type: "offers", search: empty }));
              if (errorEvent)
                controller.enqueue(
                  wire({
                    type: "error",
                    status: 504,
                    error: "provider timeout",
                  }),
                );
              controller.close();
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        ),
    );
    await assert.rejects(
      requestPurchase({}, new AbortController().signal, (e) => events.push(e)),
      errorEvent ? /provider timeout/ : /途切れ/,
    );
    assert.deepEqual(events, [{ type: "offers", search: empty }]);
  }
});

test("client bounds stalled response headers and bodies, and cancels a stalled reader", async (t) => {
  let cancelled = false;
  for (const headers of [false, true]) {
    t.mock.method(globalThis, "fetch", async () =>
      headers
        ? new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { "content-type": "application/x-ndjson" } },
          )
        : new Promise<Response>(() => {}),
    );
    await assert.rejects(
      requestPurchase(
        {},
        new AbortController().signal,
        () => assert.fail("no event expected"),
        20,
      ),
      /中断/,
    );
  }
  assert.equal(cancelled, true);
});

test("provider deadline includes body parsing and honors caller cancellation", async (t) => {
  let signal: AbortSignal | undefined;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Response(new ReadableStream());
    },
  );
  await assert.rejects(
    providerJson("https://example.test", {}, 20),
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
  assert.equal(signal?.aborted, true);
  const controller = new AbortController();
  const pending = providerJson(
    "https://example.test",
    { signal: controller.signal },
    1000,
  );
  controller.abort(new Error("user stopped"));
  await assert.rejects(pending, /user stopped/);
});
