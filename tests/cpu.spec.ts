import { test, expect } from "@playwright/test";
import * as THREE from "three";
import { holePosition } from "../src/lib/circuit";

test("multiple breadboards persist placements, cross-board wires and undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page
    .getByRole("button", { name: "ブレッドボードを追加", exact: true })
    .click();
  await expect(page.getByLabel("ブレッドボードを管理")).toContainText("2枚");
  await page.getByLabel("編集する部品").selectOption("D1");
  await page.getByLabel("配置先のブレッドボード").selectOption("BB2");
  await expect(page.locator(".editor-pins")).toContainText("BB2:B1");
  await expect(
    page.getByRole("button", { name: "BB2を削除", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(page.getByLabel("配置先のブレッドボード")).toHaveValue("BB1");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(page.getByLabel("配置先のブレッドボード")).toHaveValue("BB2");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("breadberry-projects") || "[]")[0]
            ?.circuit.breadboards?.length,
      ),
    )
    .toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.locator(".saved-list button").first().click();
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page.getByLabel("編集する部品").selectOption("D1");
  await expect(page.getByLabel("配置先のブレッドボード")).toHaveValue("BB2");
  await page
    .getByRole("button", { name: "レイアウトチェック", exact: true })
    .click();
  await expect(page.locator(".editor-results")).toContainText(
    "問題は見つかりませんでした",
  );
  expect(errors).toEqual([]);
});

test("CPU sample loads offline, renders IC models and schematic rails, saves and reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/generate", () => {
    throw new Error("CPU sample must not use generation API");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "サンプル", exact: true }).click();
  await page.getByRole("button", { name: "1bit CPU", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ロジックICでつくる1bit CPU" }),
  ).toBeVisible();
  await expect(page.locator('[data-part-label="U3"]')).toBeVisible();
  await expect(page.locator(".canvas-panel")).toContainText("74HC153");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await expect(page.getByLabel("ブレッドボードを管理")).toContainText("4枚");
  await page.getByLabel("編集する部品").selectOption("U4");
  await expect(page.getByLabel("配置先のブレッドボード")).toHaveValue("BB2");
  await expect(page.locator(".editor-pins")).toContainText("1CLR_N: BB2:E15");
  await page
    .getByRole("button", { name: "レイアウトチェック", exact: true })
    .click();
  await expect(page.locator(".editor-results")).toContainText(
    "問題は見つかりませんでした",
  );
  await page
    .getByRole("button", { name: "レイアウトチェック結果を閉じる" })
    .click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("breadberry-projects") || "[]")[0]
            ?.circuit.parts.length,
      ),
    )
    .toBe(21);
  await page.getByRole("button", { name: "Viewer · 閲覧" }).click();
  await page.getByRole("tab", { name: "回路図", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "接続データから描画した回路図" }),
  ).toBeVisible();
  await expect(page.locator(".schematic")).toContainText("rail.BB4.VCC");
  await page.reload();
  await page.getByRole("button", { name: "プロジェクト", exact: true }).click();
  await page.locator(".saved-list button").first().click();
  await expect(
    page.getByRole("heading", { name: "ロジックICでつくる1bit CPU" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("drag an existing 3D part from BB1 to BB2", async ({ page, isMobile }) => {
  test.skip(
    isMobile,
    "Desktop pointer drag; mobile placement selector is tested above.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Editor · 編集" }).click();
  await page
    .getByRole("button", { name: "ブレッドボードを追加", exact: true })
    .click();
  await page.getByRole("button", { name: "真上から編集", exact: true }).click();
  const canvas = page.locator(".editor-scene canvas");
  await expect(page.locator('[data-part-label="D1"]')).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const camera = new THREE.PerspectiveCamera(
    39,
    box.width / box.height,
    0.1,
    1000,
  );
  const scale = Math.max(
    17.15 / 8.15,
    1,
    17.15 / ((10 * box.width) / box.height),
  );
  camera.position.set(4.5, 15 * scale, -0.2);
  camera.lookAt(4.5, 0.3, -0.6);
  camera.updateMatrixWorld();
  function screen(point: THREE.Vector3) {
    const p = point.clone().project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  }
  const origin = new THREE.Vector3(...holePosition("b1")).add(
    new THREE.Vector3(0, 0, 1),
  );
  const grabPoint = origin.clone().add(new THREE.Vector3(0.12, 0.56, 0));
  const ray = new THREE.Raycaster();
  const ndc = grabPoint.clone().project(camera);
  ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const offset = ray.ray
    .intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18),
      new THREE.Vector3(),
    )!
    .sub(origin);
  const start = screen(grabPoint);
  const target = screen(
    new THREE.Vector3(...holePosition("g18"))
      .add(new THREE.Vector3(9, 0, 1))
      .add(offset),
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await expect(page.locator(".editor-scene")).toContainText("D1 → BB2:G18");
  await page.mouse.up();
  await expect(page.getByLabel("配置先のブレッドボード")).toHaveValue("BB2");
  await expect(page.getByLabel("配置する穴")).toHaveValue("g18");
});
