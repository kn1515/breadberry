import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        active: true,
        gemini: true,
        firestore: true,
        gmi: false,
        digikey: false,
      },
    }),
  );
});

test("auto build sits after code and explains unsupported browsers", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "serial", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await expect(
    page.locator(".canvas-toolbar .view-tabs + .serial-launch"),
  ).toHaveText("自動ビルド");
  await page.getByRole("button", { name: "自動ビルド", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Web Serialに対応した/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "接続してビルド・実行" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("compile failure runs AI analysis, correction rebuilds once, and closes unlocked ports", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let attempts = 0;
    const state = { closed: 0, writes: [] as string[], requests: 0 };
    (window as any).__serial = state;
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          state.requests++;
          attempts++;
          const fail = attempts === 1;
          let receiver: ReadableStreamDefaultController<Uint8Array>;
          let source = "";
          const port = {
            readable: new ReadableStream<Uint8Array>({
              start(c) {
                receiver = c;
              },
            }),
            writable: new WritableStream<Uint8Array>({
              write(bytes) {
                const text = new TextDecoder().decode(bytes);
                const send = (value: string) =>
                  receiver.enqueue(new TextEncoder().encode(value));
                if (text === "\r\x03\x03\x01")
                  send("raw REPL; CTRL-B to exit\r\n>");
                else if (text === "\x04") {
                  state.writes.push(source);
                  const stdout = source.includes("sys.implementation")
                    ? "micropython:rp2\r\n"
                    : source.includes("exec(compile")
                      ? "fixed and running\n"
                      : "";
                  const stderr =
                    fail && source.includes("__bb_code = compile")
                      ? "SyntaxError: invalid syntax\n"
                      : "";
                  source = "";
                  send(`OK${stdout}\x04${stderr}\x04>`);
                } else source += text;
              },
            }),
            async open() {},
            async close() {
              if (port.readable.locked || port.writable.locked)
                throw new Error("Port is locked");
              state.closed++;
            },
          };
          return port;
        },
      },
    });
  });
  let sent: any;
  await page.route("**/api/firmware/analyze", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      json: {
        cause: "構文エラーです。",
        steps: ["構文を修正して再実行してください。"],
        firmware: "print('fixed and running')",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "自動ビルド", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(
    dialog.getByText("構文エラーです。", { exact: true }),
  ).toBeVisible();
  expect(sent.stage).toBe("compiling");
  expect(sent.log).toContain("SyntaxError");
  expect(sent.circuit.firmware).toBeTruthy();
  expect(await page.evaluate(() => (window as any).__serial.requests)).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as any).__serial.writes.some((x: string) =>
        x.includes("os.rename"),
      ),
    ),
  ).toBe(false);
  await dialog.getByText("修正コードを確認", { exact: true }).click();
  await expect(
    dialog.getByText("print('fixed and running')", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "修正を反映して再ビルド・実行" })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    "ビルド・保存・プログラムの実行が完了しました。",
  );
  expect(await page.evaluate(() => (window as any).__serial.closed)).toBe(2);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).toHaveText(
    "print('fixed and running')",
  );
});
