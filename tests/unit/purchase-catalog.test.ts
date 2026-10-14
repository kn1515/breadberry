import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  purchaseParts,
  storeProductUrl,
  storeSearchUrl,
} from "../../src/lib/purchase";
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
  assert.equal(registeredCandidates(resistor, circuit).length, 2);
  assert.equal(
    registeredCandidates({ ...resistor, value: "10000Ω" }, circuit).length,
    2,
  );
  assert.equal(
    registeredCandidates({ ...resistor, value: "330Ω" }, circuit)[0].id,
    "akizuki-125331",
  );
  assert.equal(
    registeredCandidates({ ...resistor, value: "470Ω" }, circuit).length,
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
  for (const p of purchaseCatalog)
    assert.ok(
      p.search
        ? storeSearchUrl(p.store, p.url)
        : storeProductUrl(p.store, p.url),
    );
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

test("ST7789 retrieves the exact Akizuki module without substituting an OLED or another size", () => {
  const c = demoCircuit();
  c.parts = [
    { id: "LCD1", kind: "st7789", value: "M154-240240-RGB", purpose: "表示" },
  ];
  const part = purchaseParts(c).find((p) => p.kind === "st7789")!;
  assert.equal(
    registeredCandidates(part, c)[0].url,
    "https://akizukidenshi.com/catalog/g/g131019/",
  );
  assert.deepEqual(registeredCandidates({ ...part, kind: "ssd1306" }, c), []);
  assert.deepEqual(registeredCandidates({ ...part, value: "240x320" }, c), []);
});

test("male–male jumper sets are offered only where the board needs no female ends; DHT22 matches by kind", () => {
  const climate = demoCircuit("esp32", "climate");
  const wire = purchaseParts(climate).find((p) => p.kind === "wire")!;
  assert.deepEqual(
    registeredCandidates(wire, climate).map((p) => p.id),
    ["akizuki-130088", "akizuki-102315"],
  );
  const pi = demoCircuit("raspberry-pi", "climate");
  const piWire = purchaseParts(pi).find((p) => p.kind === "wire")!;
  assert.deepEqual(registeredCandidates(piWire, pi), []);
  const dht = purchaseParts(climate).find((p) => p.kind === "dht22")!;
  assert.equal(
    registeredCandidates({ ...dht, value: "DHT22" }, climate)[0].id,
    "akizuki-107002",
  );
});

test("the 30-pin ESP32 is offered only as an Amazon search link, never for other boards", () => {
  const climate = demoCircuit("esp32", "climate");
  const board = purchaseParts(climate).find((p) => p.kind === "board")!;
  const [entry] = registeredCandidates(board, climate);
  assert.equal(entry.id, "amazon-search-esp32-devkit-v1-30pin");
  assert.equal(entry.search, true);
  assert.equal(
    storeSearchUrl(entry.store, entry.url),
    "https://www.amazon.co.jp/s?k=ESP32+DevKit+V1+30%E3%83%94%E3%83%B3+ESP-WROOM-32",
  );
  const pico = demoCircuit("pico", "climate");
  const picoBoard = purchaseParts(pico).find((p) => p.kind === "board")!;
  assert.deepEqual(registeredCandidates(picoBoard, pico), []);
  for (const url of [
    "https://www.amazon.co.jp/s",
    "https://www.amazon.co.jp.evil.test/s?k=ESP32",
    "https://www.amazon.co.jp/dp/B012345678",
    "http://www.amazon.co.jp/s?k=ESP32",
  ])
    assert.equal(storeSearchUrl("amazon", url), null);
  assert.equal(
    storeSearchUrl("akizuki", "https://akizukidenshi.com/s?k=ESP32"),
    null,
  );
  // A search entry is not a product page and must not pass as one.
  assert.equal(
    registeredCandidates(board, climate, [{ ...entry, search: false }]).length,
    0,
  );
});
