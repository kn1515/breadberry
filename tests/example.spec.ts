import { test, expect } from "@playwright/test";
test("workspace renders, steps play, views switch, and exports download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "お部屋の小さな気象台", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "前の工程", exact: true }).click();
  await expect(page.getByRole("slider", { name: "組み立て工程" })).toHaveValue(
    "11",
  );
  await page.getByRole("button", { name: "次の工程", exact: true }).click();
  await expect(page.getByRole("slider")).toHaveValue("12");
  await page
    .getByRole("button", { name: "組み立てを再生", exact: true })
    .click();
  await expect(page.getByRole("slider")).not.toHaveValue("12");
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByRole("tab", { name: "回路図", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "接続データから描画した回路図" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator("pre")).toContainText("dht.DHT22");
  const d = page.waitForEvent("download");
  await page.getByRole("button", { name: "エクスポート", exact: true }).click();
  expect((await d).suggestedFilename()).toBe("breadberry-circuit.json");
  const csv = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "部品リストをダウンロード", exact: true })
    .click();
  expect((await csv).suggestedFilename()).toBe("breadberry-parts.csv");
  expect(errors).toEqual([]);
});
test("sample selection, local save and reopen work without API credentials", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("使用する基板").selectOption("pico");
  await page.getByRole("button", { name: "サンプル", exact: true }).click();
  await page.getByRole("button", { name: "LEDブリンク", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "はじめての LED ブリンク", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("ブラウザに保存");
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.getByRole("button", { name: /はじめての LED ブリンク/ }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator("pre")).toContainText("Pin(14");
});
test("unconfigured services and API authorization are explicit", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("作りたいもの").fill("部屋の温度と湿度を測りたい");
  await page.getByRole("button", { name: "回路を修正", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("complementary", { name: "回路設計チャット", exact: true })
      .getByRole("alert"),
  ).toContainText("回路生成は現在利用できません。");
  const response = await request.post("/api/generate", {
    data: { prompt: "温湿度を測定する", board: "esp32" },
  });
  expect(response.status()).toBe(401);
  const invalid = await request.post("/api/session", {
    headers: { origin: "https://untrusted.example" },
    data: {},
  });
  expect(invalid.status()).toBe(403);
});
test("viewport does not overflow horizontally", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "お部屋の小さな気象台", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test("successful generation updates circuit and reports Firestore persistence", async ({
  page,
}) => {
  const { demoProject } = await import("../src/lib/demo");
  const project = demoProject("pico", "led");
  project.id = "test-generated";
  project.source = "gemini";
  project.storage = "firestore";
  project.circuit.title = "AIで作ったデスクライト";
  project.review = { status: "reviewed", text: "テスト用の補助レビュー" };
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        active: true,
        gemini: true,
        gmi: true,
        firestore: true,
        requiresAccessCode: false,
      },
    }),
  );
  await page.route("**/api/generate", (route) => {
    expect(route.request().postDataJSON().board).toBe("pico");
    return route.fulfill({ json: project });
  });
  await page.goto("/");
  await page.getByLabel("使用する基板").selectOption("pico");
  await page.getByLabel("作りたいもの").fill("PicoでLEDを点滅する回路を作って");
  await page.getByRole("button", { name: "回路を修正", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AIで作ったデスクライト", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "回路を生成し、保存しました。",
  );
  await expect(page.locator(".workspace-status")).toContainText("保存済み");
  await expect(page.getByRole("slider")).toHaveValue("5");
});

test("expanded catalog respects board capabilities", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator(".parts-catalog").click();
  const dialog = page.getByRole("dialog", { name: "対応するセンサー・部品" });
  await expect(dialog.locator(".catalog-list li")).toHaveCount(15);
  await expect(dialog.locator("canvas").first()).toBeVisible();
  await dialog.getByLabel("対応部品を検索").fill("BME280");
  await expect(dialog.locator(".catalog-list li")).toHaveCount(1);
  await dialog
    .getByRole("button", {
      name: "BME280 温湿度・気圧モジュールを選択",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("作りたいもの")).toHaveValue(/BME280/);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".parts-catalog")).toBeFocused();
  await page.getByLabel("使用する基板").selectOption("raspberry-pi");
  await page.locator(".parts-catalog").click();
  await expect(
    dialog.getByRole("button", { name: "可変抵抗を選択", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByLabel("使用する基板").selectOption("pico");
  await page.locator(".parts-catalog").click();
  await expect(
    dialog.getByRole("button", { name: "可変抵抗を選択", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

for (const [name, title, steps, code] of [
  ["OLEDディスプレイ", "OLEDにメッセージを表示", "5", "SSD1306_I2C"],
  ["DS18B20 温度計", "DS18B20でつくる温度計", "7", "ds18x20"],
]) {
  test(`${name}: sample renders, steps navigate and firmware matches`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("使用する基板").selectOption("pico");
    await page.getByRole("button", { name: "サンプル", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(
      page.getByRole("slider", { name: "組み立て工程" }),
    ).toHaveValue(steps);
    await page.getByRole("button", { name: "前の工程", exact: true }).click();
    await page.getByRole("button", { name: "次の工程", exact: true }).click();
    await page.getByRole("tab", { name: "コード", exact: true }).click();
    await expect(page.locator("pre")).toContainText(code);
    await page.getByRole("tab", { name: /ブレッドボード/ }).click();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });
}
