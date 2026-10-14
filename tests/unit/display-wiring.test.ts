import { test } from "node:test";
import assert from "node:assert/strict";
import { TubeGeometry, Vector3 } from "three";
import {
  compileCircuit,
  getBreadboards,
  splitHole,
  validateCircuit,
  type Board,
  type Circuit,
} from "../../src/lib/circuit";
import { demoCircuit } from "../../src/lib/demo";
import { runCircuitAgent } from "../../src/lib/agent";
import { addPart, checkLayout } from "../../src/lib/layout";
import { displayCoversPoint, st7789Geometry } from "../../src/lib/st7789";
import {
  createWireCurve,
  DISPLAY_WIRE_SEGMENTS,
  WIRE_RADIUS,
} from "../../src/lib/wiring";

function game(board: Board = "esp32", reversed = false): Circuit {
  const gpio =
    board === "pico"
      ? ["GP2", "GP3", "GP4", "GP5", "GP6", "GP7"]
      : board === "raspberry-pi"
        ? ["GPIO17", "GPIO23", "GPIO25", "GPIO5", "GPIO22", "GPIO4"]
        : ["GPIO17", "GPIO23", "GPIO16", "GPIO5", "GPIO19", "GPIO4"];
  const wire = (from: string, to: string): Circuit["wires"][number] => ({
    from,
    to,
    color: "#38bdf8",
    explanation: "配線",
  });
  return {
    ...demoCircuit(board, "led"),
    breadboards: [{ id: "BB1" }],
    parts: [
      {
        id: "LCD1",
        kind: "st7789",
        value: "M154-240240-RGB",
        purpose: "ゲーム画面",
        placement: {
          hole: reversed ? (board === "raspberry-pi" ? "f30" : "f16") : "e9",
          reversed,
        },
      },
      {
        id: "SW1",
        kind: "button",
        value: "",
        purpose: "ゲーム操作",
        placement: {
          hole: reversed && board === "raspberry-pi" ? "b9" : "b23",
          reversed: false,
        },
      },
    ],
    wires: [
      wire("board.3V3", "LCD1.VCC"),
      wire("board.GND", "LCD1.GND"),
      ...["SCL", "SDA", "RES", "DC", "CS"].map((pin, i) =>
        wire(`board.${gpio[i]}`, `LCD1.${pin}`),
      ),
      wire("LCD1.VCC", "LCD1.BLK"),
      wire(`board.${gpio[5]}`, "SW1.1"),
      wire("LCD1.GND", "SW1.2"),
    ],
  };
}

for (const board of ["esp32", "pico", "raspberry-pi"] as const) {
  for (const reversed of [false, true]) {
    test(`${board}, reversed=${reversed}: LCD/button jumpers use exposed holes on the correct strips`, () => {
      const c = game(board, reversed);
      const before = JSON.stringify(c);
      validateCircuit(c);
      const compiled = compileCircuit(c);
      assert.equal(getBreadboards(c).length, 1);
      assert.deepEqual(compiled.allocationIssues, []);
      const occupied = new Set(Object.values(compiled.pinHoles));
      for (const w of compiled.wires) {
        for (const [key, endpoint] of [
          [w.from, w.start],
          [w.to, w.end],
        ] as const) {
          assert.ok(endpoint.accessible);
          assert.ok(
            compiled.displayBounds.every(
              (b) =>
                !displayCoversPoint(
                  b,
                  endpoint.position[0],
                  endpoint.position[2],
                ),
            ),
          );
          if (!compiled.pinHoles[key]) continue;
          const hole = endpoint.label.split(" → ")[0].toLowerCase();
          assert.ok(!occupied.has(hole));
          occupied.add(hole);
          const pin = splitHole(compiled.pinHoles[key]);
          const jumper = splitHole(hole);
          assert.equal(jumper.breadboard, pin.breadboard);
          assert.equal(jumper.hole.slice(1), pin.hole.slice(1));
          assert.equal(jumper.hole[0] <= "e", pin.hole[0] <= "e");
        }
      }
      assert.equal(
        JSON.stringify(c),
        before,
        "Saved placements and logical connections remain unchanged",
      );
    });
  }
}

test("covered holes and insufficient branch holes are reported while saved circuits remain editable", () => {
  for (const placement of [
    { hole: "b9", reversed: false },
    { hole: "i16", reversed: true },
  ]) {
    const c = game();
    c.parts[0].placement = placement;
    const compiled = compileCircuit(c);
    assert.ok(compiled.allocationIssues.length);
    assert.ok(
      compiled.wires.some((w) => !w.start.accessible || !w.end.accessible),
    );
    assert.doesNotThrow(() => validateCircuit(c));
    assert.ok(checkLayout(c).some((i) => i.code === "capacity"));
  }
  const c = game();
  c.parts[0].placement = { hole: "c9", reversed: false };
  assert.ok(
    compileCircuit(c).allocationIssues.some((issue) =>
      issue.includes("空き穴"),
    ),
  ); // VCC/GND each need two holes.
});

test("the LCD footprint also blocks jumper holes for other components", () => {
  const c = game();
  c.parts[1].placement = { hole: "g12", reversed: false };
  const compiled = compileCircuit(c);
  assert.ok(
    compiled.allocationIssues.some((issue) => issue.startsWith("SW1.")),
  );
  assert.ok(
    compiled.wires
      .filter((w) => w.to.startsWith("SW1."))
      .every((w) => !w.end.accessible),
  );
});

test("a reversed LCD cannot cover the Raspberry Pi header connection", () => {
  const c = game("raspberry-pi", true);
  c.parts[0].placement!.hole = "f16";
  const compiled = compileCircuit(c);
  assert.ok(
    compiled.allocationIssues.some((issue) => issue.startsWith("board.3V3:")),
  );
  assert.equal(compiled.wires[0].start.accessible, false);
  assert.ok(
    checkLayout(c).some((issue) =>
      issue.message.includes("液晶基板が接続先を覆っています"),
    ),
  );
});

test("the supplied game request retries a covered LCD placement with actionable feedback", async (t) => {
  const names = ["GEMINI_API_KEY", "GMI_API_KEY", "AGENT_MAX_ATTEMPTS"];
  const previous = names.map((name) => process.env[name]);
  process.env.GEMINI_API_KEY = "test-key";
  delete process.env.GMI_API_KEY;
  process.env.AGENT_MAX_ATTEMPTS = "2";
  t.after(() =>
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    }),
  );
  t.mock.method(console, "log", () => {});
  let attempts = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const c = game();
      attempts++;
      if (attempts === 1) c.parts[0].placement!.hole = "b9";
      else {
        const input = JSON.parse(body.contents[0].parts[0].text);
        assert.match(input.repairFeedback, /液晶基板の外側/);
        assert.match(input.repairFeedback, /E列/);
      }
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(c) }] },
          },
        ],
      });
    },
  );
  const result = await runCircuitAgent(
    "以下の条件で遊べる簡単なゲームが動くようにしてください。ブレッドボードは一つ。240*240のモニタを結線。ボタンはひとつ。",
    "esp32",
    undefined,
    "ja",
    "display-wiring-test",
  );
  assert.equal(attempts, 2);
  assert.equal(result.circuit.parts[0].placement!.hole, "e9");
  assert.deepEqual(compileCircuit(result.circuit).allocationIssues, []);
  assert.ok(
    result.agentEvents.some(
      (event) => event.step === "validation" && event.outcome === "failed",
    ),
  );
  assert.ok(
    result.agentEvents.some(
      (event) => event.step === "repair" && event.outcome === "retry",
    ),
  );
});

test("reversed and translated LCDs exclude hidden rail holes and respect BB2 origin", () => {
  const c = game("esp32", true);
  c.breadboards!.push({ id: "BB2" });
  c.parts.forEach((p) => {
    p.placement!.breadboard = "BB2";
  });
  c.wires[0].to = "rail.BB2.VCC";
  c.wires[1].to = "rail.BB2.GND";
  c.wires.push(
    { ...c.wires[0], from: "rail.BB2.VCC", to: "LCD1.VCC" },
    { ...c.wires[1], from: "rail.BB2.GND", to: "LCD1.GND" },
  );
  validateCircuit(c);
  const compiled = compileCircuit(c);
  assert.ok(compiled.displayBounds[0].x > 5);
  for (const w of compiled.wires) {
    for (const endpoint of [w.start, w.end]) {
      assert.ok(endpoint.accessible);
      assert.ok(
        !displayCoversPoint(
          compiled.displayBounds[0],
          endpoint.position[0],
          endpoint.position[2],
        ),
      );
    }
  }
});

test("new LCD placements leave exposed holes for power and button branches", () => {
  const c = addPart({ ...game(), parts: [], wires: [] }, "st7789");
  assert.equal(c.parts[0].placement?.hole[0], "e");
  const fallback = addPart(
    {
      ...game(),
      parts: [
        {
          ...game().parts[0],
          id: "FIRST",
          placement: { hole: "e1", reversed: false },
        },
        {
          ...game().parts[0],
          id: "SECOND",
          placement: { hole: "e9", reversed: false },
        },
        {
          ...game().parts[0],
          id: "THIRD",
          placement: { hole: "e17", reversed: false },
        },
      ],
      wires: [],
    },
    "st7789",
  ).parts.at(-1)!;
  assert.equal(fallback.placement?.hole, "f8");
  assert.equal(fallback.placement?.reversed, true);
});

test("rendered wire tubes stay outside the LCD body in normal, reversed and multi-board layouts", () => {
  for (const board of ["esp32", "pico", "raspberry-pi"] as const) {
    for (const reversed of [false, true]) {
      for (const breadboard of ["BB1", "BB2"]) {
        const c = game(board, reversed);
        if (breadboard === "BB2") c.breadboards!.push({ id: "BB2" });
        c.parts.forEach((p) => {
          p.placement!.breadboard = breadboard;
        });
        const compiled = compileCircuit(c);
        compiled.wires.forEach((w, i) => {
          const curve = createWireCurve(
            w.start.position,
            w.end.position,
            i,
            compiled.displayBounds,
          );
          assert.ok(
            curve.getPoint(0).distanceTo(new Vector3(...w.start.position)) <
              1e-8,
          );
          assert.ok(
            curve.getPoint(1).distanceTo(new Vector3(...w.end.position)) < 1e-8,
          );
          const tube = new TubeGeometry(
            curve,
            DISPLAY_WIRE_SEGMENTS,
            WIRE_RADIUS,
            6,
            false,
          );
          const positions = tube.getAttribute("position");
          for (let v = 0; v < positions.count; v++) {
            const x = positions.getX(v),
              y = positions.getY(v),
              z = positions.getZ(v);
            assert.ok(
              y > st7789Geometry.top ||
                !compiled.displayBounds.some((b) =>
                  displayCoversPoint(b, x, z, 0),
                ),
              `${board}/${reversed}/${breadboard}: wire ${i} enters LCD at ${x},${y},${z}`,
            );
          }
          tube.dispose();
        });
      }
    }
  }
});
