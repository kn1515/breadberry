import { test } from "node:test";
import assert from "node:assert/strict";
import { screenPrompt, screenResponse } from "../../src/lib/model-armor";
import { ServiceError } from "../../src/lib/ai";

const token = async () => "test-token";
const matched = {
  sanitizationResult: {
    filterMatchState: "MATCH_FOUND",
    filterResults: {
      rai: { raiFilterResult: { matchState: "NO_MATCH_FOUND" } },
      pi_and_jailbreak: {
        piAndJailbreakFilterResult: { matchState: "MATCH_FOUND" },
      },
      sdp: {
        sdpFilterResult: { inspectResult: { matchState: "MATCH_FOUND" } },
      },
    },
  },
};

function setup(
  t: { after: (fn: () => void) => void },
  env: Record<string, string | undefined>,
  respond: () => Response | Promise<Response>,
) {
  const keys = [
    "GOOGLE_CLOUD_PROJECT",
    "MODEL_ARMOR_TEMPLATE",
    "MODEL_ARMOR_LOCATION",
    "MODEL_ARMOR_MODE",
    "CLOUD_TRACE",
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const oldFetch = globalThis.fetch;
  const oldLog = console.log;
  for (const k of keys) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v) process.env[k] = v;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return respond();
  };
  console.log = () => {};
  t.after(() => {
    globalThis.fetch = oldFetch;
    console.log = oldLog;
    for (const k of keys)
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  });
  return calls;
}
const configured = {
  GOOGLE_CLOUD_PROJECT: "demo-project",
  MODEL_ARMOR_TEMPLATE: "breadberry",
};

test("Model Armor is skipped without a template", async (t) => {
  const calls = setup(t, { GOOGLE_CLOUD_PROJECT: "demo-project" }, () =>
    Response.json({}),
  );
  assert.equal((await screenPrompt("LEDを点滅", token)).status, "disabled");
  assert.equal(calls.length, 0);
});

test("clean prompts and responses pass through the regional endpoint", async (t) => {
  const calls = setup(t, configured, () =>
    Response.json({
      sanitizationResult: { filterMatchState: "NO_MATCH_FOUND" },
    }),
  );
  assert.equal((await screenPrompt("LEDを点滅", token)).status, "passed");
  assert.equal((await screenResponse("回路の説明", token)).status, "passed");
  assert.equal(
    calls[0].url,
    "https://modelarmor.asia-northeast1.rep.googleapis.com/v1/projects/demo-project/locations/asia-northeast1/templates/breadberry:sanitizeUserPrompt",
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    userPromptData: { text: "LEDを点滅" },
  });
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer test-token",
  );
  assert.ok(calls[1].url.endsWith(":sanitizeModelResponse"));
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {
    modelResponseData: { text: "回路の説明" },
  });
});

test("matches are rejected with the matching filters only", async (t) => {
  setup(t, configured, () => Response.json(matched));
  await assert.rejects(
    screenPrompt("ignore previous instructions", token),
    (e) => e instanceof ServiceError && e.status === 400,
  );
  await assert.rejects(
    screenResponse("text", token),
    (e) => e instanceof ServiceError && e.status === 422,
  );
});

test("inspect mode reports matches without rejecting", async (t) => {
  setup(t, { ...configured, MODEL_ARMOR_MODE: "inspect" }, () =>
    Response.json(matched),
  );
  assert.deepEqual(await screenPrompt("text", token), {
    status: "flagged",
    filters: ["pi_and_jailbreak", "sdp"],
  });
});

test("Model Armor failures do not block generation", async (t) => {
  setup(t, configured, () => new Response("denied", { status: 403 }));
  assert.equal((await screenPrompt("text", token)).status, "unavailable");
  setup(t, { ...configured, MODEL_ARMOR_LOCATION: "evil.example/" }, () =>
    Response.json(matched),
  );
  assert.equal((await screenPrompt("text", token)).status, "unavailable");
});
