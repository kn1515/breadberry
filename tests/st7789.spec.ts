import { test, expect } from "@playwright/test";

test("ST7789 can be previewed, selected, placed and reversed with all eight pins", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator(".parts-catalog").click();
  const dialog = page.getByRole("dialog", { name: "対応するセンサー・部品" });
  await dialog.getByLabel("対応部品を検索").fill("M154-240240-RGB");
  await expect(dialog.locator(".catalog-list li")).toHaveCount(1);
  await expect(dialog.locator("canvas")).toBeVisible();
  await expect(dialog.locator(".catalog-list")).toContainText(
    "GND / VCC / SCL / SDA / RES / DC / CS / BLK",
  );
  await dialog.getByRole("button", { name: /ST7789.*を選択/ }).click();
  await expect(page.getByLabel("作りたいもの")).toHaveValue(/ST7789/);
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByLabel("追加するパーツ").selectOption("st7789");
  await page.getByRole("button", { name: "パーツを追加", exact: true }).click();
  await page.getByLabel("配置する穴").selectOption("b12");
  await expect(page.locator(".editor-pins")).toContainText("GND: B12");
  await expect(page.locator(".editor-pins")).toContainText("BLK: B19");
  await page.getByRole("button", { name: "向きを反転", exact: true }).click();
  await expect(page.locator(".editor-pins")).toContainText("BLK: B5");
  await expect(page.locator('[data-part-label="P1"]')).toContainText("ST7789");
  expect(errors).toEqual([]);
});
