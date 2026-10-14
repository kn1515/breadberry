import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60_000);

// Reopening the same authorized port creates fresh streams, as Web Serial does.
async function mockBoard(page: Page, failures = 0, running = false) {
  await page.addInitScript(
    ({ failures, running }) => {
      const state = {
        opens: 0,
        closed: 0,
        requests: 0,
        writes: [] as string[],
      };
      (window as any).__repairSerial = state;
      let receiver: ReadableStreamDefaultController<Uint8Array>;
      let source = "";
      const port = {
        readable: null as ReadableStream<Uint8Array> | null,
        writable: null as WritableStream<Uint8Array> | null,
        async open() {
          state.opens++;
          source = "";
          port.readable = new ReadableStream({
            start(c) {
              receiver = c;
            },
          });
          port.writable = new WritableStream({
            write(bytes) {
              const text = new TextDecoder().decode(bytes);
              const send = (s: string) =>
                receiver.enqueue(new TextEncoder().encode(s));
              if (text === "\r\x03\x03\x01")
                send("raw REPL; CTRL-B to exit\r\n>");
              else if (text === "\x04") {
                state.writes.push(source);
                const command = source;
                source = "";
                if (
                  command.includes("exec(compile") &&
                  running &&
                  state.opens === 1
                ) {
                  send("OKLED running\n");
                  return;
                }
                const stdout = command.includes("sys.implementation")
                  ? "micropython:esp32\r\n"
                  : command.includes("exec(compile")
                    ? "completed\n"
                    : "";
                const stderr =
                  command.includes("__bb_code = compile") &&
                  state.opens <= failures
                    ? "SyntaxError: invalid syntax\n"
                    : "";
                send(`OK${stdout}\x04${stderr}\x04>`);
              } else source += text;
            },
          });
        },
        async close() {
          if (port.readable?.locked || port.writable?.locked)
            throw new Error("Port is locked");
          state.closed++;
        },
      };
      Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: {
          async requestPort() {
            state.requests++;
            return port;
          },
        },
      });
    },
    { failures, running },
  );
}

async function openBuild(page: Page) {
  await page.goto("/");
  await page.getByLabel("使用する基板").selectOption("esp32");
  await page.getByRole("button", { name: "サンプル", exact: true }).click();
  await page.getByRole("button", { name: "LEDブリンク", exact: true }).click();
  await page.getByRole("button", { name: "自動ビルド", exact: true }).click();
  return page.getByRole("dialog");
}

const correction = {
  cause: "点滅間隔を修正します。",
  steps: ["再実行して動作を確認してください。"],
  firmware: "print('fixed')",
};

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

test("automatic repair reuses the authorized port and updates the editor", async ({
  page,
}) => {
  await mockBoard(page, 1);
  const inputs: any[] = [];
  await page.route("**/api/firmware/analyze", (route) => {
    inputs.push(route.request().postDataJSON());
    return route.fulfill({ json: correction });
  });
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(dialog.locator(".serial-status")).toHaveText(
    "ビルド・保存・プログラムの実行が完了しました。",
  );
  expect(inputs).toHaveLength(1);
  expect(inputs[0].log).toContain("SyntaxError");
  expect(
    await page.evaluate(() => (window as any).__repairSerial),
  ).toMatchObject({ requests: 1, opens: 2, closed: 2 });
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).toHaveText(correction.firmware);
});

test("automatic repair stops after three corrections", async ({ page }) => {
  await mockBoard(page, 10);
  let analyses = 0;
  await page.route("**/api/firmware/analyze", (route) =>
    route.fulfill({
      json: { ...correction, firmware: `print(${++analyses})` },
    }),
  );
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(
    dialog.getByText(
      "自動修復を停止しました。修正案とログを確認してください。",
    ),
  ).toBeVisible();
  expect(analyses).toBe(4);
  expect(
    await page.evaluate(() => (window as any).__repairSerial),
  ).toMatchObject({ requests: 1, opens: 4, closed: 4 });
});

test("feedback after a successful build waits for approval and can be rejected", async ({
  page,
}) => {
  await mockBoard(page);
  let input: any;
  await page.route("**/api/firmware/analyze", (route) => {
    input = route.request().postDataJSON();
    return route.fulfill({ json: correction });
  });
  const dialog = await openBuild(page);
  await expect(dialog.getByLabel("AIによるコード変更")).toHaveValue("confirm");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(dialog.locator(".serial-status")).toHaveText(
    "ビルド・保存・プログラムの実行が完了しました。",
  );
  await dialog
    .getByLabel("動作のフィードバック")
    .fill("LEDを1秒間隔で点滅させてください。");
  await dialog
    .getByRole("button", { name: "フィードバックから修正案を作成" })
    .click();
  await expect(
    dialog.getByText("この修正コードを反映してよいですか？"),
  ).toBeVisible();
  expect(input.feedback).toBe("LEDを1秒間隔で点滅させてください。");
  expect(input.log).toContain("completed");
  expect(await page.evaluate(() => (window as any).__repairSerial.opens)).toBe(
    1,
  );
  await dialog.getByRole("button", { name: "変更しない", exact: true }).click();
  await expect(
    dialog.getByText("この修正コードを反映してよいですか？"),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).toHaveText(
    input.circuit.firmware,
  );
});

test("feedback during runtime releases the monitor and automatically rebuilds", async ({
  page,
}) => {
  await mockBoard(page, 0, true);
  let input: any;
  await page.route("**/api/firmware/analyze", (route) => {
    input = route.request().postDataJSON();
    return route.fulfill({ json: correction });
  });
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(dialog.getByLabel("ビルド・実行ログ")).toContainText(
    "LED running",
  );
  await dialog.getByLabel("動作のフィードバック").fill("点滅が速すぎます。");
  await dialog
    .getByRole("button", { name: "フィードバックから修正案を作成" })
    .click();
  await expect(dialog.locator(".serial-status")).toHaveText(
    "ビルド・保存・プログラムの実行が完了しました。",
  );
  expect(input.stage).toBe("running");
  expect(input.log).toContain("LED running");
  expect(input.feedback).toBe("点滅が速すぎます。");
  expect(
    await page.evaluate(() => (window as any).__repairSerial),
  ).toMatchObject({ requests: 1, opens: 2, closed: 2 });
});

test("feedback without a port can update code without opening a USB picker", async ({
  page,
}) => {
  await mockBoard(page);
  await page.route("**/api/firmware/analyze", (route) =>
    route.fulfill({ json: correction }),
  );
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByLabel("動作のフィードバック").fill("点滅が速すぎます。");
  await dialog
    .getByRole("button", { name: "フィードバックから修正案を作成" })
    .click();
  await expect(
    dialog.getByText(
      "修正コードを反映しました。接続してビルド・実行してください。",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).__repairSerial.requests),
  ).toBe(0);
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).toHaveText(correction.firmware);
});

test("closing during AI analysis prevents a late automatic code change", async ({
  page,
}) => {
  await mockBoard(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received!: () => void;
  const requested = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route("**/api/firmware/analyze", async (route) => {
    received();
    await pending;
    await route.fulfill({ json: correction });
  });
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByLabel("動作のフィードバック").fill("点滅が速すぎます。");
  await dialog
    .getByRole("button", { name: "フィードバックから修正案を作成" })
    .click();
  await requested;
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  release();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).not.toHaveText(
    correction.firmware,
  );
  expect(
    await page.evaluate(() => (window as any).__repairSerial.requests),
  ).toBe(0);
});

test("automatic mode leaves code unchanged when AI reports an environment issue", async ({
  page,
}) => {
  await mockBoard(page, 1);
  let original = "";
  await page.route("**/api/firmware/analyze", (route) => {
    original = route.request().postDataJSON().circuit.firmware;
    return route.fulfill({
      json: {
        cause: "必要なドライバーを導入してください。",
        steps: ["ドライバーを確認してください。"],
        firmware: "",
      },
    });
  });
  const dialog = await openBuild(page);
  await dialog.getByLabel("AIによるコード変更").selectOption("auto");
  await dialog.getByRole("button", { name: "接続してビルド・実行" }).click();
  await expect(
    dialog.getByText(
      "コードの変更案はありません。AIの対処方法を確認してください。",
    ),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__repairSerial.opens)).toBe(
    1,
  );
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("tab", { name: "コード", exact: true }).click();
  await expect(page.locator(".code-view code")).toHaveText(original);
});
