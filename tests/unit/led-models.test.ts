import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ledColorNames, ledColors, ledModelUrl } from "../../src/lib/led";
import { billOfMaterials } from "../../src/lib/circuit";
import { demoCircuit } from "../../src/lib/demo";

// Node has fetch/Blob but not the progress event used by Three's file loader.
if (!globalThis.ProgressEvent) {
  Object.assign(globalThis, { ProgressEvent: class extends Event {} });
}
test("every LED asset loads with its own lens color, collar and polarized leads", async () => {
  const renderedColors = new Set<string>();
  for (const color of ledColorNames) {
    const source = await readFile(
      new URL(`../../public${ledModelUrl(color)}`, import.meta.url),
      "utf8",
    );
    const { scene } = await new GLTFLoader().parseAsync(source, "");
    const lens = scene.getObjectByName("lens") as Mesh;
    assert.ok(lens?.isMesh);
    const material = lens.material as MeshStandardMaterial;
    const hex = `#${material.color.getHexString()}`;
    assert.equal(hex, ledColors[color].color);
    renderedColors.add(hex);
    assert.ok(scene.getObjectByName("collar"));
    assert.ok(scene.getObjectByName("anode"));
    assert.ok(scene.getObjectByName("cathode"));
  }
  assert.equal(renderedColors.size, 8);
});

test("LEDs with identical specifications but different colors stay separate in the parts list", () => {
  const circuit = demoCircuit("esp32", "led");
  circuit.parts[0] = { ...circuit.parts[0], value: "5mm", ledColor: "red" };
  circuit.parts.push({ ...circuit.parts[0], id: "D2", ledColor: "blue" });
  const leds = billOfMaterials(circuit).filter((part) => part.kind === "led");
  assert.equal(leds.length, 2);
  assert.deepEqual(
    leds.map((p) => p.ledColor),
    ["red", "blue"],
  );
});
