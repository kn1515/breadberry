import { test, expect } from "@playwright/test";
import { ledColorNames, ledColors, ledModelUrl } from "../src/lib/led";

test("LED color models load, can be placed, recolored and reopened", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const loaded = new Set<string>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/models/led/") && response.ok()) loaded.add(path);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await expect(page.getByLabel("8色のLEDモデルプレビュー")).toBeVisible();
  await expect.poll(() => loaded.size).toBe(8);
  for (const color of ledColorNames) {
    expect(loaded.has(ledModelUrl(color))).toBe(true);
    const button = page.getByRole("button", {
      name: `${ledColors[color].label}のLEDモデルを選択`,
      exact: true,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("追加するLEDの色")).toHaveValue(color);
  }
  await page
    .getByRole("button", { name: "赤のLEDモデルを選択", exact: true })
    .click();
  await page.getByRole("button", { name: "パーツを追加", exact: true }).click();
  await expect(page.getByLabel("LEDの色", { exact: true })).toHaveValue("red");
  await expect(page.locator('.parts-list [aria-label="赤 LED"]')).toBeVisible();
  await page.getByLabel("LEDの色", { exact: true }).selectOption("blue");
  await expect(page.locator('.parts-list [aria-label="青 LED"]')).toBeVisible();
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.getByLabel("LEDの色", { exact: true })).toHaveValue("red");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("breadberry-projects") || "[]",
          )[0]?.circuit.parts.at(-1)?.ledColor,
      ),
    )
    .toBe("blue");
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.locator(".saved-list button").first().click();
  await expect(page.locator('.parts-list [aria-label="青 LED"]')).toBeVisible();
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByLabel("編集する部品").selectOption("P1");
  await expect(page.getByLabel("LEDの色", { exact: true })).toHaveValue("blue");
  expect(errors).toEqual([]);
});
