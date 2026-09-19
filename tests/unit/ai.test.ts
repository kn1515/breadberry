import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCircuit, reviewCircuit } from "../../src/lib/ai";
import { demoCircuit } from "../../src/lib/demo";
test("Gemini request uses structured JSON; GMI performs supplementary review", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  const oldGmi = process.env.GMI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GMI_API_KEY = "test-gmi";
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(
      String(url).includes("googleapis")
        ? {
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: JSON.stringify(demoCircuit()) }] },
              },
            ],
          }
        : {
            choices: [
              { message: { content: "ピン番号を実物で確認してください。" } },
            ],
          },
    );
  };
  try {
    const c = await generateCircuit("温湿度センサーを作りたい", "esp32");
    assert.equal(c.board, "esp32");
    const r = await reviewCircuit(c);
    assert.equal(r.status, "reviewed");
    assert.ok(calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(calls[1].url.endsWith("/chat/completions"));
    assert.ok(calls[1].body.messages[1].content.includes("DHT22"));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
    if (oldGmi === undefined) delete process.env.GMI_API_KEY;
    else process.env.GMI_API_KEY = oldGmi;
  }
});
test("missing Gemini is explicit; GMI failure never reports reviewed", async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(generateCircuit("sample test", "esp32"), /未設定/);
  } finally {
    if (old !== undefined) process.env.GEMINI_API_KEY = old;
  }
  const oldGmi = process.env.GMI_API_KEY;
  delete process.env.GMI_API_KEY;
  try {
    assert.equal((await reviewCircuit(demoCircuit())).status, "unavailable");
  } finally {
    if (oldGmi !== undefined) process.env.GMI_API_KEY = oldGmi;
  }
});
