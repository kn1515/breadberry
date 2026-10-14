import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { answerQuestion } from "../../src/lib/ask-ai";
import {
  appendAnswer,
  askRequestSchema,
  MAX_MESSAGES,
  messageSchema,
} from "../../src/lib/conversation";
import { demoCircuit } from "../../src/lib/demo";
import { POST } from "../../src/app/api/ask/route";
import { newSession } from "../../src/lib/server";

test("ask requests require the current circuit and bounded history", () => {
  const context = { circuit: demoCircuit("pico", "led"), messages: [] };
  assert.equal(
    askRequestSchema.safeParse({ prompt: " なぜ？ ", context }).data?.prompt,
    "なぜ？",
  );
  assert.equal(askRequestSchema.safeParse({ prompt: "なぜ？" }).success, false);
  assert.equal(
    askRequestSchema.safeParse({
      prompt: "なぜ？",
      context: {
        ...context,
        messages: Array.from({ length: MAX_MESSAGES }, () => ({
          role: "user",
          content: "質問",
        })),
      },
    }).success,
    false,
  );
});

test("ask mode sends the circuit as untrusted data and returns plain text without editing", async (t) => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  const input = askRequestSchema.parse({
    prompt: "抵抗は何のため？",
    locale: "en",
    context: {
      circuit: demoCircuit("pico", "led"),
      messages: [
        { role: "user", content: "LEDを点滅させたい" },
        { role: "assistant", content: "LED点滅回路" },
      ],
    },
  });
  let body: any;
  let finishReason = "STOP";
  let text = "  It limits the LED current.  ";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({
        candidates: [
          {
            finishReason,
            content: {
              parts: [{ thought: true, text: "private" }, { text }],
            },
          },
        ],
      });
    },
  );
  assert.equal(await answerQuestion(input), "It limits the LED current.");
  const sent = JSON.parse(body.contents[0].parts[0].text);
  assert.equal(sent.question, "抵抗は何のため？");
  assert.deepEqual(sent.currentCircuit, input.context.circuit);
  assert.deepEqual(sent.conversation, input.context.messages);
  assert.equal(body.generationConfig.responseJsonSchema, undefined);
  const system = body.systemInstruction.parts[0].text;
  assert.match(system, /never return a modified circuit/);
  assert.match(system, /untrusted data/);
  assert.match(system, /English/);

  text = "x".repeat(5000);
  const long = await answerQuestion(input);
  assert.equal(long.length, 2000);
  assert.ok(
    messageSchema.safeParse({ role: "assistant", content: long }).success,
  );

  finishReason = "MAX_TOKENS";
  await assert.rejects(answerQuestion(input), /回答を完了できませんでした/);
});

test("answers append to the conversation without touching the circuit", () => {
  const messages = appendAnswer([], "なぜ？", "電流制限のためです。");
  assert.deepEqual(messages, [
    { role: "user", content: "なぜ？" },
    { role: "assistant", content: "電流制限のためです。" },
  ]);
});

test("ask endpoint enforces origin, signed session and payload validation before AI", async (t) => {
  const oldSecret = process.env.SESSION_SECRET;
  const oldOrigin = process.env.APP_ORIGIN;
  process.env.SESSION_SECRET = "ask-test-session-secret-over-32-characters";
  process.env.APP_ORIGIN = "https://breadberry.test";
  t.after(() => {
    if (oldSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSecret;
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
  });
  const req = (headers: Record<string, string> = {}, body = "{}") =>
    new NextRequest("https://breadberry.test/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  assert.equal((await POST(req({ origin: "https://evil.test" }))).status, 403);
  assert.equal((await POST(req())).status, 401);
  assert.equal(
    (await POST(req({ cookie: `bb_session=${newSession()}` }))).status,
    400,
  );
});
