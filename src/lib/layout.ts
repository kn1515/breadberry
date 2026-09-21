import {
  catalog,
  compileCircuit,
  layoutHolePosition,
  partPinHoles,
  placementFor,
  validateCircuit,
  type Circuit,
  type Kind,
} from "./circuit";

export type LayoutIssue = {
  code: "bounds" | "hole" | "overlap" | "net" | "capacity" | "circuit";
  message: string;
  parts: string[];
};

// Model dimensions, in scene units; these are visual clearances, not CAD measurements.
export function partBounds(circuit: Circuit, index: number) {
  const part = circuit.parts[index];
  const placement = placementFor(part, index);
  const start = layoutHolePosition(placement.hole);
  const span = Math.max(...catalog[part.kind].offsets) * 0.24;
  const module = ["bh1750", "bme280", "bmp280", "sht31", "ssd1306"].includes(
    part.kind,
  );
  const dimensions: Partial<Record<Kind, [number, number]>> = {
    resistor: [0.5, 0.24],
    led: [0.4, 0.4],
    dht22: [0.85, 0.45],
    button: [0.62, 0.43],
    potentiometer: [0.65, 0.5],
    reed: [0.6, 0.22],
    ldr: [0.44, 0.13],
    ntc: [0.44, 0.13],
    ds18b20: [0.48, 0.48],
    tilt: [0.48, 0.48],
  };
  const [bodyWidth, depth] = module
    ? [1.02, 0.72]
    : (dimensions[part.kind] ?? [0.48, 0.48]);
  const width = Math.max(span, bodyWidth);
  return {
    x: start[0] + ((placement.reversed ? -1 : 1) * span) / 2,
    z: start[2],
    width,
    depth,
  };
}

export function checkLayout(circuit: Circuit): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const holes = partPinHoles(circuit);
  const byHole = new Map<string, string[]>();
  const byStrip = new Map<string, string[]>();
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    let current = key;
    while (parent.has(current)) current = parent.get(current)!;
    return current;
  };
  for (const wire of circuit.wires) {
    const a = root(wire.from),
      b = root(wire.to);
    if (a !== b) parent.set(a, b);
  }
  for (const [pin, hole] of Object.entries(holes)) {
    const id = pin.split(".")[0];
    const row = Number(hole.slice(1));
    if (row < 1 || row > 30) {
      issues.push({
        code: "bounds",
        parts: [id],
        message: `${pin}: ${hole.toUpperCase()} はブレッドボードの範囲外です。`,
      });
      continue;
    }
    byHole.set(hole, [...(byHole.get(hole) ?? []), pin]);
    const strip = `${hole[0] <= "e" ? "a–e" : "f–j"}${row}`;
    byStrip.set(strip, [...(byStrip.get(strip) ?? []), pin]);
  }
  for (const [hole, pins] of byHole) {
    if (pins.length > 1)
      issues.push({
        code: "hole",
        parts: pins.map((p) => p.split(".")[0]),
        message: `${hole.toUpperCase()}: ${pins.join(" / ")} が同じ穴を使用しています。`,
      });
  }
  for (const [strip, pins] of byStrip) {
    if (new Set(pins.map(root)).size > 1)
      issues.push({
        code: "net",
        parts: pins.map((p) => p.split(".")[0]),
        message: `${strip}: ${pins.join(" / ")} が導通列を共有し、意図しない接続になります。`,
      });
  }
  const bounds = circuit.parts.map((_, index) => partBounds(circuit, index));
  bounds.forEach((a, index) => {
    if (
      Math.abs(a.x) + a.width / 2 > 4.075 ||
      Math.abs(a.z) + a.depth / 2 > 2.35
    )
      issues.push({
        code: "bounds",
        parts: [circuit.parts[index].id],
        message: `${circuit.parts[index].id}: 部品の本体が基板の外にはみ出しています。`,
      });
    bounds.slice(index + 1).forEach((b, offset) => {
      if (
        Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 0.01 &&
        Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - 0.01
      ) {
        const parts = [
          circuit.parts[index].id,
          circuit.parts[index + offset + 1].id,
        ];
        issues.push({
          code: "overlap",
          parts,
          message: `${parts.join(" / ")}: 部品の表示領域が重なっています。`,
        });
      }
    });
  });
  const compiled = compileCircuit(circuit);
  compiled.allocationIssues.forEach((message) =>
    issues.push({ code: "capacity", parts: [message.split(".")[0]], message }),
  );
  try {
    validateCircuit(circuit);
  } catch (e) {
    issues.push({
      code: "circuit",
      parts: [],
      message:
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "回路は未完成か、自動回路検査の上限（部品6個・配線24本）を超えています。",
    });
  }
  return issues;
}

export function addPart(circuit: Circuit, kind: Kind): Circuit {
  if (circuit.parts.length >= 30) return circuit;
  let n = 1;
  while (circuit.parts.some((p) => p.id === `P${n}`)) n++;
  const occupied = new Set(
    Object.values(partPinHoles(circuit)).map(
      (h) => `${h[0] <= "e" ? "left" : "right"}${h.slice(1)}`,
    ),
  );
  let hole = "g1";
  outer: for (const col of ["b", "g"]) {
    for (let row = 1; row <= 30 - Math.max(...catalog[kind].offsets); row++) {
      if (
        catalog[kind].offsets.every(
          (offset) =>
            !occupied.has(`${col === "b" ? "left" : "right"}${row + offset}`),
        )
      ) {
        hole = `${col}${row}`;
        break outer;
      }
    }
  }
  return {
    ...circuit,
    parts: [
      ...circuit.parts,
      {
        id: `P${n}`,
        kind,
        value:
          kind === "resistor"
            ? "330Ω"
            : ["ntc", "potentiometer"].includes(kind)
              ? "10kΩ"
              : "",
        purpose: "ユーザーが追加した部品",
        placement: { hole, reversed: false },
      },
    ],
  };
}

export function removePart(circuit: Circuit, id: string): Circuit {
  // Freeze legacy automatic positions before changing array indices.
  return {
    ...circuit,
    parts: circuit.parts
      .map((p, i) => ({ ...p, placement: placementFor(p, i) }))
      .filter((p) => p.id !== id),
    wires: circuit.wires.filter(
      (w) => !w.from.startsWith(`${id}.`) && !w.to.startsWith(`${id}.`),
    ),
  };
}
