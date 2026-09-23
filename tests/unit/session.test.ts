import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET, POST } from "../../src/app/api/session/route";
import { owner } from "../../src/lib/server";

const origin = "https://breadberry-test.a.run.app";
const keys = ["NODE_ENV", "SESSION_SECRET", "APP_ACCESS_TOKEN", "APP_ORIGIN"];
let previous: Record<string, string | undefined>;

beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NODE_ENV: "production",
    SESSION_SECRET: "unit-test-session-signing-secret-at-least-32-characters",
    APP_ORIGIN: origin,
  });
});
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function request(options: { cookie?: string; from?: string } = {}) {
  return new NextRequest(`${origin}/api/session`, {
    method: "POST",
    headers: {
      origin: options.from ?? origin,
      "Content-Type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify({}),
  });
}

for (const legacyToken of [undefined, "legacy-deployed-access-code"]) {
  test(`cloud sessions need no access code (legacy token: ${!!legacyToken})`, async () => {
    if (legacyToken) process.env.APP_ACCESS_TOKEN = legacyToken;
    else delete process.env.APP_ACCESS_TOKEN;
    const config = await GET(new NextRequest(`${origin}/api/session`));
    assert.equal(config.headers.get("Cache-Control"), "no-store");
    assert.equal((await config.json()).requiresAccessCode, false);

    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const cookie = response.cookies.get("bb_session");
    assert.ok(cookie);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    const authenticated = request({ cookie: `bb_session=${cookie.value}` });
    assert.ok(owner(authenticated));
    assert.equal((await (await GET(authenticated)).json()).active, true);

    // Starting again must preserve the owner of saved projects and quotas.
    const resumed = await POST(authenticated);
    assert.equal(resumed.status, 200);
    assert.equal(resumed.headers.get("set-cookie"), null);
  });
}

test("cloud sessions still reject an unrelated origin", async () => {
  const response = await POST(request({ from: "https://untrusted.example" }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("cloud sessions still require a signing secret", async () => {
  delete process.env.SESSION_SECRET;
  const response = await POST(request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
});
