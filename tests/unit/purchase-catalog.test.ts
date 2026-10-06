import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import { purchaseParts, storeProductUrl } from "../../src/lib/purchase";
import {
  purchaseCatalog,
  registeredCandidates,
  type RegisteredProduct,
} from "../../src/lib/purchase-catalog";

const circuit = demoCircuit("esp32", "led");
const led = purchaseParts(circuit).find((p) => p.kind === "led")!;

test("registered retrieval preserves LED color and resistance instead of fuzzy matching", () => {
  assert.equal(registeredCandidates(led, circuit)[0].id, "akizuki-112117");
  assert.equal(
    registeredCandidates({ ...led, ledColor: "red" }, circuit)[0].id,
    "akizuki-112605",
  );
  assert.deepEqual(
    registeredCandidates({ ...led, ledColor: "blue" }, circuit),
    [],
  );
  const resistor = { ...led, kind: "resistor", value: "10kΩ" };
  assert.equal(registeredCandidates(resistor, circuit).length, 1);
  assert.equal(
    registeredCandidates({ ...resistor, value: "10000Ω" }, circuit).length,
    1,
  );
  assert.equal(
    registeredCandidates({ ...resistor, value: "330Ω" }, circuit).length,
    0,
  );
  assert.equal(
    registeredCandidates({ ...resistor, value: "unknown" }, circuit).length,
    0,
  );
});

test("registry filters disabled, unsafe and duplicate entries and bounds verification work", () => {
  const seed = purchaseCatalog[0];
  const entries = [
    { ...seed, enabled: false },
    { ...seed, url: "https://evil.test/catalog/g/g112117/" },
    ...Array.from({ length: 8 }, (_, i) => ({
      ...seed,
      id: `test-${i}`,
      url: `https://akizukidenshi.com/catalog/g/gtest${i}/`,
    })),
    seed,
    seed,
  ];
  assert.equal(registeredCandidates(led, circuit, entries).length, 3);
  assert.equal(registeredCandidates(led, circuit, [seed, seed]).length, 1);
  for (const p of purchaseCatalog) assert.ok(storeProductUrl(p.store, p.url));
  assert.equal(
    new Set(purchaseCatalog.map((p) => p.id)).size,
    purchaseCatalog.length,
  );
});

test("board and sensor registrations must match the authoritative circuit model and value", () => {
  const seed = purchaseCatalog[0];
  const board: RegisteredProduct = {
    ...seed,
    match: { kind: "board", board: "pico" },
  };
  const part = { ...led, kind: "board" };
  assert.equal(registeredCandidates(part, circuit, [board]).length, 0);
  assert.equal(
    registeredCandidates(part, { ...circuit, board: "pico" }, [board]).length,
    1,
  );
  const sensor: RegisteredProduct = {
    ...seed,
    match: { kind: "dht22", value: "DHT22" },
  };
  assert.equal(
    registeredCandidates({ ...led, kind: "dht22", value: "DHT11" }, circuit, [
      sensor,
    ]).length,
    0,
  );
});
