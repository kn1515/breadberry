import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  compileCircuit,
  validateDraft,
  type Circuit,
} from "../../src/lib/circuit";
import { addPart, checkLayout, removePart } from "../../src/lib/layout";

test("legacy sample placement remains valid on every supported board", () => {
  for (const board of ["esp32", "pico", "raspberry-pi"] as const)
    for (const example of ["climate", "led", "temperature", "display"] as const)
      assert.deepEqual(checkLayout(demoCircuit(board, example)), []);
});
test("moving and reversing a part updates legs, jumper bank and guide holes", () => {
  const c = demoCircuit("esp32", "led");
  const p = c.parts[0];
  p.placement = { hole: "i20", reversed: true };
  const compiled = compileCircuit(c);
  const holes = Object.entries(compiled.pinHoles)
    .filter(([pin]) => pin.startsWith(`${p.id}.`))
    .map(([, hole]) => hole);
  assert.equal(holes[0], "i20");
  assert.ok(holes.every((h) => h.startsWith("i")));
  assert.ok(Number(holes[1].slice(1)) < 20);
  const endpoints = compiled.wires
    .flatMap((w) => [w.start, w.end])
    .filter((e) => e.label.includes(`→ ${p.id}.`));
  assert.ok(endpoints.length);
  assert.ok(endpoints.every((e) => /^[F-J]/.test(e.label)));
  assert.ok(compiled.steps[0].detail.includes("I20"));
  assert.deepEqual(checkLayout(c), []);
});
test("same hole and shared strips report physical collisions and unintended nets", () => {
  const c = demoCircuit("esp32", "led");
  c.parts.forEach((p) => (p.placement = { hole: "b10", reversed: false }));
  assert.ok(checkLayout(c).some((i) => i.code === "hole"));
  assert.ok(checkLayout(c).some((i) => i.code === "net"));
  assert.ok(checkLayout(c).some((i) => i.code === "overlap"));
  c.parts[1].placement!.hole = "e10";
  assert.ok(!checkLayout(c).some((i) => i.code === "hole"));
  assert.ok(checkLayout(c).some((i) => i.code === "net"));
  c.parts[1].placement!.hole = "g10";
  assert.ok(!checkLayout(c).some((i) => i.code === "net"));
});
test("out of bounds placements remain renderable and produce actionable errors", () => {
  const c = demoCircuit("esp32", "led");
  c.parts.forEach((p) => (p.placement = { hole: "b30", reversed: false }));
  assert.doesNotThrow(() => compileCircuit(c));
  assert.ok(checkLayout(c).some((i) => i.code === "bounds"));
  c.parts.forEach((p) => (p.placement = { hole: "b1", reversed: true }));
  assert.doesNotThrow(() => compileCircuit(c));
  assert.ok(checkLayout(c).some((i) => i.code === "bounds"));
});
test("jumpers reserve holes globally and exhausted strips are reported", () => {
  const c = demoCircuit("esp32", "led");
  const a = c.parts[0].id;
  const pin = c.parts[0].kind === "led" ? "A" : "1";
  for (let i = 0; i < 5; i++)
    c.wires.push({
      from: `${a}.${pin}`,
      to: "board.GND",
      color: "#94a3b8",
      explanation: "overflow",
    });
  assert.ok(checkLayout(c).some((i) => i.code === "capacity"));
});
test("addition preserves IDs; removal preserves remaining positions and drops attached wires", () => {
  const initial = demoCircuit();
  const c = addPart(initial, "ssd1306");
  assert.equal(c.parts.length, initial.parts.length + 1);
  const added = c.parts.at(-1)!;
  assert.equal(added.kind, "ssd1306");
  assert.ok(checkLayout(c).some((i) => i.code === "circuit"));
  const before = compileCircuit(c).pinHoles;
  const removed = removePart(c, c.parts[0].id);
  const after = compileCircuit(removed).pinHoles;
  for (const [key, value] of Object.entries(after))
    assert.equal(value, before[key]);
  assert.ok(
    removed.wires.every(
      (w) =>
        !w.from.startsWith(`${c.parts[0].id}.`) &&
        !w.to.startsWith(`${c.parts[0].id}.`),
    ),
  );
  assert.equal(
    new Set(addPart(removed, "led").parts.map((p) => p.id)).size,
    removed.parts.length + 1,
  );
});
test("incomplete and empty drafts survive JSON round trips; unsafe shapes are rejected", () => {
  const c = addPart(demoCircuit(), "led");
  assert.deepEqual(validateDraft(JSON.parse(JSON.stringify(c))), c);
  const empty: Circuit = { ...c, parts: [], wires: [] };
  assert.deepEqual(validateDraft(empty), empty);
  assert.throws(
    () => validateDraft({ ...c, parts: [...c.parts, c.parts[0]] }),
    /重複/,
  );
  assert.throws(
    () => validateDraft({ ...c, wires: [{ ...c.wires[0], to: "missing.1" }] }),
    /存在しない/,
  );
  assert.throws(() =>
    validateDraft({
      ...c,
      parts: [{ ...c.parts[0], placement: { hole: "z1", reversed: false } }],
    }),
  );
});
