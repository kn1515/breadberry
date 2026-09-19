import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCircuit } from "../../src/lib/demo";
import {
  catalog,
  boards,
  circuitSchema,
  isI2c,
  isAnalog,
  compileCircuit,
  validateCircuit,
  billOfMaterials,
  type Kind,
  type Board,
  type Circuit,
} from "../../src/lib/circuit";

const added: Kind[] = [
  "bme280",
  "bmp280",
  "sht31",
  "ssd1306",
  "ds18b20",
  "potentiometer",
  "ntc",
  "reed",
  "tilt",
];
const wire = (from: string, to: string): Circuit["wires"][number] => ({
  from,
  to,
  color: "#38bdf8",
  explanation: "テスト配線",
});
function fixture(kind: Kind, board: Board): Circuit {
  if (kind === "ds18b20") return demoCircuit(board, "temperature");
  const c = demoCircuit(board, "led");
  const adc =
    board === "pico" ? "GP26" : board === "esp32" ? "GPIO34" : "GPIO4";
  const input = board === "pico" ? "GP15" : "GPIO4";
  c.parts = [
    {
      id: "U1",
      kind,
      value: isAnalog(kind) ? "10kΩ" : "module",
      purpose: "テスト",
    },
  ];
  if (isI2c(kind)) {
    const sda =
      board === "pico" ? "GP4" : board === "esp32" ? "GPIO21" : "GPIO2";
    const scl =
      board === "pico" ? "GP5" : board === "esp32" ? "GPIO22" : "GPIO3";
    c.wires = [
      wire("board.3V3", "U1.VCC"),
      wire("board.GND", "U1.GND"),
      wire(`board.${sda}`, "U1.SDA"),
      wire(`board.${scl}`, "U1.SCL"),
    ];
  } else if (kind === "potentiometer") {
    c.wires = [
      wire("board.3V3", "U1.1"),
      wire("board.GND", "U1.3"),
      wire(`board.${adc}`, "U1.W"),
    ];
  } else if (kind === "ntc") {
    c.parts.push({
      id: "R1",
      kind: "resistor",
      value: "10kΩ",
      purpose: "分圧",
    });
    c.wires = [
      wire("board.3V3", "U1.1"),
      wire("U1.2", "R1.1"),
      wire(`board.${adc}`, "U1.2"),
      wire("R1.2", "board.GND"),
    ];
  } else {
    c.wires = [wire(`board.${input}`, "U1.1"), wire("board.GND", "U1.2")];
  }
  return c;
}

for (const board of Object.keys(boards) as Board[]) {
  for (const kind of added) {
    test(`${board}: ${kind} connects, compiles without hole collisions and exports BOM`, () => {
      const c = fixture(kind, board);
      if (board === "raspberry-pi" && isAnalog(kind)) {
        assert.throws(() => validateCircuit(c), /ADC/);
        return;
      }
      validateCircuit(c);
      const { pinHoles, wires, steps } = compileCircuit(c);
      const holes = Object.values(pinHoles);
      for (const w of wires)
        for (const end of [w.start, w.end]) {
          if (/^[A-J]\d+ →/.test(end.label))
            holes.push(end.label.split(" → ")[0].toLowerCase());
        }
      assert.equal(new Set(holes).size, holes.length);
      assert.equal(steps.length, c.parts.length + c.wires.length);
      assert.ok(
        billOfMaterials(c).some(
          (p) => p.kind === kind && p.name === catalog[kind].name,
        ),
      );
    });
  }
  for (const example of ["temperature", "display"] as const) {
    test(`${board}: offline ${example} sample is valid`, () => {
      const c = demoCircuit(board, example);
      assert.doesNotThrow(() => validateCircuit(c));
      assert.ok(c.firmware.length > 100);
      if (example === "display") assert.match(c.firmware, /0x3C/);
      if (example === "temperature" && board !== "raspberry-pi") {
        assert.match(c.firmware, board === "pico" ? /Pin\(15\)/ : /Pin\(4\)/);
        assert.match(c.firmware, /sleep_ms\(750\)/);
      }
    });
  }
}

test("catalog and generation schema expose the same part kinds", () => {
  assert.deepEqual(
    new Set(circuitSchema.shape.parts.element.shape.kind.options),
    new Set(Object.keys(catalog)),
  );
  for (const def of Object.values(catalog)) {
    assert.equal(def.pins.length, def.offsets.length);
    assert.equal(new Set(def.offsets).size, def.offsets.length);
    assert.ok(def.offsets.every((n) => n >= 0 && n < 5));
  }
});

test("DS18B20 requires external power and a 4.7k pullup on a bidirectional pin", () => {
  for (const resistance of ["10kΩ", "0Ω", "1Ω"]) {
    const c = fixture("ds18b20", "esp32");
    c.parts[1].value = resistance;
    assert.throws(() => validateCircuit(c), /4.7k|抵抗値/);
  }
  const c = fixture("ds18b20", "esp32");
  c.parts[1].value = "4700ohm";
  assert.doesNotThrow(() => validateCircuit(c));
  c.wires[2].from = "board.GPIO34";
  assert.throws(() => validateCircuit(c), /双方向/);
  const wrongPower = fixture("ds18b20", "esp32");
  wrongPower.wires[0].from = "board.GPIO16";
  assert.throws(() => validateCircuit(wrongPower), /電源/);
  const missing = fixture("ds18b20", "esp32");
  missing.wires.pop();
  assert.throws(() => validateCircuit(missing), /4.7k|未接続/);
});

for (const kind of added.filter(isI2c)) {
  test(`${kind}: rejects wrong power, input-only GPIO, wrong Pi I2C bus and missing pins`, () => {
    const c = fixture(kind, "esp32");
    c.wires[0].from = "board.GPIO16";
    assert.throws(() => validateCircuit(c), /電源/);
    const inputOnly = fixture(kind, "esp32");
    inputOnly.wires[2].from = "board.GPIO34";
    assert.throws(() => validateCircuit(inputOnly), /双方向/);
    const pi = fixture(kind, "raspberry-pi");
    pi.wires[2].from = "board.GPIO4";
    assert.throws(() => validateCircuit(pi), /I2C1/);
    const missing = fixture(kind, "pico");
    missing.wires.pop();
    assert.throws(() => validateCircuit(missing), /未接続/);
  });
}

test("I2C sensors share bus and supply via unique holes; duplicate addresses are rejected", () => {
  const c = fixture("bme280", "esp32");
  c.parts.push({
    id: "U2",
    kind: "ssd1306",
    value: "128x64 / 0x3C",
    purpose: "表示",
  });
  for (const pin of ["VCC", "GND", "SCL", "SDA"])
    c.wires.push(wire(`U1.${pin}`, `U2.${pin}`));
  assert.doesNotThrow(() => validateCircuit(c));
  c.parts[1].kind = "bmp280";
  assert.throws(() => validateCircuit(c), /アドレス/);
});

for (const kind of ["potentiometer", "ntc"] as const) {
  test(`${kind}: rejects non-ADC input and incorrect resistance`, () => {
    const c = fixture(kind, "pico");
    c.wires[2].from = "board.GP15";
    assert.throws(() => validateCircuit(c), /ADC/);
    const resistance = fixture(kind, "esp32");
    resistance.parts[0].value = "1Ω";
    assert.throws(() => validateCircuit(resistance), /10k/);
  });
}

test("NTC needs a real 10k divider and switches need internal pullups", () => {
  const c = fixture("ntc", "esp32");
  c.parts[1].value = "100Ω";
  assert.throws(() => validateCircuit(c), /10k/);
  for (const kind of ["reed", "tilt"] as const) {
    const c = fixture(kind, "esp32");
    c.wires[0].from = "board.GPIO34";
    assert.throws(() => validateCircuit(c), /プルアップ/);
  }
});
