import { test, expect } from "@playwright/test";

test("guided tour highlights real controls, plays assembly and restores the view", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let generationCalls = 0;
  await page.route("**/api/generate", (route) => {
    generationCalls++;
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByLabel("作りたいもの").fill("入力中の内容を保持");
  await page.getByRole("tab", { name: "回路図", exact: true }).click();
  await page.getByRole("button", { name: "チュートリアルを開く" }).click();
  const tour = page.getByRole("region", { name: "操作チュートリアル" });
  await expect(tour).toBeVisible();
  const overlay = page.locator("body > .tour-overlay");
  await expect(overlay).toHaveCSS("position", "fixed");
  await expect(overlay).toHaveCSS("pointer-events", "none");
  await expect(tour).toHaveCSS("pointer-events", "auto");
  await expect.poll(async () => (await tour.boundingBox())?.y).toBeLessThan(32);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(async () => (await tour.boundingBox())?.y).toBeLessThan(32);
  await expect(tour).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-tour="samples"]')).toHaveClass(
    /tour-highlight/,
  );
  await tour.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByLabel("作りたいもの")).toHaveClass(/tour-highlight/);
  await tour.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-tour="catalog"]')).toHaveClass(
    /tour-highlight/,
  );
  await tour.getByRole("button", { name: "次へ" }).click();
  await expect(
    page.getByRole("button", { name: "一時停止", exact: true }),
  ).toHaveClass(/tour-highlight/);
  await expect(
    page.getByRole("slider", { name: "組み立て工程" }),
  ).not.toHaveValue("0", { timeout: 10000 });
  await tour.getByRole("button", { name: "次へ" }).click();
  await expect(
    page.getByRole("button", { name: "Editor · 編集", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await tour.getByRole("button", { name: "次へ" }).click();
  await expect(page.locator('[data-tour="download"]')).toHaveClass(
    /tour-highlight/,
  );
  await tour.getByRole("button", { name: "完了" }).click();
  await expect(tour).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
  await expect(page.locator(".tour-highlight")).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "回路図", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("作りたいもの")).toHaveValue(
    "入力中の内容を保持",
  );
  await expect(page.getByRole("slider", { name: "組み立て工程" })).toHaveValue(
    "12",
  );
  expect(generationCalls).toBe(0);
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "チュートリアルを開く" }).click();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "チュートリアルを開く" }),
  ).toBeFocused();
});

for (const initiallyActive of [false, true]) {
  test(`generation starts a session without connection settings (existing session: ${initiallyActive})`, async ({
    page,
  }) => {
    let active = initiallyActive;
    let starts = 0;
    let generations = 0;
    await page.route("**/api/session", async (route) => {
      if (route.request().method() === "POST") {
        starts++;
        expect(route.request().postDataJSON()).toEqual({});
        active = true;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: { active, gemini: true, requiresAccessCode: false },
      });
    });
    await page.route("**/api/generate", (route) => {
      expect(active).toBe(true);
      generations++;
      return route.fulfill({
        status: 503,
        json: { error: "回路生成は現在利用できません。" },
      });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /接続設定/ })).toHaveCount(0);
    await page.getByLabel("作りたいもの").fill("LEDを追加");
    await page.getByRole("button", { name: "回路を修正", exact: true }).click();
    await expect(
      page
        .getByRole("complementary", { name: "回路設計チャット", exact: true })
        .getByRole("alert"),
    ).toContainText("回路生成は現在利用できません。");
    expect(generations).toBe(1);
    expect(starts).toBe(initiallyActive ? 0 : 1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/Gemini|GMI Cloud/);
  });
}
