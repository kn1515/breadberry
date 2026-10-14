import type { Page } from "@playwright/test";

/**
 * Opens the ESP32 climate sample, the workspace's former initial project.
 * 3D pointer tests project fixed scene extents measured from this layout.
 */
export async function openEsp32Sample(page: Page) {
  await page.goto("/");
  await page.getByLabel("使用する基板").selectOption("esp32");
  await page.getByRole("button", { name: "サンプル", exact: true }).click();
  await page.getByRole("button", { name: "温湿度センサー", exact: true }).click();
}
