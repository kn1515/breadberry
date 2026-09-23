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
    await assert.rejects(generateCircuit("sample test", "esp32"), /現在利用できません/);
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

test("revisions include the current circuit and earlier conversation", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const original = demoCircuit("esp32", "led");
  const revised = structuredClone(original);
  revised.parts.find((p) => p.kind === "resistor")!.value = "470Ω";
  const messages = [
    { role: "user" as const, content: "LEDを点滅させたい" },
    { role: "assistant" as const, content: "LEDの回路を作成しました。" },
  ];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const context = JSON.parse(body.contents[0].parts[0].text);
    assert.deepEqual(context.currentCircuit, original);
    assert.deepEqual(context.conversation, messages);
    assert.equal(context.request, "抵抗を470Ωにして");
    assert.match(
      body.systemInstruction.parts[0].text,
      /Preserve unrelated components/,
    );
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(revised) }] },
        },
      ],
    });
  };
  try {
    const result = await generateCircuit("抵抗を470Ωにして", "esp32", {
      circuit: original,
      messages,
    });
    assert.equal(
      result.parts.find((p) => p.kind === "resistor")!.value,
      "470Ω",
    );
    assert.deepEqual(result.wires, original.wires);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("English preference reaches Gemini and GMI system instructions", async (t) => {
  const previous = {
    gemini: process.env.GEMINI_API_KEY,
    gmi: process.env.GMI_API_KEY,
  };
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GMI_API_KEY = "test-gmi";
  t.after(() => {
    for (const [name, value] of [
      ["GEMINI_API_KEY", previous.gemini],
      ["GMI_API_KEY", previous.gmi],
    ]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  });
  const instructions: string[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (String(url).includes("googleapis")) {
        instructions.push(body.systemInstruction.parts[0].text);
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(demoCircuit()) }] },
            },
          ],
        });
      }
      instructions.push(body.messages[0].content);
      return Response.json({
        choices: [{ message: { content: "Check the physical pin labels." } }],
      });
    },
  );
  const circuit = await generateCircuit(
    "Blink an LED",
    "esp32",
    undefined,
    "en",
  );
  await reviewCircuit(circuit, "en");
  assert.match(instructions[0], /Respond in English/);
  assert.match(instructions[1], /concerns in English/);
});
