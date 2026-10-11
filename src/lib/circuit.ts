import {
  logicCatalog,
  supportCatalog,
  isDip,
  isLogic,
  logicOutput,
} from "./logic";
import type { ChatMessage } from "./conversation";
import { z } from "zod";
import { ledColorNames, resolveLedColor, type LedColor } from "./led";

export const boardSchema = z.enum(["esp32", "pico", "raspberry-pi"]);
export type Board = z.infer<typeof boardSchema>;
export const boards: Record<
  Board,
  { name: string; detail: string; pins: Record<string, number> }
> = {
  esp32: {
    name: "ESP32 DevKit V1",
    detail: "30 pin · 3.3 V logic",
    pins: {
      "3V3": 1,
      GND: 2,
      GPIO15: 3,
      GPIO2: 4,
      GPIO4: 5,
      GPIO16: 6,
      GPIO17: 7,
      GPIO5: 8,
      GPIO18: 9,
      GPIO19: 10,
      GPIO21: 11,
      GPIO22: 14,
      GPIO23: 15,
      GPIO32: 25,
      GPIO33: 24,
      GPIO34: 27,
      GPIO35: 26,
    },
  },
  pico: {
    name: "Raspberry Pi Pico",
    detail: "RP2040 · 3.3 V logic",
    pins: {
      "3V3": 36,
      GND: 38,
      GP0: 1,
      GP1: 2,
      GP2: 4,
      GP3: 5,
      GP4: 6,
      GP5: 7,
      GP6: 9,
      GP7: 10,
      GP8: 11,
      GP9: 12,
      GP10: 14,
      GP11: 15,
      GP12: 16,
      GP13: 17,
      GP14: 19,
      GP15: 20,
      GP26: 31,
      GP27: 32,
      GP28: 34,
    },
  },
  "raspberry-pi": {
    name: "Raspberry Pi 4 / 5",
    detail: "40 pin header · BCM numbering",
    pins: {
      "3V3": 1,
      GND: 6,
      GPIO2: 3,
      GPIO3: 5,
      GPIO4: 7,
      GPIO17: 11,
      GPIO27: 13,
      GPIO22: 15,
      GPIO23: 16,
      GPIO24: 18,
      GPIO25: 22,
      GPIO5: 29,
      GPIO6: 31,
      GPIO12: 32,
      GPIO13: 33,
      GPIO19: 35,
      GPIO16: 36,
      GPIO26: 37,
      GPIO20: 38,
      GPIO21: 40,
    },
  },
};
function i2cModule(name: string, color: string, note: string) {
  return {
    name,
    pins: ["VCC", "GND", "SCL", "SDA"],
    offsets: [0, 1, 2, 3],
    color,
    note: `3.3V対応・I2C設定済み・プルアップ内蔵の変換基板を使用。4信号を端子名で対応させて配線してください。図の並びは接続用の模式配置です。実物の印字を優先し、ピン順が違う場合はジャンパ線で引き出してください。${note}`,
  } as const;
}
export const catalog = {
  ...logicCatalog,
  ...supportCatalog,
  led: {
    name: "LED",
    pins: ["A", "K"],
    offsets: [0, 1],
    color: "#34d399",
    note: "A = アノード（長い脚）、K = カソード（短い脚）",
  },
  resistor: {
    name: "抵抗",
    pins: ["1", "2"],
    offsets: [0, 4],
    color: "#d4b58b",
    note: "極性なし。指定の抵抗値を確認してください。",
  },
  dht22: {
    name: "DHT22 温湿度センサー",
    pins: ["VCC", "DATA", "NC", "GND"],
    offsets: [0, 1, 2, 3],
    color: "#e6eef8",
    note: "正面の通気穴を手前にして左から VCC / DATA / NC / GND。DATA に 10 kΩ プルアップが必要です。",
  },
  ldr: {
    name: "CdS 光センサー",
    pins: ["1", "2"],
    offsets: [0, 1],
    color: "#e6b478",
    note: "極性なし。抵抗との分圧回路が必要です。",
  },
  button: {
    name: "2ピン押しボタン",
    pins: ["1", "2"],
    offsets: [0, 2],
    color: "#818cf8",
    note: "2ピン・常開タイプ。4ピンのタクトスイッチは対象外です。",
  },
  bh1750: {
    name: "BH1750 照度モジュール",
    pins: ["VCC", "GND", "SCL", "SDA"],
    offsets: [0, 1, 2, 3],
    color: "#3b82f6",
    note: "3.3 V 対応、プルアップ内蔵の4ピン変換基板。製品の印字を優先してください。",
  },
  bme280: i2cModule(
    "BME280 温湿度・気圧モジュール",
    "#b76de0",
    "I2Cアドレス0x76。BMP280と異なり湿度も測れます。",
  ),
  bmp280: i2cModule(
    "BMP280 温度・気圧モジュール",
    "#648ee8",
    "I2Cアドレス0x76。湿度は測れません。",
  ),
  sht31: i2cModule("SHT31 温湿度モジュール", "#31b5a3", "I2Cアドレス0x44。"),
  ssd1306: i2cModule(
    "SSD1306 OLEDディスプレイ",
    "#345275",
    "128×64、I2Cアドレス0x3C、リセット回路内蔵の4端子モジュール。SPI版は対象外です。",
  ),
  ds18b20: {
    name: "DS18B20 温度センサー",
    pins: ["GND", "DQ", "VDD"],
    offsets: [0, 1, 2],
    color: "#303746",
    note: "TO-92の平らな面を手前、脚を下にして左からGND / DQ / VDD。VDDは3.3V、DQは4.7kΩで3.3Vへプルアップ。寄生電源方式は使用しません。",
  },
  potentiometer: {
    name: "可変抵抗",
    pins: ["1", "W", "3"],
    offsets: [0, 1, 2],
    color: "#367bc7",
    note: "10kΩの3端子可変抵抗。1=3.3V、3=GND、摺動端子W=ADC入力。端子の位置は製品仕様で確認。Pi 4/5はADC非搭載のため対象外です。",
  },
  ntc: {
    name: "NTC サーミスタ",
    pins: ["1", "2"],
    offsets: [0, 1],
    color: "#d97745",
    note: "極性なし。10kΩ（25℃）を想定。3.3Vと10kΩ固定抵抗で分圧してADCで読み取ります。温度換算には実物のB定数・校正が必要です。Pi 4/5は対象外です。",
  },
  reed: {
    name: "リードスイッチ",
    pins: ["1", "2"],
    offsets: [0, 4],
    color: "#87bdb0",
    note: "2端子・常開（NO）・無電圧接点タイプ。内部プルアップ対応GPIOとGNDの間に接続。磁石で開閉します。ガラス管の脚を根元で曲げないでください。",
  },
  tilt: {
    name: "傾斜スイッチ",
    pins: ["1", "2"],
    offsets: [0, 1],
    color: "#c6a856",
    note: "2端子・無電圧接点のボール式。内部プルアップ対応GPIOとGNDの間に接続。向きによるON/OFFとチャタリングを考慮してください。",
  },
} as const;
export type Kind = keyof typeof catalog;
export const partKinds = Object.keys(catalog) as [Kind, ...Kind[]];
export const i2cAddresses: Partial<Record<Kind, number>> = {
  bh1750: 0x23,
  bme280: 0x76,
  bmp280: 0x76,
  sht31: 0x44,
  ssd1306: 0x3c,
};
export const isI2c = (kind: Kind) => i2cAddresses[kind] !== undefined;
export const isAnalog = (kind: Kind) =>
  ["ldr", "ntc", "potentiometer"].includes(kind);
const isSwitch = (kind: Kind) => ["button", "reed", "tilt"].includes(kind);
export function resistanceOhms(value: string): number {
  if (!/^(\d+(\.\d+)?)\s*(k|M)?(Ω|ohm)?$/.test(value)) return NaN;
  return (
    parseFloat(value) *
    (value.includes("k") ? 1000 : value.includes("M") ? 1e6 : 1)
  );
}
export const MAX_PARTS = 48;
export const MAX_WIRES = 240;
export const MAX_BREADBOARDS = 6;
export const circuitSchema = z.object({
  breadboards: z
    .array(z.object({ id: z.string().regex(/^BB[1-6]$/) }))
    .min(1)
    .max(MAX_BREADBOARDS)
    .optional(),
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(600),
  board: boardSchema,
  parts: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Z][A-Z0-9]{0,7}$/),
        kind: z.enum(partKinds),
        value: z.string().max(60),
        ledColor: z.enum(ledColorNames).optional(),
        purpose: z.string().max(200),
        placement: z
          .object({
            hole: z.string().regex(/^[a-j]([1-9]|[12][0-9]|30)$/),
            reversed: z.boolean(),
            breadboard: z
              .string()
              .regex(/^BB[1-6]$/)
              .optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(MAX_PARTS),
  wires: z
    .array(
      z.object({
        from: z.string().max(40),
        to: z.string().max(40),
        color: z.enum([
          "#34d399",
          "#818cf8",
          "#fb7185",
          "#38bdf8",
          "#fbbf24",
          "#94a3b8",
        ]),
        explanation: z.string().min(1).max(240),
      }),
    )
    .min(1)
    .max(MAX_WIRES),
  notes: z.array(z.string().max(500)).max(8),
  firmware: z.string().max(12000),
  firmwareLanguage: z.enum(["cpp", "python"]),
});
export type Circuit = z.infer<typeof circuitSchema>;
export type Project = {
  id: string;
  circuit: Circuit;
  createdAt: string;
  source: "demo" | "gemini" | "manual";
  messages?: ChatMessage[];
  edited?: boolean;
  review: { status: "reviewed" | "unavailable" | "demo"; text: string };
  storage: "firestore" | "browser";
};
export type Point = [number, number, number];
export type Step = {
  id: string;
  type: "part" | "wire";
  title: string;
  detail: string;
  ref: string;
  from?: string;
  to?: string;
};
export function holePosition(hole: string): Point {
  const m = /^([a-j])(\d+)$/.exec(hole);
  if (!m || +m[2] < 1 || +m[2] > 30) throw new Error(`不正な穴: ${hole}`);
  const col = m[1].charCodeAt(0) - 97;
  return [
    (+m[2] - 15.5) * 0.24,
    0.18,
    (col - 4.5) * 0.24 + (col < 5 ? -0.18 : 0.18),
  ];
}
export function boardPinPosition(board: Board, pin: string): Point {
  const n = boards[board].pins[pin];
  if (!n) throw new Error(`未対応ピン: ${pin}`);
  if (board === "esp32")
    return [(n <= 15 ? n - 8 : n - 23) * 0.24, 0.3, n <= 15 ? -3.2 : -4.5];
  if (board === "pico")
    return [
      (n <= 20 ? n - 10.5 : 30.5 - n) * 0.2,
      0.3,
      n <= 20 ? -3.15 : -4.45,
    ];
  return [(Math.ceil(n / 2) - 10.5) * 0.21, 0.3, n % 2 ? -3.1 : -3.4];
}
/** Editor drafts may be incomplete, but must be safe to render and serialize. */
export const draftCircuitSchema = circuitSchema.extend({
  parts: circuitSchema.shape.parts.unwrap().array().max(MAX_PARTS),
  wires: circuitSchema.shape.wires.unwrap().array().max(MAX_WIRES),
});
export function validateDraft(input: unknown): Circuit {
  const c = draftCircuitSchema.parse(input);
  validateBreadboards(c);
  if (new Set(c.parts.map((p) => p.id)).size !== c.parts.length)
    throw new Error("部品IDが重複しています。");
  const endpoints = new Set(
    Object.keys(boards[c.board].pins).map((pin) => `board.${pin}`),
  );
  getBreadboards(c).forEach(({ id }) =>
    ["VCC", "GND"].forEach((pin) => endpoints.add(`rail.${id}.${pin}`)),
  );
  c.parts.forEach((p) =>
    catalog[p.kind].pins.forEach((pin) => {
      if (pin !== "NC") endpoints.add(`${p.id}.${pin}`);
    }),
  );
  if (c.wires.some((w) => !endpoints.has(w.from) || !endpoints.has(w.to)))
    throw new Error("存在しないピンへの配線があります。");
  return c;
}
export function placementFor(part: Circuit["parts"][number], index: number) {
  return (
    part.placement ?? {
      hole: `${isDip(part.kind) ? "e" : "b"}${1 + index * 5}`,
      reversed: false,
    }
  );
}
export function getBreadboards(c: Circuit) {
  return c.breadboards ?? [{ id: "BB1" }];
}
export function breadboardPosition(id: string): Point {
  const index = Number(id.slice(2)) - 1;
  return [(index % 2) * 9, 0, Math.floor(index / 2) * 5.4];
}
export function qualifyHole(hole: string, breadboard = "BB1") {
  return breadboard === "BB1" ? hole : `${breadboard}:${hole}`;
}
export function splitHole(hole: string) {
  const [a, b] = hole.split(":");
  return { breadboard: b === undefined ? "BB1" : a, hole: b ?? a };
}
function validateBreadboards(c: Circuit) {
  const ids = getBreadboards(c).map((b) => b.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("ブレッドボードIDが重複しています。");
  if (!ids.includes("BB1")) throw new Error("BB1が必要です。");
  c.parts.forEach((p, i) => {
    const placement = placementFor(p, i);
    if (!ids.includes(placement.breadboard ?? "BB1"))
      throw new Error(`${p.id}: 存在しないブレッドボードです。`);
    if (isDip(p.kind) && placement.hole[0] !== "e")
      throw new Error(`${p.id}: DIP部品の先頭ピンはE列に配置してください。`);
  });
}
export function partPinHoles(c: Circuit) {
  const holes: Record<string, string> = {};
  c.parts.forEach((part, index) => {
    const placement = placementFor(part, index);
    const def = catalog[part.kind];
    def.pins.forEach((pin, j) => {
      const half = def.pins.length / 2;
      const col = isDip(part.kind)
        ? j < half
          ? placement.reversed
            ? "f"
            : "e"
          : placement.reversed
            ? "e"
            : "f"
        : placement.hole[0];
      const row =
        Number(placement.hole.slice(1)) +
        (placement.reversed ? -1 : 1) * def.offsets[j];
      holes[`${part.id}.${pin}`] = qualifyHole(
        `${col}${row}`,
        placement.breadboard,
      );
    });
  });
  return holes;
}
/** Also renders an out-of-bounds draft so users can see and repair it. */
export function layoutHolePosition(qualified: string): Point {
  const { breadboard, hole } = splitHole(qualified);
  const origin = breadboardPosition(breadboard);
  const col = hole.charCodeAt(0) - 97;
  return [
    origin[0] + (Number(hole.slice(1)) - 15.5) * 0.24,
    0.18,
    origin[2] + (col - 4.5) * 0.24 + (col < 5 ? -0.18 : 0.18),
  ];
}
export function compileCircuit(c: Circuit) {
  const pinHoles = partPinHoles(c);
  const occupied = new Set(Object.values(pinHoles));
  const allocationIssues: string[] = [];
  const railUsed = new Map<string, number>();
  const endpoint = (key: string) => {
    if (key.startsWith("board."))
      return {
        label:
          c.board === "esp32"
            ? `${key.slice(6)} · 基板印字`
            : `${key.slice(6)} · pin ${boards[c.board].pins[key.slice(6)]}`,
        position: boardPinPosition(c.board, key.slice(6)),
      };
    if (/^rail\.BB[1-6]\.(VCC|GND)$/.test(key)) {
      const [, id, rail] = key.split(".");
      const row = (railUsed.get(key) ?? 0) + 1;
      railUsed.set(key, row);
      if (row > 30)
        allocationIssues.push(`${key}: 電源レールの空き穴がありません。`);
      const origin = breadboardPosition(id);
      return {
        label: `${id} ${rail} ${row} → ${key}`,
        position: [
          origin[0] + (row - 15.5) * 0.24,
          0.18,
          origin[2] + (rail === "VCC" ? -1.95 : -1.65),
        ] as Point,
      };
    }
    const qualified = pinHoles[key];
    const { breadboard, hole } = splitHole(qualified ?? "");
    if (!hole) throw new Error(`存在しないピン: ${key}`);
    const columns =
      hole[0] <= "e" ? ["e", "d", "c", "a", "b"] : ["j", "i", "h", "f", "g"];
    const free = columns
      .map((col) => qualifyHole(`${col}${hole.slice(1)}`, breadboard))
      .find((h) => !occupied.has(h));
    if (!free)
      allocationIssues.push(
        `${key}: 導通列にジャンパ線を挿す空き穴がありません。`,
      );
    const jumperHole = free ?? qualified;
    occupied.add(jumperHole);
    return {
      label: `${jumperHole.toUpperCase()} → ${key}`,
      position: layoutHolePosition(jumperHole),
    };
  };
  const wires = c.wires.map((w, i) => ({
    ...w,
    id: `wire-${i}`,
    start: endpoint(w.from),
    end: endpoint(w.to),
  }));
  const steps: Step[] = [
    ...c.parts.map((p) => ({
      id: p.id,
      type: "part" as const,
      ref: p.id,
      title: `${p.id} · ${catalog[p.kind].name}を置く`,
      detail: `${p.purpose} ${catalog[p.kind].pins.map((pin) => `${pin}: ${pinHoles[`${p.id}.${pin}`].toUpperCase()}`).join(" / ")}。${catalog[p.kind].note}`,
    })),
    ...wires.map((w) => ({
      id: w.id,
      type: "wire" as const,
      ref: w.id,
      title: `${w.from} → ${w.to}`,
      detail: w.explanation,
      from: w.start.label,
      to: w.end.label,
    })),
  ];
  return { pinHoles, wires, steps, allocationIssues };
}

// A wire-only union-find represents actual breadboard nets. Components do not
// short their own pins together: resistors and switches must stay separate.
export function validateCircuit(input: unknown): Circuit {
  const c = circuitSchema.parse(input);
  validateBreadboards(c);
  const ids = c.parts.map((p) => p.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("部品IDが重複しています。");
  const valid = new Set(
    Object.keys(boards[c.board].pins).map((p) => `board.${p}`),
  );
  getBreadboards(c).forEach(({ id }) =>
    ["VCC", "GND"].forEach((pin) => valid.add(`rail.${id}.${pin}`)),
  );
  c.parts.forEach((p) =>
    catalog[p.kind].pins.forEach((pin) => {
      if (pin !== "NC") valid.add(`${p.id}.${pin}`);
    }),
  );
  const parent = new Map<string, string>();
  const root = (s: string): string => {
    const p = parent.get(s);
    return p ? root(p) : s;
  };
  const degree: Record<string, number> = {};
  const pairs = new Set<string>();
  for (const w of c.wires) {
    if (!valid.has(w.from) || !valid.has(w.to) || w.from === w.to)
      throw new Error(`接続先が不正です: ${w.from} → ${w.to}`);
    const pair = [w.from, w.to].sort().join("|");
    if (pairs.has(pair)) throw new Error("配線が重複しています。");
    pairs.add(pair);
    for (const e of [w.from, w.to]) {
      degree[e] = (degree[e] ?? 0) + 1;
      if (
        degree[e] >
        (e.startsWith("board.") ? 1 : /^rail\.BB[1-6]\./.test(e) ? 30 : 4)
      )
        throw new Error(
          "同じピンに配線が集中しています。抵抗の端子を分岐点にしてください。",
        );
    }
    const a = root(w.from),
      b = root(w.to);
    if (a !== b) parent.set(a, b);
  }
  if (root("board.3V3") === root("board.GND"))
    throw new Error("3.3 V と GND が短絡しています。");
  const gpios = Object.keys(boards[c.board].pins).filter((p) =>
    p.startsWith("GP"),
  );
  const canDriveGpio = (pin: string) =>
    !(c.board === "esp32" && ["GPIO34", "GPIO35"].includes(pin));
  const drivenNets = new Set(
    c.parts.flatMap((p) =>
      catalog[p.kind].pins
        .filter((pin) => logicOutput(p.kind, pin))
        .map((pin) => root(`${p.id}.${pin}`)),
    ),
  );
  gpios.filter(canDriveGpio).forEach((pin) => {
    drivenNets.add(root(`board.${pin}`));
  });
  const pullResistor = (net: string) =>
    c.parts.some(
      (r) =>
        r.kind === "resistor" &&
        resistanceOhms(r.value) > 0 &&
        ((root(`${r.id}.1`) === net &&
          [root("board.3V3"), root("board.GND")].includes(
            root(`${r.id}.2`),
          )) ||
          (root(`${r.id}.2`) === net &&
            [root("board.3V3"), root("board.GND")].includes(
              root(`${r.id}.1`),
            ))),
    );
  const hasDefinedLevel = (net: string) =>
    net === root("board.3V3") ||
    net === root("board.GND") ||
    drivenNets.has(net) ||
    pullResistor(net);
  for (let i = 0; i < gpios.length; i++) {
    const net = root(`board.${gpios[i]}`);
    if (net === root("board.3V3") || net === root("board.GND"))
      throw new Error("GPIOを電源に直結できません。");
    if (gpios.slice(i + 1).some((p) => root(`board.${p}`) === net))
      throw new Error("GPIO同士を直結できません。");
  }
  const adc =
    c.board === "esp32"
      ? ["GPIO32", "GPIO33", "GPIO34", "GPIO35"]
      : c.board === "pico"
        ? ["GP26", "GP27", "GP28"]
        : [];
  const connectedTo = (endpoint: string, pins: string[]) =>
    pins.some((g) => root(`board.${g}`) === root(endpoint));
  const hasResistor = (a: string, b: string, ohms: number) =>
    c.parts.some(
      (r) =>
        r.kind === "resistor" &&
        resistanceOhms(r.value) === ohms &&
        ((root(`${r.id}.1`) === root(a) && root(`${r.id}.2`) === root(b)) ||
          (root(`${r.id}.2`) === root(a) && root(`${r.id}.1`) === root(b))),
    );
  const busAddresses = new Set<string>();
  for (const p of c.parts) {
    const nets = catalog[p.kind].pins
      .filter((pin) => pin !== "NC")
      .map((pin) => root(`${p.id}.${pin}`));
    if (
      !isLogic(p.kind) &&
      p.kind !== "dip-switch" &&
      new Set(nets).size !== nets.length
    )
      throw new Error(`${p.id} の端子同士が短絡しています。`);
    for (const pin of catalog[p.kind].pins)
      if (
        pin !== "NC" &&
        !logicOutput(p.kind, pin) &&
        !degree[`${p.id}.${pin}`]
      )
        throw new Error(`${p.id}.${pin} が未接続です。`);
    if (isLogic(p.kind)) {
      for (const pin of catalog[p.kind].pins) {
        if (
          ["VCC", "GND"].includes(pin) ||
          logicOutput(p.kind, pin)
        )
          continue;
        if (!hasDefinedLevel(root(`${p.id}.${pin}`)))
          throw new Error(`${p.id}.${pin} の入力レベルが定義されていません。`);
      }
      if (
        root(`${p.id}.VCC`) !== root("board.3V3") ||
        root(`${p.id}.GND`) !== root("board.GND")
      )
        throw new Error(`${p.id} の電源配線を確認してください。`);
      if (p.kind === "74hc74")
        for (const unit of [1, 2]) {
          if (
            root(`${p.id}.${unit}CLR_N`) === root("board.GND") &&
            root(`${p.id}.${unit}PRE_N`) === root("board.GND")
          )
            throw new Error(`${p.id}: CLR_NとPRE_Nを同時にLOWにできません。`);
        }
    }
    if (p.kind === "resistor" && !(resistanceOhms(p.value) > 0))
      throw new Error("抵抗値は 330Ω や 10kΩ の形式で指定してください。");
    if (p.kind === "dht22" || isI2c(p.kind) || p.kind === "ds18b20") {
      if (
        root(`${p.id}.${p.kind === "ds18b20" ? "VDD" : "VCC"}`) !==
          root("board.3V3") ||
        root(`${p.id}.GND`) !== root("board.GND")
      )
        throw new Error(`${p.id} の電源配線を確認してください。`);
    }
    if (p.kind === "led") {
      if (root(`${p.id}.K`) !== root("board.GND"))
        throw new Error("LEDのKはGNDに接続してください。");
      const aNet = root(`${p.id}.A`);
      if (
        aNet === root("board.3V3") ||
        aNet === root("board.GND") ||
        gpios.some((g) => root(`board.${g}`) === aNet)
      )
        throw new Error("LEDのAを電源やGPIOに直結できません。");
      const r = c.parts.find(
        (r) =>
          r.kind === "resistor" &&
          ["1", "2"].some(
            (pin) => root(`${r.id}.${pin}`) === root(`${p.id}.A`),
          ),
      );
      if (!r) throw new Error("LEDには直列抵抗が必要です。");
      const resistance =
        parseFloat(r.value) *
        (r.value.includes("k") ? 1000 : r.value.includes("M") ? 1e6 : 1);
      if (resistance < 220)
        throw new Error("LEDの直列抵抗は220Ω以上にしてください。");
      const ledNet = root(`${p.id}.A`);
      const far = root(`${r.id}.${root(`${r.id}.1`) === ledNet ? "2" : "1"}`);
      if (
        far === ledNet ||
        ![
          ...c.parts.flatMap((p) =>
            catalog[p.kind].pins
              .filter((pin) => logicOutput(p.kind, pin))
              .map((pin) => `${p.id}.${pin}`),
          ),
          ...gpios
            .filter(
              (g) => !(c.board === "esp32" && ["GPIO34", "GPIO35"].includes(g)),
            )
            .map((g) => `board.${g}`),
        ].some((endpoint) => root(endpoint) === far)
      )
        throw new Error(
          "LEDを抵抗経由でGPIOまたはロジックIC出力に接続してください。",
        );
    }
    if (isSwitch(p.kind) && c.parts.some((p) => isLogic(p.kind))) {
      const nets = [root(`${p.id}.1`), root(`${p.id}.2`)];
      if (nets.includes(root("board.3V3")) && nets.includes(root("board.GND")))
        throw new Error(`${p.id}: スイッチを閉じると電源が短絡します。`);
      const signal = nets.find((n) => n !== root("board.GND"));
      const inputs = c.parts.flatMap((chip) =>
        isLogic(chip.kind)
          ? catalog[chip.kind].pins
              .filter(
                (pin) =>
                  !["VCC", "GND"].includes(pin) && !logicOutput(chip.kind, pin),
              )
              .map((pin) => `${chip.id}.${pin}`)
          : [],
      );
      const reachesInput = inputs.some(
        (pin) =>
          root(pin) === signal ||
          c.parts.some(
            (r) =>
              r.kind === "resistor" &&
              ((root(`${r.id}.1`) === signal &&
                root(`${r.id}.2`) === root(pin)) ||
                (root(`${r.id}.2`) === signal &&
                  root(`${r.id}.1`) === root(pin))),
          ),
      );
      const reachesGpio = gpios
        .filter(
          (g) => !(c.board === "esp32" && ["GPIO34", "GPIO35"].includes(g)),
        )
        .some((g) => root(`board.${g}`) === signal);
      if (!nets.includes(root("board.GND")) || !(reachesInput || reachesGpio))
        throw new Error(
          `${p.id}: スイッチはGNDと入力信号の間に接続してください。`,
        );
    }
    if (isSwitch(p.kind) && !c.parts.some((p) => isLogic(p.kind))) {
      const nets = [root(`${p.id}.1`), root(`${p.id}.2`)];
      const signal = nets.find((n) => n !== root("board.GND"));
      const outputPins = gpios.filter(
        (g) => !(c.board === "esp32" && ["GPIO34", "GPIO35"].includes(g)),
      );
      if (
        !nets.includes(root("board.GND")) ||
        !outputPins.some((g) => root(`board.${g}`) === signal)
      )
        throw new Error(
          `${catalog[p.kind].name}は内部プルアップ対応GPIOとGNDの間に接続してください。`,
        );
    }
    if (p.kind === "dht22" || isI2c(p.kind) || p.kind === "ds18b20") {
      const signals =
        p.kind === "dht22"
          ? ["DATA"]
          : p.kind === "ds18b20"
            ? ["DQ"]
            : ["SCL", "SDA"];
      for (const signal of signals)
        if (
          !gpios
            .filter(
              (g) => !(c.board === "esp32" && ["GPIO34", "GPIO35"].includes(g)),
            )
            .some((g) => root(`board.${g}`) === root(`${p.id}.${signal}`))
        )
          throw new Error(`${p.id}.${signal} は双方向GPIOに接続してください。`);
      if (
        isI2c(p.kind) &&
        c.board === "raspberry-pi" &&
        (root(`${p.id}.SCL`) !== root("board.GPIO3") ||
          root(`${p.id}.SDA`) !== root("board.GPIO2"))
      )
        throw new Error(
          "Raspberry Pi I2C1はSCL=GPIO3、SDA=GPIO2を使用してください。",
        );
    }
    if (p.kind === "ldr" || p.kind === "ntc") {
      const adc =
        c.board === "esp32"
          ? ["GPIO32", "GPIO33", "GPIO34", "GPIO35"]
          : c.board === "pico"
            ? ["GP26", "GP27", "GP28"]
            : [];
      const a = root(`${p.id}.1`),
        b = root(`${p.id}.2`);
      const rail = root("board.3V3"),
        ground = root("board.GND");
      const signal = a === rail ? b : b === rail ? a : null;
      const divider = c.parts.some(
        (r) =>
          r.kind === "resistor" &&
          parseFloat(r.value) > 0 &&
          ((root(`${r.id}.1`) === signal && root(`${r.id}.2`) === ground) ||
            (root(`${r.id}.2`) === signal && root(`${r.id}.1`) === ground)),
      );
      if (
        !signal ||
        !divider ||
        !adc.some((pin) => root(`board.${pin}`) === signal)
      )
        throw new Error(
          `${catalog[p.kind].name}には3.3V・抵抗・ADC入力の分圧回路が必要です。`,
        );
      if (
        p.kind === "ntc" &&
        (resistanceOhms(p.value) !== 10000 ||
          !hasResistor(`${p.id}.2`, "board.GND", 10000))
      )
        throw new Error(
          "NTCは10kΩ、端子1=3.3V、端子2=ADCと10kΩ抵抗経由のGNDにしてください。",
        );
    }
    if (p.kind === "dht22" && !hasResistor(`${p.id}.DATA`, "board.3V3", 10000))
      throw new Error("DHT22 DATAには10kΩのプルアップが必要です。");
    if (p.kind === "ds18b20" && !hasResistor(`${p.id}.DQ`, "board.3V3", 4700))
      throw new Error("DS18B20 DQには4.7kΩのプルアップが必要です。");
    if (
      p.kind === "potentiometer" &&
      (resistanceOhms(p.value) !== 10000 ||
        root(`${p.id}.1`) !== root("board.3V3") ||
        root(`${p.id}.3`) !== root("board.GND") ||
        !connectedTo(`${p.id}.W`, adc))
    )
      throw new Error(
        "可変抵抗は10kΩ、1=3.3V、3=GND、W=ADC入力にしてください。",
      );
    if (isI2c(p.kind)) {
      const key = `${root(`${p.id}.SDA`)}|${root(`${p.id}.SCL`)}|${i2cAddresses[p.kind]}`;
      if (busAddresses.has(key))
        throw new Error(
          "同じI2Cバスでアドレスが重複しています。別のセンサーかバスを選んでください。",
        );
      busAddresses.add(key);
    }
  }
  const closedParent = new Map(parent);
  const closedRoot = (endpoint: string): string => {
    const next = closedParent.get(endpoint);
    return next ? closedRoot(next) : endpoint;
  };
  const closeContact = (a: string, b: string) => {
    const left = closedRoot(a);
    const right = closedRoot(b);
    if (left !== right) closedParent.set(left, right);
  };
  for (const p of c.parts.filter((p) => p.kind === "dip-switch"))
    for (let n = 1; n <= 4; n++) {
      const a = root(`${p.id}.${n}A`),
        b = root(`${p.id}.${n}B`);
      if (
        (a === root("board.3V3") && b === root("board.GND")) ||
        (b === root("board.3V3") && a === root("board.GND"))
      )
        throw new Error(`${p.id}: DIPスイッチを閉じると電源が短絡します。`);
      closeContact(`${p.id}.${n}A`, `${p.id}.${n}B`);
    }
  for (const p of c.parts.filter((p) => isSwitch(p.kind)))
    closeContact(`${p.id}.1`, `${p.id}.2`);
  const closedNet = (endpoint: string) => closedRoot(root(endpoint));
  const closedSupply = new Set([
    closedNet("board.3V3"),
    closedNet("board.GND"),
  ]);
  const driven = new Set<string>();
  for (const p of c.parts)
    for (const pin of catalog[p.kind].pins) {
      if (!logicOutput(p.kind, pin)) continue;
      const net = closedNet(`${p.id}.${pin}`);
      if (
        closedSupply.has(net) ||
        driven.has(net) ||
        gpios.some(
          (g) => canDriveGpio(g) && closedNet(`board.${g}`) === net,
        )
      )
        throw new Error(
          `${p.id}.${pin}: IC出力を電源や別の出力に直結できません。`,
        );
      driven.add(net);
    }
  compileCircuit(c);
  return c;
}
export function billOfMaterials(c: Circuit) {
  const grouped = new Map<
    string,
    {
      name: string;
      value: string;
      quantity: number;
      kind: string;
      ledColor?: LedColor;
    }
  >();
  for (const p of c.parts) {
    const ledColor = p.kind === "led" ? resolveLedColor(p) : undefined;
    const key = `${p.kind}:${p.value}:${ledColor ?? ""}`;
    const row = grouped.get(key);
    if (row) row.quantity++;
    else
      grouped.set(key, {
        name: catalog[p.kind].name,
        value: p.value,
        quantity: 1,
        kind: p.kind,
        ...(ledColor ? { ledColor } : {}),
      });
  }
  return [
    {
      name: boards[c.board].name,
      value: boards[c.board].detail,
      quantity: 1,
      kind: "board",
    },
    {
      name: "ブレッドボード",
      value: "400穴 · 30列",
      quantity: getBreadboards(c).length,
      kind: "breadboard",
    },
    ...grouped.values(),
    {
      name: "ジャンパワイヤー",
      value: "オス–オス / 基板側に合うメス端子",
      quantity: c.wires.length,
      kind: "wire",
    },
  ];
}

/** Four-band, 5% resistor colors; labels remain the authoritative resistance. */
export function resistorBands(value: string): string[] {
  const ohms =
    parseFloat(value) *
    (value.includes("k") ? 1000 : value.includes("M") ? 1e6 : 1);
  const colors = [
    "#27272a",
    "#784d32",
    "#dc4242",
    "#ec8738",
    "#f4d45d",
    "#39a873",
    "#4276c9",
    "#9763bd",
    "#a4a5ae",
    "#f3f4f6",
  ];
  const exponent = Math.floor(Math.log10(Math.max(ohms, 0.1))) - 1;
  const digits = Math.min(99, Math.round(ohms / 10 ** exponent));
  return [
    colors[Math.floor(digits / 10)] || colors[0],
    colors[digits % 10] || colors[0],
    exponent === -1
      ? "#c5a34b"
      : exponent === -2
        ? "#b8bac2"
        : colors[exponent] || colors[0],
    "#c5a34b",
  ];
}
