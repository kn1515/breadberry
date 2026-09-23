import { test, expect } from "@playwright/test";

const config = {
  active: true,
  gemini: true,
  firestore: true,
  gmi: false,
  digikey: false,
  requiresAccessCode: false,
};
test.beforeEach(async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: config }),
  );
});

test("header switches theme and language, preserves edits and restores preferences", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "作りたいもの" })
    .fill("keep my prompt");
  await page.getByRole("button", { name: "ホワイトテーマに切り替え" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 247, 251)",
  );
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("textbox", { name: "What would you like to build?" }),
  ).toHaveValue("keep my prompt");
  await expect(page.getByText("Parts library", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little weather station" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("button", { name: "Open tutorial", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Start with a circuit." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close tutorial" }).click();
  await page.locator(".parts-purchase").click();
  await expect(page.getByRole("dialog")).toContainText(
    "DigiKey search is not configured",
  );
  await page.getByRole("button", { name: "Close purchase list" }).click();
  await page
    .getByRole("button", { name: "Editor · Edit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Check layout", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "日本語に切り替え" }).click();
  await expect(
    page.getByRole("button", { name: "レイアウトチェック", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("English generation requests retain the selected language and circuit", async ({
  page,
}) => {
  let request: any;
  await page.route("**/api/generate", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({
      status: 503,
      json: { error: "Generation temporarily unavailable" },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page
    .getByRole("textbox", { name: "What would you like to build?" })
    .fill("Use a blue LED");
  await page
    .getByRole("button", { name: "Revise circuit", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Generation temporarily unavailable",
  );
  expect(request.locale).toBe("en");
  expect(request.context.circuit.board).toBe("esp32");
});

test("invalid storage and unavailable storage do not break the controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("breadberry-preferences", "broken");
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
