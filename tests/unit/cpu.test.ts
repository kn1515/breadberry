import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  billOfMaterials,
  compileCircuit,
  getBreadboards,
  layoutHolePosition,
  partPinHoles,
  qualifyHole,
  validateCircuit,
  validateDraft,
  type Circuit,
} from "../../src/lib/circuit";
import {
  addBreadboard,
  addPart,
  checkLayout,
  movePart,
  nearestLayoutHole,
  removeBreadboard,
} from "../../src/lib/layout";
import { logicCatalog, isLogic } from "../../src/lib/logic";
import { purchaseParts } from "../../src/lib/purchase";

for (const board of ["esp32", "pico", "raspberry-pi"] as const)
  test(`${board}: CPU sample has four boards, no hole/body/net conflicts, and persists`, () => {
    const c = demoCircuit(board, "cpu");
    assert.equal(getBreadboards(c).length, 4);
    assert.deepEqual(checkLayout(c), []);
    assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(c))), c);
    assert.deepEqual(validateCircuit(c), c);
    assert.equal(
      billOfMaterials(c).find((p) => p.kind === "breadboard")?.quantity,
      4,
    );
    const compiled = compileCircuit(c);
    assert.deepEqual(compiled.allocationIssues, []);
    const positions = [
      ...Object.values(compiled.pinHoles).map(layoutHolePosition),
      ...compiled.wires.flatMap((w) => [w.start.position, w.end.position]),
    ];
    assert.equal(
      new Set(positions.map((p) => p.join(","))).size,
      positions.length,
    );
    assert.deepEqual(
      c.wires
        .flatMap((w) => [w.from, w.to])
        .filter((e) => e.startsWith("board."))
        .sort(),
      ["board.3V3", "board.GND"],
    );
    assert.equal(c.parts.filter((p) => isLogic(p.kind)).length, 5);
    const bom = purchaseParts(c);
    assert.equal(bom.find((p) => p.kind === "breadboard")?.quantity, 4);
    assert.match(bom.find((p) => p.kind === "74hc74")!.query, /74HC74 PDIP/);
    assert.equal(
      bom
        .filter((p) => p.kind === "capacitor")
        .reduce((sum, p) => sum + p.quantity, 0),
      6,
    );
  });

test("independent board strips and jumper allocations do not short identical hole numbers", () => {
  let c = addBreadboard(demoCircuit("esp32", "led"));
  c = movePart(c, "D1", "BB2:b1");
  const compiled = compileCircuit(c);
  assert.equal(compiled.pinHoles["D1.A"], "BB2:b1");
  assert.match(compiled.wires.find((w) => w.to === "D1.A")!.end.label, /^BB2:/);
  assert.deepEqual(checkLayout(c), []);
  const [x, , z] = layoutHolePosition("BB2:g18");
  assert.equal(nearestLayoutHole(x, z, c), "BB2:g18");
  assert.equal(nearestLayoutHole(4.5, 0, c), null);
  assert.equal(removeBreadboard(c, "BB2"), c);
  c = movePart(c, "D1", "b1");
  assert.equal(getBreadboards(removeBreadboard(c, "BB2")).length, 1);
  for (let n = 0; n < 10; n++) c = addBreadboard(c);
  assert.equal(getBreadboards(c).length, 6);
  assert.throws(
    () => validateDraft({ ...c, breadboards: [{ id: "BB1" }, { id: "BB1" }] }),
    /重複/,
  );
  assert.throws(
    () => validateDraft({ ...c, breadboards: [{ id: "BB2" }] }),
    /BB1|存在しない/,
  );
  assert.throws(
    () =>
      validateDraft({
        ...movePart(c, "D1", "BB6:g18"),
        breadboards: [{ id: "BB1" }],
      }),
    /存在しない/,
  );
});

test("DIP models straddle the gap, use counter-clockwise pin numbering, and rotate both banks", () => {
  let c = addPart(demoCircuit("esp32", "led"), "74hc74");
  c = movePart(c, "P1", "e20");
  let holes = partPinHoles(c);
  assert.equal(holes["P1.1CLR_N"], "e20");
  assert.equal(holes["P1.GND"], "e26");
  assert.equal(holes["P1.2Q_N"], "f26");
  assert.equal(holes["P1.VCC"], "f20");
  c.parts.at(-1)!.placement!.reversed = true;
  holes = partPinHoles(c);
  assert.equal(holes["P1.1CLR_N"], "f20");
  assert.equal(holes["P1.GND"], "f14");
  assert.equal(holes["P1.VCC"], "e20");
  assert.equal(logicCatalog["74hc153"].pins[1], "B");
  assert.equal(logicCatalog["74hc153"].pins[13], "A");
  assert.equal(logicCatalog["74hc86"].pins[2], "1Y");
});

test("CPU validation rejects floating CMOS inputs, swapped rails, output conflicts and reset/preset short", () => {
  let c = demoCircuit("esp32", "cpu");
  c.wires = c.wires.filter((w) => w.to !== "U1.2A");
  assert.throws(() => validateCircuit(c), /未接続/);
  c = demoCircuit("esp32", "cpu");
  c.wires.find((w) => w.to === "U4.VCC")!.from = "BB2.GND";
  assert.throws(() => validateCircuit(c), /電源/);
  for (const to of ["BB1.GND", "U2.1Y"]) {
    c = demoCircuit("esp32", "cpu");
    c.wires.push({
      from: "U1.1Y",
      to,
      color: "#94a3b8",
      explanation: "invalid output tie",
    });
    assert.throws(() => validateCircuit(c), /出力/);
  }
  c = demoCircuit("esp32", "cpu");
  c.wires.find((w) => w.to === "U4.2PRE_N")!.from = "BB2.GND";
  c.wires.find((w) => w.to === "U4.2CLR_N")!.from = "BB2.GND";
  assert.throws(() => validateCircuit(c), /CLR_N/);
  c = demoCircuit("esp32", "cpu");
  c.wires.push({
    from: "SW1.4B",
    to: "BB3.VCC",
    color: "#fb7185",
    explanation: "short on reset",
  });
  assert.throws(() => validateCircuit(c), /DIP|短絡/);
});

// Evaluate the sample's actual wired nets (including switch contacts and weak pull resistors).
// The expected instruction table below is independent of the mux wiring under test.
function evaluate(
  c: Circuit,
  a: number,
  d: number,
  opcode: number,
  reset = false,
) {
  const parent = new Map<string, string>();
  const root = (s: string): string =>
    parent.has(s) ? root(parent.get(s)!) : s;
  const join = (x: string, y: string) => {
    x = root(x);
    y = root(y);
    if (x !== y) parent.set(x, y);
  };
  c.wires.forEach((w) => join(w.from, w.to));
  [d, opcode & 1, opcode >> 1, Number(reset)].forEach((on, i) => {
    if (on) join(`SW1.${i + 1}A`, `SW1.${i + 1}B`);
  });
  const values = new Map<string, number>();
  function put(pin: string, value: number) {
    const net = root(pin);
    if (values.has(net))
      assert.equal(values.get(net), value, `driver conflict at ${pin}`);
    values.set(net, value);
  }
  put("board.3V3", 1);
  put("board.GND", 0);
  put("U4.1Q", a);
  put("U4.1Q_N", 1 - a);
  function read(pin: string): number {
    if (values.has(root(pin))) return values.get(root(pin))!;
    for (const r of c.parts.filter((p) => p.kind === "resistor")) {
      const ends = [`${r.id}.1`, `${r.id}.2`];
      for (let i = 0; i < 2; i++)
        if (root(ends[i]) === root(pin) && values.has(root(ends[1 - i])))
          return values.get(root(ends[1 - i]))!;
    }
    throw new Error(`floating input ${pin}`);
  }
  for (const p of c.parts) {
    if (p.kind === "74hc08")
      put(`${p.id}.1Y`, read(`${p.id}.1A`) & read(`${p.id}.1B`));
    if (p.kind === "74hc86")
      put(`${p.id}.1Y`, read(`${p.id}.1A`) ^ read(`${p.id}.1B`));
  }
  const mux = c.parts.find((p) => p.kind === "74hc153")!.id;
  const select = read(`${mux}.B`) * 2 + read(`${mux}.A`);
  put(`${mux}.1Y`, read(`${mux}.1G_N`) ? 0 : read(`${mux}.1C${select}`));
  assert.equal(read("U4.1PRE_N"), 1);
  return read("U4.1CLR_N") ? read("U4.1D") : 0;
}
test("actual CPU netlist executes all four instructions for both accumulator and operand values", () => {
  const c = demoCircuit("esp32", "cpu");
  for (const a of [0, 1])
    for (const d of [0, 1])
      for (const op of [0, 1, 2, 3]) {
        const expected = [d, a & d, a ^ d, 1 - a][op];
        assert.equal(evaluate(c, a, d, op), expected, `A=${a} D=${d} OP=${op}`);
        assert.equal(evaluate(c, a, d, op, true), 0);
      }
  let a = 0;
  const trace = [a];
  for (const [op, d] of [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 0],
  ]) {
    a = evaluate(c, a, d, op);
    trace.push(a);
  }
  assert.deepEqual(trace, [0, 1, 0, 1, 0]);
});
