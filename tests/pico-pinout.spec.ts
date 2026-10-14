import { expect, test } from "@playwright/test";

test("Pico H shows every physical pin and distinct GPIO numbers", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("使用する基板").selectOption("pico");
  await page.getByRole("button", { name: "サンプル", exact: true }).click();
  await page.getByRole("button", { name: "LEDブリンク", exact: true }).click();
  await expect(page.locator("[data-physical-pin]")).toHaveCount(40, {
    timeout: 30000,
  });
  for (const [number, label] of [
    [1, "GP0"],
    [19, "GP14"],
    [21, "GP16"],
    [29, "GP22"],
    [33, "AGND"],
    [36, "3V3(OUT)"],
    [40, "VBUS"],
  ] as const) {
    await expect(page.locator(`[data-physical-pin="${number}"]`)).toHaveText(
      `${label}pin ${number}`,
    );
  }
  await expect(page.locator('[data-physical-pin="19"]')).toHaveAttribute(
    "data-pin-wired",
    "true",
  );
  await expect(page.locator('[data-physical-pin="18"]')).toHaveAttribute(
    "data-pin-wired",
    "false",
  );
  await page.getByRole("button", { name: "真上から表示", exact: true }).click();
  await expect(page.locator('[data-physical-pin="19"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("pico-top.png") });
});
