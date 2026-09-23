import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { checkOrigin } from "../../src/lib/server";

test("local servers accept loopback origins on other ports", () => {
  const request = new NextRequest("http://localhost:3000/api/session", {
    headers: { origin: "http://localhost:3001" },
  });
  assert.doesNotThrow(() => checkOrigin(request));
});

test("local servers reject non-loopback origins", () => {
  const request = new NextRequest("http://localhost:3000/api/session", {
    headers: { origin: "https://untrusted.example" },
  });
  assert.throws(() => checkOrigin(request), /操作できません/);
});