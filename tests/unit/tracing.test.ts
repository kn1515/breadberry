import { test } from "node:test";
import assert from "node:assert/strict";
import { SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import { generateCircuit, ServiceError } from "../../src/lib/ai";
import { demoCircuit } from "../../src/lib/demo";
import {
  flushTraces,
  logEvent,
  setSpanExporter,
  traced,
} from "../../src/lib/tracing";

function setup(
  t: { after: (fn: () => void) => void },
  circuitText: string,
  trace = "true",
) {
  const keys = ["GEMINI_API_KEY", "CLOUD_TRACE", "GOOGLE_CLOUD_PROJECT"];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "gemini-secret-key";
  process.env.CLOUD_TRACE = trace;
  process.env.GOOGLE_CLOUD_PROJECT = "demo-project";
  const exporter = new InMemorySpanExporter();
  setSpanExporter(exporter);
  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        { finishReason: "STOP", content: { parts: [{ text: circuitText }] } },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    });
  t.after(() => {
    globalThis.fetch = oldFetch;
    setSpanExporter(undefined);
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  });
  return exporter;
}

test("each generation step becomes a span without the API key", async (t) => {
  const exporter = setup(t, JSON.stringify(demoCircuit()));
  await generateCircuit("温湿度センサーを作りたい", "esp32");
  await flushTraces();
  const spans = exporter.getFinishedSpans();
  const byName = Object.fromEntries(spans.map((s) => [s.name, s]));
  const root = byName["Circuit generation"];
  const llm = byName["Gemini generateContent"];
  assert.equal(spans.length, 3);
  assert.equal(root.parentSpanContext, undefined);
  for (const child of [llm, byName["Circuit validation"]]) {
    assert.equal(child.parentSpanContext?.spanId, root.spanContext().spanId);
    assert.equal(child.spanContext().traceId, root.spanContext().traceId);
  }
  assert.equal(llm.attributes["breadberry.step.type"], "llm");
  assert.equal(llm.attributes["gen_ai.usage.input_tokens"], 10);
  assert.equal(llm.attributes["gen_ai.usage.output_tokens"], 20);
  assert.match(String(root.attributes.input), /温湿度センサーを作りたい/);
  assert.equal(root.resource.attributes["gcp.project_id"], "demo-project");
  assert.ok(!JSON.stringify(spans.map((s) => s.attributes)).includes("secret"));
});

test("a rejected design is recorded as a failed span", async (t) => {
  const exporter = setup(t, JSON.stringify({ ...demoCircuit(), wires: [] }));
  await assert.rejects(
    generateCircuit("LED", "esp32"),
    (e) => e instanceof ServiceError && e.status === 422,
  );
  await flushTraces();
  const failed = exporter
    .getFinishedSpans()
    .filter((s) => s.status.code === SpanStatusCode.ERROR)
    .map((s) => s.name);
  assert.deepEqual(failed.sort(), ["Circuit generation", "Circuit validation"]);
});

test("nothing is traced unless CLOUD_TRACE is true", async (t) => {
  const exporter = setup(t, JSON.stringify(demoCircuit()), "false");
  await generateCircuit("LED", "esp32");
  await flushTraces();
  assert.equal(exporter.getFinishedSpans().length, 0);
});

test("logs inside a span link to its trace", async (t) => {
  setup(t, "");
  const oldLog = console.log;
  const lines: string[] = [];
  console.log = (line: string) => lines.push(line);
  t.after(() => (console.log = oldLog));
  await traced("step", "tool", async () => logEvent("INFO", "inside"))();
  logEvent("INFO", "outside");
  const [inside, outside] = lines.map((l) => JSON.parse(l));
  assert.match(
    inside["logging.googleapis.com/trace"],
    /^projects\/demo-project\/traces\/[0-9a-f]{32}$/,
  );
  assert.match(inside["logging.googleapis.com/spanId"], /^[0-9a-f]{16}$/);
  assert.equal(outside["logging.googleapis.com/trace"], undefined);
});
