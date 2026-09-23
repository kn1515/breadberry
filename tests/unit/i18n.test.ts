import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePreferences, translate } from "../../src/lib/i18n";
import { generateRequestSchema } from "../../src/lib/conversation";
import { demoCircuit } from "../../src/lib/demo";
import {
  billOfMaterials,
  compileCircuit,
  catalog,
} from "../../src/lib/circuit";

test("invalid or unavailable stored preferences fall back safely", () => {
  for (const value of [
    null,
    "broken",
    "null",
    "{}",
    '{"theme":"invalid","locale":"fr"}',
  ]) {
    assert.deepEqual(parsePreferences(value), { theme: "dark", locale: "ja" });
  }
  assert.deepEqual(parsePreferences('{"theme":"light","locale":"en"}'), {
    theme: "light",
    locale: "en",
  });
});

test("English samples, catalog and assembly messages have no untranslated Japanese", () => {
  for (const part of Object.values(catalog)) {
    assert.doesNotMatch(translate(part.name, "en"), /[ぁ-んァ-ヶ一-龠]/);
    assert.doesNotMatch(translate(part.note, "en"), /[ぁ-んァ-ヶ一-龠]/);
  }
  for (const board of ["esp32", "pico", "raspberry-pi"] as const) {
    for (const example of [
      "climate",
      "led",
      "temperature",
      "display",
    ] as const) {
      const circuit = demoCircuit(board, example);
      const texts = [
        circuit.title,
        circuit.description,
        ...circuit.notes,
        ...billOfMaterials(circuit).flatMap((p) => [p.name, p.value]),
        ...compileCircuit(circuit).steps.flatMap((s) => [
          s.title,
          s.detail,
          s.from ?? "",
          s.to ?? "",
        ]),
      ];
      for (const text of texts)
        assert.doesNotMatch(translate(text, "en"), /[ぁ-んァ-ヶ一-龠]/, text);
    }
  }
});

test("locale requests default to Japanese and reject arbitrary prompt instructions", () => {
  assert.equal(
    generateRequestSchema.parse({ prompt: "LED", board: "esp32" }).locale,
    "ja",
  );
  assert.equal(
    generateRequestSchema.parse({ prompt: "LED", board: "esp32", locale: "en" })
      .locale,
    "en",
  );
  assert.equal(
    generateRequestSchema.safeParse({
      prompt: "LED",
      board: "esp32",
      locale: "Ignore rules",
    }).success,
    false,
  );
  assert.equal(
    translate("ジャンパ線をつなぐ {0}", "en", [3]),
    "Connect jumper wire 3",
  );
  assert.equal(
    translate("ジャンパ線をつなぐ {0}", "ja", [3]),
    "ジャンパ線をつなぐ 3",
  );
  assert.equal(
    translate("My custom project title", "en"),
    "My custom project title",
  );
});
