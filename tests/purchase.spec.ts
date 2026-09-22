import { test, expect } from "@playwright/test";

const offer = {
  partNumber: "TEST-LED-ND",
  manufacturerPartNumber: "TEST-LED",
  manufacturer: "Test manufacturer",
  description: "Green through-hole LED",
  url: "https://www.digikey.jp/ja/products/detail/test/1",
  packaging: "Bulk",
  stock: 100,
  minimum: 5,
  maximum: null,
  prices: [
    { quantity: 1, unitPrice: 20 },
    { quantity: 10, unitPrice: 15 },
  ],
};

test("purchase modal selects products and POSTs combined quantities to FastAdd", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true } }),
  );
  const queries: string[] = [];
  await page.route("**/api/purchase/search", (r) => {
    queries.push(r.request().postDataJSON().query);
    return r.fulfill({ json: { offers: [offer], sandbox: false } });
  });
  // Intercept the popup at browser-context level: never contact the real cart.
  let cartBody = "";
  await context.route(
    "https://www.digikey.com/classic/ordering/fastadd.aspx**",
    async (r) => {
      expect(r.request().method()).toBe("POST");
      expect(new URL(r.request().url()).searchParams.get("newcart")).toBe(
        "false",
      );
      cartBody = r.request().postData() || "";
      await r.fulfill({ contentType: "text/html", body: "<h1>Mock cart</h1>" });
    },
  );
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "購入する", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  await expect(dialog).toBeVisible();
  const buy = dialog.getByRole("button", {
    name: "購入する · DigiKeyのカートへ",
  });
  await expect(buy).toBeDisabled();
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(queries.length).toBeGreaterThan(3);
  expect(queries.some((q) => q.includes("LED green"))).toBe(true);
  const selects = dialog.locator("select");
  await selects.nth(0).selectOption(offer.partNumber);
  await selects.nth(1).selectOption(offer.partNumber);
  await expect(dialog).toContainText("1 商品を選択 · ￥150");
  // A valid combined quantity must not conceal an invalid individual row.
  await dialog.locator('input[type="number"]').first().fill("0");
  await expect(buy).toBeDisabled();
  await dialog.locator('input[type="number"]').first().fill("101");
  await expect(buy).toBeDisabled();
  await dialog.locator('input[type="number"]').first().fill("5");
  await expect(buy).toBeEnabled();
  const popup = context.waitForEvent("page");
  await buy.click();
  const cart = await popup;
  await expect.poll(() => cartBody).not.toBe("");
  const body = new URLSearchParams(cartBody);
  expect(body.get("part1")).toBe(offer.partNumber);
  expect(body.get("qty1")).toBe("10");
  expect(body.has("part2")).toBe(false);
  await expect(buy).toBeDisabled();
  await cart.close();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test("missing configuration and session are actionable without searching", async ({
  page,
}) => {
  let searches = 0;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: false, digikey: false } }),
  );
  await page.route("**/api/purchase/search", (r) => {
    searches++;
    return r.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  await expect(dialog).toContainText("準備中");
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeDisabled();
  expect(searches).toBe(0);
  await dialog.getByRole("button", { name: "接続設定を開く" }).click();
  await expect(
    page.getByRole("dialog", { name: "AIとの接続を、準備しよう。" }),
  ).toBeVisible();
});

test("failed searches can retry, empty results are explicit, sandbox cannot reach cart", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true } }),
  );
  let response: "error" | "empty" | "sandbox" = "error";
  await page.route("**/api/purchase/search", (r) =>
    r.fulfill(
      response === "error"
        ? { status: 429, json: { error: "検索上限に達しました。" } }
        : {
            json: {
              offers: response === "empty" ? [] : [offer],
              sandbox: response === "sandbox",
            },
          },
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  const row = dialog.locator(".purchase-row").first();
  await expect(row.getByRole("alert")).toContainText("検索上限");
  response = "empty";
  await row.getByRole("button", { name: "再検索" }).click();
  await expect(row).toContainText("候補が見つかりません");
  response = "sandbox";
  await row.getByRole("button", { name: "再検索" }).click();
  await row.locator("select").selectOption(offer.partNumber);
  await expect(dialog).toContainText("テスト用の商品情報");
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeDisabled();
});

test("search API rejects unauthenticated and cross-origin requests", async ({
  request,
}) => {
  const denied = await request.post("/api/purchase/search", {
    data: { query: "LED" },
  });
  expect(denied.status()).toBe(401);
  const foreign = await request.post("/api/purchase/search", {
    headers: { origin: "https://evil.example" },
    data: { query: "LED" },
  });
  expect(foreign.status()).toBe(403);
});
