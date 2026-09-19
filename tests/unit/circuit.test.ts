import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  validateCircuit,
  resistorBands,
  compileCircuit,
  billOfMaterials,
  holePosition,
  boards,
  type Board,
} from "../../src/lib/circuit";
for (const board of Object.keys(boards) as Board[])
  for (const example of ["climate", "led"] as const)
    test(`${board} ${example}: valid nets, unique real holes and matching BOM`, () => {
      const c = validateCircuit(demoCircuit(board, example));
      const { steps, wires, pinHoles } = compileCircuit(c);
      assert.equal(steps.length, c.parts.length + c.wires.length);
      assert.equal(billOfMaterials(c).at(-1)?.quantity, wires.length);
      const holes = Object.values(pinHoles);
      wires.forEach((w) => {
        for (const e of [w.start, w.end]) {
          if (/^[A-J]\d+ →/.test(e.label))
            holes.push(e.label.split(" → ")[0].toLowerCase());
        }
      });
      assert.equal(
        new Set(holes).size,
        holes.length,
        "Every component leg and jumper uses a separate physical hole",
      );
      for (const hole of holes) assert.equal(holePosition(hole).length, 3);
    });
test("rejects power short", () => {
  const c = demoCircuit();
  c.wires.push({
    from: "U1.VCC",
    to: "U1.GND",
    color: "#fb7185",
    explanation: "short",
  });
  assert.throws(() => validateCircuit(c), /短絡/);
});
test("rejects floating pins and NC wiring", () => {
  const c = demoCircuit();
  c.wires = c.wires.filter((w) => !w.to.includes("R2"));
  assert.throws(() => validateCircuit(c), /未接続|プルアップ/);
  const d = demoCircuit();
  d.wires[0].to = "U1.NC";
  assert.throws(() => validateCircuit(d), /不正/);
});
test("rejects unknown GPIO and duplicate component ID", () => {
  const c = demoCircuit();
  c.wires[0].from = "board.GPIO999";
  assert.throws(() => validateCircuit(c), /不正/);
  const d = demoCircuit();
  d.parts[1].id = d.parts[0].id;
  assert.throws(() => validateCircuit(d), /重複/);
});
test("LED must have a real current limiting resistor", () => {
  const c = demoCircuit("esp32", "led");
  c.parts[1].value = "10Ω";
  assert.throws(() => validateCircuit(c), /220/);
  const d = demoCircuit("esp32", "led");
  d.wires.push({
    from: "R1.1",
    to: "R1.2",
    color: "#fb7185",
    explanation: "bypass",
  });
  assert.throws(() => validateCircuit(d));
});
test("rejects GPIO power connection and multiple jumpers on a board pin", () => {
  const c = demoCircuit();
  c.wires.push({
    from: "R1.1",
    to: "U1.VCC",
    color: "#fb7185",
    explanation: "bad",
  });
  assert.throws(() => validateCircuit(c), /GPIO/);
  const d = demoCircuit();
  d.wires.push({
    from: "board.3V3",
    to: "R1.1",
    color: "#fb7185",
    explanation: "bad",
  });
  assert.throws(() => validateCircuit(d), /集中/);
});
test("rejects empty circuit, oversized parts and invalid holes", () => {
  assert.throws(() => validateCircuit({}));
  assert.throws(() => holePosition("b31"));
  assert.throws(() => holePosition("z3"));
});

test("330 ohm and 10k ohm colors reflect actual resistance", () => {
  assert.deepEqual(resistorBands("330Ω").slice(0, 3), [
    "#ec8738",
    "#ec8738",
    "#784d32",
  ]);
  assert.deepEqual(resistorBands("10kΩ").slice(0, 3), [
    "#784d32",
    "#27272a",
    "#ec8738",
  ]);
});

test("LED supply bypass and input-only sensor GPIO are rejected", () => {
  const c = demoCircuit();
  c.wires.push({
    from: "D1.A",
    to: "U1.VCC",
    color: "#fb7185",
    explanation: "bypass",
  });
  assert.throws(() => validateCircuit(c), /直結/);
  const d = demoCircuit();
  d.wires.find((w) => w.from === "board.GPIO4")!.from = "board.GPIO34";
  assert.throws(() => validateCircuit(d), /双方向/);
});
test("CdS divider is supported on ADC boards and rejected on Pi without ADC", () => {
  const c = demoCircuit("esp32", "led");
  c.parts = [
    { id: "L1", kind: "ldr", value: "GL5528", purpose: "明るさ" },
    { id: "R1", kind: "resistor", value: "10kΩ", purpose: "分圧" },
  ];
  c.wires = [
    { from: "board.3V3", to: "L1.1", color: "#fb7185", explanation: "電源" },
    { from: "L1.2", to: "R1.1", color: "#38bdf8", explanation: "分圧点" },
    {
      from: "board.GPIO34",
      to: "R1.1",
      color: "#818cf8",
      explanation: "ADC入力",
    },
    { from: "R1.2", to: "board.GND", color: "#94a3b8", explanation: "GND" },
  ];
  assert.equal(validateCircuit(c).parts[0].kind, "ldr");
  c.board = "raspberry-pi";
  c.wires[2].from = "board.GPIO4";
  assert.throws(() => validateCircuit(c), /ADC/);
});
test("BH1750 I2C pins and two-pin button have valid connections", () => {
  const c = demoCircuit("raspberry-pi", "led");
  c.parts = [
    { id: "U1", kind: "bh1750", value: "3.3V breakout", purpose: "照度" },
  ];
  c.wires = [
    { from: "board.3V3", to: "U1.VCC", color: "#fb7185", explanation: "電源" },
    { from: "board.GND", to: "U1.GND", color: "#94a3b8", explanation: "GND" },
    { from: "board.GPIO2", to: "U1.SDA", color: "#38bdf8", explanation: "SDA" },
    { from: "board.GPIO3", to: "U1.SCL", color: "#818cf8", explanation: "SCL" },
  ];
  assert.doesNotThrow(() => validateCircuit(c));
  c.parts = [{ id: "SW1", kind: "button", value: "NO 2-pin", purpose: "入力" }];
  c.wires = [
    { from: "board.GPIO4", to: "SW1.1", color: "#818cf8", explanation: "入力" },
    { from: "board.GND", to: "SW1.2", color: "#94a3b8", explanation: "GND" },
  ];
  assert.doesNotThrow(() => validateCircuit(c));
});
