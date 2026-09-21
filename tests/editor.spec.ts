import { test, expect, type Page } from "@playwright/test";
import * as THREE from "three";
import { holePosition } from "../src/lib/circuit";

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

// Project known scene coordinates into real canvas pixels; dispatch actual pointer events.
async function sceneGeometry(page: Page, top: boolean) {
  const canvas = page.locator(".editor-scene canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-part-label="D1"]')).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = new THREE.PerspectiveCamera(
    39,
    box.width / box.height,
    0.1,
    1000,
  );
  camera.position.set(
    ...((top ? [0, 15, -0.2] : [7.8, 10.2, 9.8]) as [number, number, number]),
  );
  camera.lookAt(0, 0.3, -0.6);
  camera.updateMatrixWorld();
  const screen = (point: THREE.Vector3) => {
    const p = point.clone().project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  };
  const worldHole = (hole: string) => {
    const p = holePosition(hole);
    return new THREE.Vector3(p[0], p[1], p[2] + 1);
  };
  const start = worldHole("b1").add(new THREE.Vector3(0.12, 0.56, 0));
  const raycaster = new THREE.Raycaster();
  const ndc = start.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const grab = raycaster.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18),
    new THREE.Vector3(),
  )!;
  const offset = grab.sub(worldHole("b1"));
  return {
    canvas,
    start: screen(start),
    drop: (hole: string) => screen(worldHole(hole).add(offset)),
    hole: (hole: string) => screen(worldHole(hole)),
  };
}

for (const top of [false, true])
  test(`3D model drag in ${top ? "top" : "perspective"} view previews, commits and undoes placement`, async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "Mouse drag is tested on desktop; touch uses the same pointer handler.",
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Editor · 編集" }).click();
    if (top)
      await page
        .getByRole("button", { name: "真上から編集", exact: true })
        .click();
    const geometry = await sceneGeometry(page, top);
    // Select a different part first to prove the mesh itself selects D1.
    await page.getByLabel("編集する部品").selectOption("R1");
    await geometry.canvas.scrollIntoViewIfNeeded();
    const refreshed = await sceneGeometry(page, top);
    const target = refreshed.drop("g18");
    await page.mouse.move(refreshed.start.x, refreshed.start.y);
    await page.mouse.down();
    await expect(page.getByLabel("編集する部品")).toHaveValue("D1");
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await expect(page.locator(".editor-scene")).toContainText("D1 → G18");
    await expect(page.getByLabel("配置する穴")).toHaveValue("b1");
    await page.mouse.up();
    await expect(page.getByLabel("配置する穴")).toHaveValue("g18");
    await page.getByRole("button", { name: "元に戻す", exact: true }).click();
    await expect(page.getByLabel("配置する穴")).toHaveValue("b1");
    await page.getByRole("button", { name: "やり直す", exact: true }).click();
    await expect(page.getByLabel("配置する穴")).toHaveValue("g18");
  });

test("Escape cancels a 3D drag and clicking a 3D hole moves the selected part", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Mouse drag is tested on desktop.");
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByRole("button", { name: "真上から編集", exact: true }).click();
  const g = await sceneGeometry(page, true);
  const target = g.drop("g18");
  await page.mouse.move(g.start.x, g.start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByLabel("配置する穴")).toHaveValue("b1");
  const hole = g.hole("h22");
  await page.mouse.click(hole.x, hole.y);
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
  await expect(page.locator(".workspace-status")).toContainText("保存済み");
  await expect(page.getByRole("status")).toHaveText(
    "編集した回路と配置を保存しました。",
  );
  expect(saved.circuit.parts[0].placement.hole).toBe("g15");
  expect(saved.messages).toEqual([]);
  fail = true;
  await page.getByLabel("配置する穴").selectOption("g18");
  await expect(page.locator(".workspace-status")).not.toContainText("保存済み");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "クラウドに保存できなかったため、このブラウザに保存しました。",
  );
  expect(saved.circuit.parts[0].placement.hole).toBe("g18");
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

test("touch dragging edits the 3D model on mobile", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch input test uses the mobile viewport.");
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByRole("button", { name: "真上から編集", exact: true }).click();
  const g = await sceneGeometry(page, true);
  const target = g.drop("g18");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...g.start, id: 1 }],
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: g.start.x + ((target.x - g.start.x) * i) / 10,
          y: g.start.y + ((target.y - g.start.y) * i) / 10,
          id: 1,
        },
      ],
    });
  await expect(page.locator(".editor-scene")).toContainText("D1 → G18");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByLabel("配置する穴")).toHaveValue("g18");
  await cdp.detach();
});
