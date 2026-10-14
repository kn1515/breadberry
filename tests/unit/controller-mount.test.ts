import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boards,
  boardPinPosition,
  controllerBreadboards,
  controllerMount,
  controllerPinHole,
  controllerHolePosition,
  compileCircuit,
  billOfMaterials,
  getBreadboards,
  validateDraft,
} from "../../src/lib/circuit";
import { demoCircuit } from "../../src/lib/demo";
import { purchaseParts } from "../../src/lib/purchase";
import { picoPinout } from "../../src/lib/pico";

test("Pico H pinout includes all physical pins and preserves GPIO/row distinctions", () => {
  // Read down each bank from the USB end, as in the official top-view pinout.
  assert.deepEqual(picoPinout.slice(0, 20), [
    "GP0",
    "GP1",
    "GND",
    "GP2",
    "GP3",
    "GP4",
    "GP5",
    "GND",
    "GP6",
    "GP7",
    "GP8",
    "GP9",
    "GND",
    "GP10",
    "GP11",
    "GP12",
    "GP13",
    "GND",
    "GP14",
    "GP15",
  ]);
  assert.deepEqual(picoPinout.slice(20).reverse(), [
    "VBUS",
    "VSYS",
    "GND",
    "3V3_EN",
    "3V3(OUT)",
    "ADC_VREF",
    "GP28",
    "AGND",
    "GP27",
    "GP26",
    "RUN",
    "GP22",
    "GND",
    "GP21",
    "GP20",
    "GP19",
    "GP18",
    "GND",
    "GP17",
    "GP16",
  ]);
  assert.equal(controllerPinHole("pico", 20), "MCU1:h25");
  assert.equal(controllerPinHole("pico", 21), "MCU1:c25");
  const c = demoCircuit("pico", "led");
  const compiled = compileCircuit(c);
  const ledWire = compiled.wires.find((w) => w.from === "board.GP14")!;
  assert.equal(boards.pico.pins.GP14, 19);
  assert.equal(controllerPinHole("pico", 19), "MCU1:h24");
  assert.equal(ledWire.start.label, "MCU1:J24 → board.GP14 · pin 19");
  assert.equal(boards.pico.pins.GND, 38);
  assert.equal(boards.pico.pins["3V3"], 36);
});

test("Pico H exposes all 26 header GPIOs without exposing internal or power-control pins", () => {
  assert.equal(
    Object.keys(boards.pico.pins).filter((p) => p.startsWith("GP")).length,
    26,
  );
  for (const [pin, number] of Object.entries({
    GP16: 21,
    GP17: 22,
    GP18: 24,
    GP19: 25,
    GP20: 26,
    GP21: 27,
    GP22: 29,
  })) {
    assert.equal(boards.pico.pins[pin], number);
    const c = demoCircuit("pico", "led");
    c.wires.find((w) => w.from === "board.GP14")!.from = `board.${pin}`;
    assert.deepEqual(validateDraft(c), c);
    assert.deepEqual(compileCircuit(c).allocationIssues, []);
  }
  for (const pin of [
    "GP23",
    "GP24",
    "GP25",
    "GP29",
    "VBUS",
    "VSYS",
    "RUN",
    "3V3_EN",
  ])
    assert.equal(boards.pico.pins[pin], undefined);
});

for (const board of ["pico", "esp32"] as const) {
  test(`${board}: all headers mount in unique holes at 2.54 mm pitch`, () => {
    const mount = controllerMount(board)!;
    assert.equal(mount.pins.length, board === "pico" ? 40 : 30);
    // Viewed from above with USB to the left, Pico pin 1 is in the near bank.
    if (board === "pico") {
      assert.equal(controllerPinHole(board, 1), "MCU1:h6");
      assert.equal(controllerPinHole(board, 40), "MCU1:c6");
      assert.equal(controllerPinHole(board, 36), "MCU1:c10");
    }
    assert.equal(
      new Set(mount.pins.map((p) => p.hole)).size,
      mount.pins.length,
    );
    for (const pin of mount.pins) {
      assert.ok(pin.position.every(Number.isFinite));
      assert.equal(pin.position[1], 0.18);
    }
    assert.ok(
      Math.abs(mount.pins[1].position[0] - mount.pins[0].position[0] - 0.24) <
        1e-9,
    );
    for (const [name, number] of Object.entries(boards[board].pins))
      assert.deepEqual(
        boardPinPosition(board, name),
        mount.pins[number - 1].position,
      );
    // Physical bank spacing: Pico 17.78 mm (7 pitches), DevKit V1 25.4 mm (10).
    const bankWidth = Math.abs(
      mount.pins[0].position[2] - mount.pins[mount.pins.length / 2].position[2],
    );
    assert.ok(Math.abs(bankWidth - (board === "pico" ? 1.68 : 2.4)) < 1e-9);
  });

  test(`${board}: every sample uses exposed conductive holes, preserving saved placements`, () => {
    for (const example of [
      "led",
      "climate",
      "temperature",
      "display",
      "cpu",
    ] as const) {
      const c = demoCircuit(board, example);
      const before = JSON.stringify(c);
      const compiled = compileCircuit(c);
      assert.deepEqual(compiled.allocationIssues, []);
      assert.equal(compiled.steps[0].type, "board");
      assert.equal(compiled.steps[1].ref, c.parts[0].id);
      const occupied = new Set(controllerMount(board)!.pins.map((p) => p.hole));
      for (const w of compiled.wires) {
        for (const [key, end] of [
          [w.from, w.start],
          [w.to, w.end],
        ] as const) {
          if (!key.startsWith("board.")) continue;
          const jumper = end.label
            .split(" → ")[0]
            .replace(/([A-J])(\d+)$/, (_, col, row) => col.toLowerCase() + row);
          const pin = controllerPinHole(
            board,
            boards[board].pins[key.slice(6)],
          );
          assert.equal(jumper.split(":")[0], pin.split(":")[0]);
          assert.equal(jumper.match(/\d+$/)![0], pin.match(/\d+$/)![0]);
          assert.equal(
            jumper.split(":")[1][0] <= "e",
            pin.split(":")[1][0] <= "e",
          );
          assert.ok(!occupied.has(jumper));
          occupied.add(jumper);
          assert.deepEqual(end.position, controllerHolePosition(board, jumper));
          const mount = controllerMount(board)!;
          assert.ok(
            Math.abs(end.position[2] - mount.center[2]) > mount.depth / 2,
          );
        }
      }
      const count = getBreadboards(c).length + (board === "pico" ? 1 : 2);
      assert.equal(
        billOfMaterials(c).find((p) => p.kind === "breadboard")?.quantity,
        count,
      );
      assert.equal(
        purchaseParts(c).find((p) => p.kind === "breadboard")?.quantity,
        count,
      );
      assert.equal(
        billOfMaterials(c).find((p) => p.kind === "wire")?.value,
        "オス–オス",
      );
      assert.equal(JSON.stringify(c), before);
      assert.deepEqual(validateDraft(JSON.parse(before)), c);
    }
  });
}

test("Raspberry Pi retains its external header wiring and board count", () => {
  const c = demoCircuit("raspberry-pi", "led");
  assert.deepEqual(controllerBreadboards(c.board), []);
  assert.equal(controllerMount(c.board), null);
  const compiled = compileCircuit(c);
  assert.equal(compiled.mountingSteps, 0);
  assert.equal(compiled.steps[0].ref, c.parts[0].id);
  for (const w of compiled.wires)
    for (const [key, end] of [
      [w.from, w.start],
      [w.to, w.end],
    ] as const)
      if (key.startsWith("board."))
        assert.deepEqual(end.position, boardPinPosition(c.board, key.slice(6)));
  assert.equal(
    billOfMaterials(c).find((p) => p.kind === "breadboard")?.quantity,
    1,
  );
});
