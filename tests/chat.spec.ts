import { test, expect } from "@playwright/test";
import { demoProject } from "../src/lib/demo";
import { appendExchange } from "../src/lib/conversation";
import type { Project } from "../src/lib/circuit";

test("successive edits retain context, retry safely, reopen history, and start fresh", async ({
  page,
}) => {
  test.setTimeout(60000);
  const requests: any[] = [];
  let fail = false;
  let latest: Project;
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { active: true, gemini: true, firestore: false } }),
  );
  await page.route("**/api/projects", (route) =>
    route.fulfill({ json: { projects: [] } }),
  );
  await page.route("**/api/generate", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (fail)
      return route.fulfill({
        status: 502,
        json: { error: "一時的なエラー。再試行してください。" },
      });
    const circuit = structuredClone(
      body.context?.circuit ?? demoProject(body.board, "led").circuit,
    );
    circuit.title = `修正した回路 ${requests.length}`;
    if (body.prompt.includes("470"))
      circuit.parts.find((p: any) => p.kind === "resistor").value = "470Ω";
    latest = {
      ...demoProject(),
      id: `revision-${requests.length}`,
      circuit,
      source: "gemini",
      storage: "browser",
      messages: appendExchange(
        body.context?.messages ?? [],
        body.prompt,
        circuit,
      ),
    };
    return route.fulfill({ json: latest });
  });
  await page.goto("/");
  const prompt = page.getByLabel("作りたいもの");
  const log = page.getByRole("log", { name: "会話履歴" });
  await prompt.fill("抵抗を470Ωにして");
  await page.getByRole("button", { name: "回路を修正", exact: true }).click();
  await expect(log.locator("article")).toHaveCount(2);
  await expect(prompt).toHaveValue("");
  expect(requests[0].context.circuit.title).toBe("お部屋の小さな気象台");
  await prompt.fill("青にして");
  await prompt.press("Control+Enter");
  await expect(log.locator("article")).toHaveCount(4);
  expect(
    requests[1].context.circuit.parts.find((p: any) => p.kind === "resistor")
      .value,
  ).toBe("470Ω");
  expect(requests[1].context.messages[0].content).toBe("抵抗を470Ωにして");
  await page.getByRole("tab", { name: "回路図", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "接続データから描画した回路図" }),
  ).toContainText("470Ω");
  fail = true;
  await prompt.fill("点滅間隔を1秒にして");
  await page.getByRole("button", { name: "回路を修正", exact: true }).click();
  await expect(
    page
      .getByRole("complementary", { name: "回路設計チャット" })
      .getByRole("alert"),
  ).toContainText("一時的なエラー");
  await expect(prompt).toHaveValue("点滅間隔を1秒にして");
  await expect(log.locator("article")).toHaveCount(4);
  await expect(
    page.getByRole("heading", { name: "修正した回路 2", exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "回路を修正", exact: true }).click();
  await expect(log.locator("article")).toHaveCount(6);
  expect(requests[3].context.messages).toEqual(requests[2].context.messages);
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.getByRole("button", { name: /修正した回路 4/ }).click();
  await expect(log.locator("article")).toHaveCount(6);
  await expect(log).toContainText("点滅間隔を1秒にして");
  await page.getByRole("button", { name: "新しい回路", exact: true }).click();
  await prompt.fill("新しくLEDを点滅させたい");
  await page.getByRole("button", { name: "回路を生成", exact: true }).click();
  await expect(log.locator("article")).toHaveCount(2);
  expect(requests[4].context).toBeUndefined();
});

test("chat stays to the right on desktop and remains usable on mobile", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const chat = page.getByRole("complementary", { name: "回路設計チャット" });
  await expect(chat).toBeVisible();
  const canvasBox = await page.locator(".canvas-panel").boundingBox();
  const chatBox = await chat.boundingBox();
  if (!isMobile)
    expect(chatBox!.x).toBeGreaterThanOrEqual(
      canvasBox!.x + canvasBox!.width - 1,
    );
  else
    expect(chatBox!.y).toBeGreaterThanOrEqual(
      canvasBox!.y + canvasBox!.height - 1,
    );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});
