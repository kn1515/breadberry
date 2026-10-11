import { isDip } from "./logic";
import {
  catalog,
  getBreadboards,
  breadboardPosition,
  splitHole,
  qualifyHole,
  MAX_PARTS,
  MAX_BREADBOARDS,
  compileCircuit,
  layoutHolePosition,
  holePosition,
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
  const start = layoutHolePosition(
    qualifyHole(placement.hole, placement.breadboard),
  );
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
  const [bodyWidth, depth] = isDip(part.kind)
    ? [span + 0.3, 0.75]
    : part.kind === "capacitor"
      ? [0.45, 0.25]
      : module
        ? [1.02, 0.72]
        : (dimensions[part.kind] ?? [0.48, 0.48]);
  const width = Math.max(span, bodyWidth);
  return {
    x: start[0] + ((placement.reversed ? -1 : 1) * span) / 2,
    z: isDip(part.kind)
      ? breadboardPosition(placement.breadboard ?? "BB1")[2]
      : start[2],
    breadboard: placement.breadboard ?? "BB1",
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
  for (const [pin, qualified] of Object.entries(holes)) {
    const { breadboard, hole } = splitHole(qualified);
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
    byHole.set(qualified, [...(byHole.get(qualified) ?? []), pin]);
    const strip = `${breadboard}:${hole[0] <= "e" ? "a–e" : "f–j"}${row}`;
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
      Math.abs(a.x - breadboardPosition(a.breadboard)[0]) + a.width / 2 >
        4.075 ||
      Math.abs(a.z - breadboardPosition(a.breadboard)[2]) + a.depth / 2 > 2.35
    )
      issues.push({
        code: "bounds",
        parts: [circuit.parts[index].id],
        message: `${circuit.parts[index].id}: 部品の本体が基板の外にはみ出しています。`,
      });
    bounds.slice(index + 1).forEach((b, offset) => {
      if (
        a.breadboard === b.breadboard &&
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
          : "回路は未完成か、自動回路検査の上限（部品48個・配線240本）を超えています。",
    });
  }
  return issues;
}

export function addBreadboard(circuit: Circuit): Circuit {
  const boards = getBreadboards(circuit);
  if (boards.length >= MAX_BREADBOARDS) return circuit;
  const id = Array.from(
    { length: MAX_BREADBOARDS },
    (_, i) => `BB${i + 1}`,
  ).find((id) => !boards.some((b) => b.id === id))!;
  return { ...circuit, breadboards: [...boards, { id }] };
}
export function canRemoveBreadboard(circuit: Circuit, id: string) {
  return (
    id !== "BB1" &&
    !circuit.parts.some(
      (p, i) => (placementFor(p, i).breadboard ?? "BB1") === id,
    ) &&
    !circuit.wires.some(
      (w) => w.from.startsWith(`${id}.`) || w.to.startsWith(`${id}.`),
    )
  );
}
export function removeBreadboard(circuit: Circuit, id: string): Circuit {
  return canRemoveBreadboard(circuit, id)
    ? {
        ...circuit,
        breadboards: getBreadboards(circuit).filter((b) => b.id !== id),
      }
    : circuit;
}
export function addPart(circuit: Circuit, kind: Kind): Circuit {
  if (circuit.parts.length >= MAX_PARTS) return circuit;
  let n = 1;
  while (circuit.parts.some((p) => p.id === `P${n}`)) n++;
  const occupied = new Set(
    Object.values(partPinHoles(circuit)).map((h) => {
      const { breadboard, hole } = splitHole(h);
      return `${breadboard}:${hole[0] <= "e" ? "left" : "right"}${hole.slice(1)}`;
    }),
  );
  let placement = {
    hole: isDip(kind) ? "e1" : "g1",
    reversed: false,
    breadboard: "BB1",
  };
  outer: for (const { id } of getBreadboards(circuit))
    for (const col of isDip(kind) ? ["e"] : ["b", "g"]) {
      for (let row = 1; row <= 30 - Math.max(...catalog[kind].offsets); row++) {
        if (
          catalog[kind].offsets.every((offset) =>
            [
              col === "g" ? "right" : "left",
              ...(isDip(kind) ? ["right"] : []),
            ].every((side) => !occupied.has(`${id}:${side}${row + offset}`)),
          )
        ) {
          placement = { hole: `${col}${row}`, reversed: false, breadboard: id };
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
            : kind === "capacitor"
              ? "100nF"
              : ["ntc", "potentiometer"].includes(kind)
                ? "10kΩ"
                : "",
        purpose: "ユーザーが追加した部品",
        placement,
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

/** Snap local X/Z coordinates to a signal hole; rails and off-board drops are excluded. */
export function nearestLayoutHole(
  x: number,
  z: number,
  circuit?: Circuit,
): string | null {
  if (circuit) {
    for (const { id } of getBreadboards(circuit)) {
      const origin = breadboardPosition(id);
      const hole = nearestLayoutHole(x - origin[0], z - origin[2]);
      if (hole) return qualifyHole(hole, id);
    }
    return null;
  }
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    Math.abs(x) > 3.6 ||
    Math.abs(z) > 1.4
  )
    return null;
  const row = Math.max(1, Math.min(30, Math.round(x / 0.24 + 15.5)));
  const col = [..."abcdefghij"].reduce((a, b) =>
    Math.abs(holePosition(`${a}1`)[2] - z) <=
    Math.abs(holePosition(`${b}1`)[2] - z)
      ? a
      : b,
  );
  return `${col}${row}`;
}

export function movePart(circuit: Circuit, id: string, hole: string): Circuit {
  return {
    ...circuit,
    parts: circuit.parts.map((p, i) =>
      p.id === id
        ? {
            ...p,
            placement: {
              ...placementFor(p, i),
              hole: isDip(p.kind)
                ? `e${splitHole(hole).hole.slice(1)}`
                : splitHole(hole).hole,
              ...(splitHole(hole).breadboard !== "BB1" ||
              p.placement?.breadboard
                ? { breadboard: splitHole(hole).breadboard }
                : {}),
            },
          }
        : p,
    ),
  };
}
