export const ledColorNames = [
  "green",
  "red",
  "blue",
  "yellow",
  "white",
  "orange",
  "purple",
  "pink",
] as const;
export type LedColor = (typeof ledColorNames)[number];

export const ledColors = {
  green: {
    label: "緑",
    color: "#34d399",
    emissive: "#10b981",
    base: "#1d9d77",
    pattern: /\bgreen\b|グリーン|緑色?/i,
  },
  red: {
    label: "赤",
    color: "#f87171",
    emissive: "#ef4444",
    base: "#b91c1c",
    pattern: /\bred\b|レッド|赤色?/i,
  },
  blue: {
    label: "青",
    color: "#60a5fa",
    emissive: "#3b82f6",
    base: "#1d4ed8",
    pattern: /\bblue\b|ブルー|青色?/i,
  },
  yellow: {
    label: "黄",
    color: "#fde047",
    emissive: "#facc15",
    base: "#ca8a04",
    pattern: /\byellow\b|イエロー|黄色?/i,
  },
  white: {
    label: "白",
    color: "#f8fafc",
    emissive: "#e2e8f0",
    base: "#cbd5e1",
    pattern: /\bwhite\b|ホワイト|白色?/i,
  },
  orange: {
    label: "オレンジ",
    color: "#fb923c",
    emissive: "#f97316",
    base: "#c2410c",
    pattern: /\borange\b|オレンジ|橙色?/i,
  },
  purple: {
    label: "紫",
    color: "#c084fc",
    emissive: "#a855f7",
    base: "#7e22ce",
    pattern: /\b(?:purple|violet)\b|パープル|バイオレット|紫色?/i,
  },
  pink: {
    label: "ピンク",
    color: "#f9a8d4",
    emissive: "#ec4899",
    base: "#be185d",
    pattern: /\bpink\b|ピンク|桃色/i,
  },
} satisfies Record<
  LedColor,
  {
    label: string;
    color: string;
    emissive: string;
    base: string;
    pattern: RegExp;
  }
>;

/** Older saved circuits store their LED color in the free-form specification. */
export function resolveLedColor(part: {
  value: string;
  ledColor?: LedColor;
}): LedColor {
  return (
    part.ledColor ??
    ledColorNames.find((name) => ledColors[name].pattern.test(part.value)) ??
    "green"
  );
}

/** Keep the displayed specification consistent without losing size or ratings. */
export function withLedColor<T extends { value: string }>(
  part: T,
  ledColor: LedColor,
): T & { ledColor: LedColor } {
  const previous = ledColorNames.find((name) =>
    ledColors[name].pattern.test(part.value),
  );
  const label = ledColors[ledColor].label;
  let value = previous
    ? part.value.replace(ledColors[previous].pattern, label)
    : [label, part.value].filter(Boolean).join(" · ");
  // At the schema limit, retain all specifications and store color separately.
  if (value.length > 60) {
    value = previous
      ? part.value.replace(ledColors[previous].pattern, "").trim()
      : part.value;
  }
  return { ...part, ledColor, value };
}
