import { test } from "node:test";
import assert from "node:assert/strict";
import { responseError } from "../../src/lib/api-error";

const html = (status: number) =>
  new Response("<!doctype html><title>blocked</title>", {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });

test("API errors keep the server message", async () => {
  const res = Response.json({ error: "本日の生成回数の上限に達しました。" }, { status: 429 });
  assert.equal((await responseError(res, "失敗")).message, "本日の生成回数の上限に達しました。");
});

test("HTML pages from the edge do not surface JSON parse errors", async () => {
  assert.match((await responseError(html(403), "失敗")).message, /セキュリティ検査/);
  assert.match((await responseError(html(429), "失敗")).message, /リクエストが集中/);
  assert.equal((await responseError(html(502), "失敗")).message, "失敗");
});
