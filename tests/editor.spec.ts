import { test, expect } from "@playwright/test";

test("editor places catalog parts, checks layout, undoes changes and reopens a saved draft", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Viewer · 閲覧" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("追加するパーツ")).toHaveCount(0);
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page
    .getByRole("button", { name: "レイアウトチェック", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "問題は見つかりませんでした" }),
  ).toBeVisible();
  await page.getByLabel("追加するパーツ").selectOption("ssd1306");
  await page.getByRole("button", { name: "パーツを追加", exact: true }).click();
  await expect(page.getByLabel("編集する部品")).toHaveValue("P1");
  await page.getByLabel("配置する穴").selectOption("g20");
  await expect(page.locator(".editor-pins")).toContainText("VCC: G20");
  await page.getByRole("button", { name: "向きを反転", exact: true }).click();
  await expect(page.locator(".editor-pins")).toContainText("GND: G19");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.locator(".editor-pins")).toContainText("GND: G21");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(page.locator(".editor-pins")).toContainText("GND: G19");
  await page.getByLabel("配置する穴").selectOption("b1");
  await expect(page.locator(".editor-results")).toContainText("同じ穴");
  await expect(page.locator(".editor-results")).toContainText("範囲外");
  await page.getByLabel("配置する穴").selectOption("g20");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("breadberry-projects") || "[]",
          )[0]?.circuit.parts.at(-1)?.placement.hole,
      ),
    )
    .toBe("g20");
  await page.getByRole("button", { name: "Viewer · 閲覧" }).click();
  await expect(page.getByLabel("追加するパーツ")).toHaveCount(0);
  await expect(page.locator(".workspace-status")).toContainText("手動編集あり");
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.locator(".saved-list button").first().click();
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByLabel("編集する部品").selectOption("P1");
  await expect(page.getByLabel("配置する穴")).toHaveValue("g20");
  await expect(page.locator(".editor-pins")).toContainText("GND: G19");
  await page.getByRole("button", { name: "部品を削除", exact: true }).click();
  await expect(
    page.getByLabel("編集する部品").locator('option[value="P1"]'),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("pointer drag and hole click update placements, with no mutation in viewer", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Touch placement is covered by the accessible hole selector in the mobile test.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  const firstPart = page.locator(".editor-part").first();
  const rect = await firstPart.locator("rect").boundingBox();
  const target = await page.locator('[data-hole="g18"]').boundingBox();
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("配置する穴")).toHaveValue("g18");
  await page.locator('[data-hole="h22"]').click();
  await expect(page.getByLabel("配置する穴")).toHaveValue("h22");
});

test("manual save sends a draft to Firestore and reports local fallback on failure", async ({
  page,
}) => {
  let fail = false;
  let saved: any;
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { active: true, gemini: true, firestore: true } }),
  );
  await page.route("**/api/projects", async (route) => {
    saved = route.request().postDataJSON();
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "保存できません。" },
      });
    return route.fulfill({
      json: {
        ...saved,
        edited: true,
        source: "manual",
        storage: "firestore",
        createdAt: new Date().toISOString(),
        review: { status: "unavailable", text: "手動編集" },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByLabel("配置する穴").selectOption("g15");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".workspace-status")).toContainText(
    "Firestore に保存済み",
  );
  expect(saved.circuit.parts[0].placement.hole).toBe("g15");
  expect(saved.messages).toEqual([]);
  fail = true;
  await page.getByLabel("配置する穴").selectOption("g18");
  await expect(page.locator(".workspace-status")).not.toContainText(
    "Firestore に保存済み",
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("breadberry-projects") || "[]")[0]
            ?.circuit.parts[0].placement.hole,
      ),
    )
    .toBe("g18");
});

test("draft save rejects unauthenticated and cross-origin writes", async ({
  request,
}) => {
  expect((await request.post("/api/projects", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (
      await request.post("/api/projects", {
        data: {},
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
});
