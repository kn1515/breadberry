// PDIP pin order, top view, counter-clockwise from the pin-1 mark.
function dip(
  name: string,
  pins: readonly string[],
  outputs: readonly string[],
  note: string,
) {
  const half = pins.length / 2;
  return {
    name,
    pins,
    offsets: pins.map((_, i) => (i < half ? i : pins.length - 1 - i)),
    outputs,
    package: "dip" as const,
    color: "#242936",
    note,
  };
}
const quadPins = [
  "1A",
  "1B",
  "1Y",
  "2A",
  "2B",
  "2Y",
  "GND",
  "3Y",
  "3A",
  "3B",
  "4Y",
  "4A",
  "4B",
  "VCC",
];
const quadOutputs = ["1Y", "2Y", "3Y", "4Y"];
const hcNote =
  "PDIP through-hole, 74HC family, 3.3V supply. Straddle the center gap; verify pin 1 and the notch. Tie unused inputs to VCC or GND; leave unused outputs open. Add a 100nF bypass capacitor per IC. Do not substitute 74HCT at 3.3V.";
export const logicCatalog = {
  "74hc00": dip("74HC00 NANDゲート", quadPins, quadOutputs, hcNote),
  "74hc08": dip("74HC08 ANDゲート", quadPins, quadOutputs, hcNote),
  "74hc32": dip("74HC32 ORゲート", quadPins, quadOutputs, hcNote),
  "74hc86": dip("74HC86 XORゲート", quadPins, quadOutputs, hcNote),
  "74hc04": dip(
    "74HC04 NOTゲート",
    [
      "1A",
      "1Y",
      "2A",
      "2Y",
      "3A",
      "3Y",
      "GND",
      "4Y",
      "4A",
      "5Y",
      "5A",
      "6Y",
      "6A",
      "VCC",
    ],
    ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y"],
    hcNote,
  ),
  "74hc14": dip(
    "74HC14 シュミットトリガ",
    [
      "1A",
      "1Y",
      "2A",
      "2Y",
      "3A",
      "3Y",
      "GND",
      "4Y",
      "4A",
      "5Y",
      "5A",
      "6Y",
      "6A",
      "VCC",
    ],
    ["1Y", "2Y", "3Y", "4Y", "5Y", "6Y"],
    hcNote + " Schmitt-trigger inputs accept RC debounce signals.",
  ),
  "74hc74": dip(
    "74HC74 Dフリップフロップ",
    [
      "1CLR_N",
      "1D",
      "1CLK",
      "1PRE_N",
      "1Q",
      "1Q_N",
      "GND",
      "2Q_N",
      "2Q",
      "2PRE_N",
      "2CLK",
      "2D",
      "2CLR_N",
      "VCC",
    ],
    ["1Q", "1Q_N", "2Q", "2Q_N"],
    hcNote +
      " Positive-edge triggered; CLR_N and PRE_N are active low. Never assert both together.",
  ),
  "74hc153": dip(
    "74HC153 4入力マルチプレクサ",
    [
      "1G_N",
      "B",
      "1C3",
      "1C2",
      "1C1",
      "1C0",
      "1Y",
      "GND",
      "2Y",
      "2C0",
      "2C1",
      "2C2",
      "2C3",
      "A",
      "2G_N",
      "VCC",
    ],
    ["1Y", "2Y"],
    hcNote +
      " B is the high select bit; A is the low select bit. G_N low enables each channel.",
  ),
} as const;
export type LogicKind = keyof typeof logicCatalog;
export const isLogic = (kind: string): kind is LogicKind =>
  Object.hasOwn(logicCatalog, kind);
export const isDip = (kind: string) => isLogic(kind) || kind === "dip-switch";
export function logicOutput(kind: string, pin: string) {
  return isLogic(kind) && logicCatalog[kind].outputs.includes(pin);
}
export const supportCatalog = {
  capacitor: {
    name: "コンデンサ",
    pins: ["1", "2"],
    offsets: [0, 1],
    color: "#d29b43",
    note: "Non-polarized through-hole capacitor. Use 100nF ceramic for IC bypass and 1uF for the clock RC filter. Verify capacitance and voltage rating.",
  },
  "dip-switch": {
    ...dip(
      "4連DIPスイッチ",
      ["1A", "2A", "3A", "4A", "4B", "3B", "2B", "1B"],
      [],
      "Four independent SPST switches: 1A-1B through 4A-4B. ON closes a contact. Use external pull-up or pull-down resistors; verify the actual package pinout.",
    ),
    color: "#b93845",
  },
} as const;
