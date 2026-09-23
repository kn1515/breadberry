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
    const body = r.request().postDataJSON();
    expect(body.circuit.board).toBe("esp32");
    expect(body.partId).toMatch(/^bom-/);
    return r.fulfill({
      json: {
        offers: [offer],
        sandbox: false,
        recommendation: {
          partNumber: ["bom-0", "bom-1"].includes(body.partId)
            ? offer.partNumber
            : null,
          reason: "テスト用の選定理由",
        },
      },
    });
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
  const panel = page.locator(".parts-panel");
  await expect(
    panel.getByRole("button", { name: "購入する", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".activity-bar")
      .getByRole("button", { name: "購入する", exact: true }),
  ).toHaveCount(0);
  await expect(panel.locator(".parts-catalog")).toHaveCount(1);
  expect(
    await trigger.evaluate((el) => el.previousElementSibling?.textContent),
  ).toContain("部品リストをダウンロード");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  await expect(dialog).toBeVisible();
  const buy = dialog.getByRole("button", {
    name: "購入する · DigiKeyのカートへ",
  });
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(queries.length).toBeGreaterThan(3);
  expect(queries.some((q) => q.includes("LED green"))).toBe(true);
  await dialog.locator(".purchase-details > summary").click();
  const selects = dialog.locator("select");
  await expect(selects.nth(0)).toHaveValue(offer.partNumber);
  await expect(selects.nth(1)).toHaveValue(offer.partNumber);
  await expect(selects.nth(2)).toHaveValue("");
  await selects.nth(1).selectOption("");
  await expect(selects.nth(1)).toHaveValue("");
  await selects.nth(1).selectOption(offer.partNumber);
  await expect(dialog).toContainText("テスト用の選定理由");
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
    r.fulfill({ json: { active: true, digikey: false } }),
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
  await expect(page.getByRole("button", { name: /接続設定/ })).toHaveCount(0);
  await expect(dialog).not.toContainText(/Gemini|GMI/);
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
  await dialog.locator(".purchase-details > summary").click();
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

const bestProduct = {
  store: "amazon",
  name: "ESP32 開発ボード（ヘッダー付き）",
  url: "https://www.amazon.co.jp/dp/B012345678",
  quantity: 1,
  unitsPerPack: 1,
  totalPrice: 980,
  reason: "必要な仕様を満たす少量の商品です。",
  checks: "販売元と送料を確認してください。",
  stockEvidence: "在庫あり",
  checkedAt: "2026-09-24T00:00:00.000Z",
};

test("best products from Amazon and DigiKey appear first, sold-out offers disappear and re-search replaces recommendations", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true, gemini: true } }),
  );
  let mode: "mixed" | "empty" | "sandbox" = "mixed";
  await page.route("**/api/purchase/search", (r) => {
    const { partId } = r.request().postDataJSON();
    const selected = partId === "bom-1";
    return r.fulfill({
      json: {
        offers: [
          offer,
          {
            ...offer,
            partNumber: "SOLD-OUT",
            manufacturerPartNumber: "売り切れ商品",
            stock: 0,
          },
        ],
        sandbox: mode === "sandbox",
        recommendation: {
          partNumber: mode === "mixed" && selected ? offer.partNumber : null,
          reason:
            mode === "mixed"
              ? "比較しました。"
              : "在庫と適合性を確認できる商品が見つかりませんでした。再検索してください。",
          best:
            mode === "mixed" && ["bom-0", "bom-1"].includes(partId)
              ? {
                  ...bestProduct,
                  ...(selected
                    ? {
                        store: "digikey",
                        name: offer.manufacturerPartNumber,
                        url: offer.url,
                        quantity: 5,
                        totalPrice: 100,
                      }
                    : {}),
                }
              : null,
          searchSuggestions:
            partId === "bom-0" ? "<div>Google Search</div>" : "",
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  const best = dialog.getByRole("region", { name: "おすすめ購入リスト" });
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(best.locator(".purchase-best")).toHaveCount(2);
  await expect(
    best.getByRole("link", { name: bestProduct.name }),
  ).toHaveAttribute("href", bestProduct.url);
  await expect(
    best.getByRole("link", { name: offer.manufacturerPartNumber }),
  ).toHaveAttribute("href", offer.url);
  await expect(best).toContainText("Amazon.co.jp");
  await expect(best).toContainText("DigiKey");
  await expect(best).toContainText("注文数 1 × 1個入り（必要数 1）");
  await expect(best).toContainText("在庫あり");
  await expect(best.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-popups allow-popups-to-escape-sandbox",
  );
  expect(
    await best.evaluate(
      (el) =>
        !!(
          el.compareDocumentPosition(
            el.parentElement!.querySelector(".purchase-details")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await expect(dialog.locator(".purchase-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await dialog.locator(".purchase-details > summary").click();
  const row = dialog.locator(".purchase-row").first();
  await expect(row.locator("select")).toHaveValue(""); // Amazon never enters FastAdd.
  await expect(
    dialog.getByRole("option", { name: /売り切れ商品/ }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /売り切れ商品/ })).toHaveCount(
    0,
  );
  await expect(dialog.locator('input[name^="part"]')).toHaveCount(1);
  mode = "empty";
  await row.getByRole("button", { name: "再検索" }).click();
  await expect(best.getByRole("link", { name: bestProduct.name })).toHaveCount(
    0,
  );
  await expect(best.locator(".purchase-best")).toHaveCount(1);
  mode = "sandbox";
  await dialog
    .locator(".purchase-row")
    .nth(1)
    .getByRole("button", { name: "再検索" })
    .click();
  await expect(best.locator(".purchase-best")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeDisabled();
});

test("Gemini store recommendations work without DigiKey configuration", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: false, gemini: true } }),
  );
  await page.route("**/api/purchase/search", (r) =>
    r.fulfill({
      json: {
        offers: [],
        sandbox: false,
        recommendation: {
          partNumber: null,
          reason: bestProduct.reason,
          best:
            r.request().postDataJSON().partId === "bom-0" ? bestProduct : null,
          searchSuggestions: "",
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "部品を購入する" });
  await expect(
    dialog.getByRole("link", { name: bestProduct.name }),
  ).toBeVisible();
  await expect(dialog).not.toContainText("準備中");
  await expect(dialog.locator('input[name^="part"]')).toHaveCount(0);
});

test("stop and retry unfinished parts preserves completed products and permits a partial cart", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true, gemini: true } }),
  );
  const counts = new Map<string, number>();
  let retry = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/purchase/search", async (r) => {
    const { partId } = r.request().postDataJSON();
    counts.set(partId, (counts.get(partId) ?? 0) + 1);
    if (partId !== "bom-0" && !retry) await gate;
    await r
      .fulfill({
        json: {
          offers: [offer],
          sandbox: false,
          recommendation: {
            partNumber: partId === "bom-0" ? offer.partNumber : null,
            best: partId === "bom-0" ? bestProduct : null,
            reason: "確認済み",
            searchSuggestions: "",
          },
        },
      })
      .catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".purchase-best")).toHaveCount(1);
  await expect(
    dialog.getByText("順番待ち", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "検索を中止", exact: true }).click();
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".purchase-best")).toHaveCount(1);
  retry = true;
  release();
  await dialog
    .getByRole("button", { name: "未完了の部品を再試行", exact: true })
    .click();
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".purchase-search-progress > li")).toHaveCount(0);
  expect(counts.get("bom-0")).toBe(1);
  await expect(dialog.locator(".purchase-best")).toHaveCount(1);
});

test("streamed offers are usable while AI runs and its result preserves a manual selection", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true, gemini: true } }),
  );
  await page.goto("/");
  await page.evaluate(
    ({ offer }) => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        if (String(input) !== "/api/purchase/search")
          return original(input, init);
        const { partId } = JSON.parse(String(init?.body));
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(controller) {
              const send = (value: unknown) =>
                controller.enqueue(
                  encoder.encode(JSON.stringify(value) + "\n"),
                );
              send({ type: "phase", phase: "verification" });
              if (partId === "bom-0") {
                send({
                  type: "offers",
                  search: { offers: [offer], sandbox: false },
                });
                (window as any).finishPurchase = () => {
                  send({
                    type: "result",
                    result: {
                      offers: [offer],
                      sandbox: false,
                      recommendation: {
                        partNumber: null,
                        best: null,
                        reason: "確認済み",
                        searchSuggestions: "",
                      },
                    },
                  });
                  controller.close();
                };
              }
            },
          }),
          { headers: { "content-type": "application/x-ndjson" } },
        );
      };
    },
    { offer },
  );
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("在庫・仕様を確認中…", { exact: true }).first(),
  ).toBeVisible();
  await expect(dialog.getByText(/DigiKeyの候補 1件を取得済み/)).toBeVisible();
  await dialog.locator(".purchase-details > summary").click();
  const row = dialog.locator(".purchase-row").first();
  await row.locator("select").selectOption(offer.partNumber);
  await row.locator('input[type="number"]').fill("7");
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeEnabled();
  await page.evaluate(() => (window as any).finishPurchase());
  await expect(row).toContainText("確認済み");
  await expect(row.locator("select")).toHaveValue(offer.partNumber);
  await expect(row.locator('input[type="number"]')).toHaveValue("7");
  await dialog.getByRole("button", { name: "検索を中止", exact: true }).click();
  await expect(row.locator("select")).toHaveValue(offer.partNumber);
});

test("an unresponsive search ends at the batch deadline and leaves queued parts retryable", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true } }),
  );
  let searches = 0;
  await page.route("**/api/purchase/search", () => {
    searches++;
  });
  await page.goto("/");
  await page.clock.install();
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  await expect.poll(() => searches).toBe(3);
  await page.clock.fastForward(91000);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "検索を中止", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "未完了の部品を再試行", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(dialog.locator(".purchase-search-progress")).toContainText(
    "待ち時間が長いため",
  );
  expect(searches).toBe(3);
});

test("DigiKey quota notice does not block verified products from other stores", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { active: true, digikey: true, gemini: true } }),
  );
  await page.route("**/api/purchase/search", (r) => {
    const { partId } = r.request().postDataJSON();
    const search = { offers: [], sandbox: false, digikeyLimited: true };
    return r.fulfill({
      contentType: "application/x-ndjson",
      body:
        [
          { type: "phase", phase: "digikey" },
          { type: "offers", search },
          { type: "phase", phase: "discovery" },
          {
            type: "result",
            result: {
              ...search,
              recommendation: {
                partNumber: null,
                best: partId === "bom-0" ? bestProduct : null,
                reason: "他ショップで確認しました。",
                searchSuggestions: "",
              },
            },
          },
        ]
          .map((event) => JSON.stringify(event))
          .join("\n") + "\n",
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "購入する", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".purchase-list")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const notice = dialog.getByText(
    "DigiKeyは検索上限に達したため、今回の検索対象から外しています。ほかのショップは引き続き検索できます。",
    { exact: true },
  );
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(1);
  await expect(
    dialog.getByRole("link", { name: bestProduct.name }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "未完了の部品を再試行", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "購入する · DigiKeyのカートへ" }),
  ).toBeDisabled();
});
