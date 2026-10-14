import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFirmware } from "../../src/lib/firmware-ai";
import { firmwareAnalysisRequest } from "../../src/lib/firmware";
import { demoCircuit } from "../../src/lib/demo";
import { POST } from "../../src/app/api/firmware/analyze/route";
import { NextRequest } from "next/server";
import { newSession } from "../../src/lib/server";

test("analysis includes exact code, circuit, failing stage and log as untrusted data; validates corrected source", async (t) => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test";
  t.after(() => {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  });
  const input = firmwareAnalysisRequest.parse({
    circuit: demoCircuit("esp32", "led"),
    stage: "compiling",
    log: "SyntaxError: invalid syntax",
    feedback: "LED should blink once per second.",
    locale: "en",
  });
  let body: any;
  let output = {
    cause: "Missing colon",
    steps: ["Add a colon."],
    firmware: "print('fixed')",
  };
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "private" },
                { text: JSON.stringify(output) },
              ],
            },
          },
        ],
      });
    },
  );
  assert.deepEqual(await analyzeFirmware(input), output);
  assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), input);
  assert.match(body.systemInstruction.parts[0].text, /untrusted evidence/);
  assert.match(body.systemInstruction.parts[0].text, /English/);
  assert.match(body.systemInstruction.parts[0].text, /user feedback/);
  output = { ...output, firmware: input.circuit.firmware };
  assert.equal((await analyzeFirmware(input)).firmware, "");
  output = { ...output, firmware: "print('fixed')" };
  assert.equal(
    (
      await analyzeFirmware({
        ...input,
        circuit: demoCircuit("raspberry-pi", "led"),
      })
    ).firmware,
    "",
  );
  output = { ...output, firmware: "x".repeat(12001) };
  await assert.rejects(analyzeFirmware(input), /読み取れません/);
});

test("feedback can be analyzed without an error log, but empty or oversized evidence is rejected", () => {
  const input = {
    circuit: demoCircuit("esp32", "led"),
    stage: "feedback",
    feedback: "  LED blinks too fast.  ",
  };
  const parsed = firmwareAnalysisRequest.parse(input);
  assert.equal(parsed.log, "");
  assert.equal(parsed.feedback, "LED blinks too fast.");
  assert.equal(
    firmwareAnalysisRequest.safeParse({ ...input, feedback: "  " }).success,
    false,
  );
  assert.equal(
    firmwareAnalysisRequest.safeParse({ ...input, feedback: "x".repeat(4001) })
      .success,
    false,
  );
  assert.equal(
    firmwareAnalysisRequest.safeParse({ ...input, feedback: "", log: "  " })
      .success,
    false,
  );
});

test("analysis input bounds log, stage, and code size", () => {
  const input = {
    circuit: demoCircuit("pico", "led"),
    stage: "running",
    log: "ImportError",
  };
  assert.equal(firmwareAnalysisRequest.safeParse(input).success, true);
  assert.equal(
    firmwareAnalysisRequest.safeParse({ ...input, log: "x".repeat(16001) })
      .success,
    false,
  );
  assert.equal(
    firmwareAnalysisRequest.safeParse({ ...input, stage: "invented" }).success,
    false,
  );
});

test("analysis endpoint enforces origin, signed session and payload validation before AI", async (t) => {
  const oldSecret = process.env.SESSION_SECRET;
  const oldOrigin = process.env.APP_ORIGIN;
  process.env.SESSION_SECRET =
    "firmware-test-session-secret-over-32-characters";
  process.env.APP_ORIGIN = "https://breadberry.test";
  t.after(() => {
    if (oldSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSecret;
    if (oldOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = oldOrigin;
  });
  const req = (headers: Record<string, string> = {}, body = "{}") =>
    new NextRequest("https://breadberry.test/api/firmware/analyze", {
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
