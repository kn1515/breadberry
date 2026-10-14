import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { generateCircuit, reviewCircuit } from "../../src/lib/ai";
import { runCircuitAgent } from "../../src/lib/agent";
import { demoCircuit } from "../../src/lib/demo";
import { MAX_PARTS, MAX_WIRES } from "../../src/lib/circuit";
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
              {
                message: {
                  content: "PASS: ピン番号を実物で確認してください。",
                },
              },
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
    const schema = calls[0].body.generationConfig.responseJsonSchema;
    assert.equal(schema.properties.parts.maxItems, undefined);
    assert.equal(schema.properties.wires.maxItems, undefined);
    assert.match(schema.properties.parts.description, /48/);
    assert.match(schema.properties.wires.description, /240/);
    assert.equal(schema.properties.parts.minItems, 1);
    assert.equal(schema.properties.wires.minItems, 1);
    assert.ok(calls[1].url.endsWith("/chat/completions"));
    assert.equal(calls[1].body.enable_thinking, true);
    assert.equal(calls[1].body.thinking_budget, 512);
    assert.ok(calls[1].body.messages[1].content.includes("DHT22"));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
    if (oldGmi === undefined) delete process.env.GMI_API_KEY;
    else process.env.GMI_API_KEY = oldGmi;
  }
});

function setupReview(t: TestContext) {
  const names = ["GMI_API_KEY", "GMI_MODEL", "GMI_BASE_URL", "GEMINI_API_KEY"];
  const previous = names.map((name) => process.env[name]);
  process.env.GMI_API_KEY = "private-test-gmi-key";
  process.env.GMI_MODEL = "Qwen/Qwen3.8-Flash";
  delete process.env.GMI_BASE_URL;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  t.after(() =>
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    }),
  );
  const logs: string[] = [];
  t.mock.method(console, "log", (line: string) => logs.push(line));
  return logs;
}

test("custom review models do not receive Qwen-specific parameters", async (t) => {
  setupReview(t);
  process.env.GMI_MODEL = "custom-review-model";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, "custom-review-model");
      assert.equal(body.enable_thinking, undefined);
      assert.equal(body.thinking_budget, undefined);
      return Response.json({
        choices: [{ message: { content: "FIX: GPIOを変更してください。" } }],
      });
    },
  );
  assert.equal(
    (await reviewCircuit(demoCircuit())).text,
    "FIX: GPIOを変更してください。",
  );
});

test("incomplete or malformed reviews are unavailable and emit safe diagnostics", async (t) => {
  const logs = setupReview(t);
  const cases = [
    { finish_reason: "length", message: { content: "PASS: 配線は" } },
    {
      finish_reason: "length",
      message: { content: null, reasoning_content: "private reasoning" },
    },
    { finish_reason: "stop", message: { content: "  " } },
    { finish_reason: "stop", message: { content: "PASS:" } },
    { finish_reason: "stop", message: { content: "判定なし" } },
  ];
  for (const choice of cases) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ choices: [choice] }),
    );
    assert.equal((await reviewCircuit(demoCircuit())).status, "unavailable");
  }
  assert.equal(logs.length, cases.length);
  for (const line of logs) {
    const log = JSON.parse(line);
    assert.equal(log.message, "gmi_review_failed");
    assert.equal(log.stage, "response");
    assert.equal(log.severity, "WARNING");
    assert.ok(!line.includes("private"));
  }
});

test("provider failures log HTTP status and never mark the review step passed", async (t) => {
  const logs = setupReview(t);
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    if (String(url).includes("googleapis"))
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(demoCircuit()) }] },
          },
        ],
      });
    return Response.json(
      { error: "private provider response" },
      { status: 429 },
    );
  });
  const result = await runCircuitAgent(
    "温湿度センサー",
    "esp32",
    undefined,
    "ja",
    "test-session",
  );
  assert.equal(result.review.status, "unavailable");
  assert.deepEqual(
    result.agentEvents
      .filter((event) => event.step === "review")
      .map((event) => event.outcome),
    ["started", "failed"],
  );
  assert.equal(result.agentEvents.at(-1)?.step, "complete");
  const diagnostic = logs
    .map((line) => JSON.parse(line))
    .find((log) => log.message === "gmi_review_failed");
  assert.equal(diagnostic.stage, "request");
  assert.equal(diagnostic.providerStatus, 429);
  assert.ok(!logs.join("").includes("private"));
});

test("review deadline remains bounded and logs timeouts", async (t) => {
  const logs = setupReview(t);
  let requestSignal: AbortSignal | undefined;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      requestSignal = init.signal!;
      return new Promise<Response>(() => {});
    },
  );
  const pending = reviewCircuit(demoCircuit());
  await Promise.resolve();
  t.mock.timers.tick(20000);
  assert.equal((await pending).status, "unavailable");
  assert.equal(requestSignal?.aborted, true);
  assert.equal(JSON.parse(logs[0]).status, 504);
});

test("generated circuits still reject excessive parts and wires", async (t) => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  const circuit = demoCircuit("esp32", "led");
  let generated = circuit;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(generated) }] },
        },
      ],
    }),
  );
  for (const oversized of [
    {
      ...circuit,
      parts: Array.from({ length: MAX_PARTS + 1 }, () => circuit.parts[0]),
    },
    {
      ...circuit,
      wires: Array.from({ length: MAX_WIRES + 1 }, () => circuit.wires[0]),
    },
  ]) {
    generated = oversized;
    await assert.rejects(generateCircuit("LEDを点滅させて", "esp32"), {
      status: 422,
      message: /接続検査を通過しませんでした/,
    });
  }
});
test("missing Gemini is explicit; GMI failure never reports reviewed", async () => {
  const old = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    await assert.rejects(
      generateCircuit("sample test", "esp32"),
      /現在利用できません/,
    );
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
        choices: [
          { message: { content: "PASS: Check the physical pin labels." } },
        ],
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
