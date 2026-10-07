"use client";
import { usePreferences } from "./preferences";
import { boards, getBreadboards, catalog, type Circuit } from "@/lib/circuit";
import { ledColors, resolveLedColor } from "@/lib/led";
export default function Schematic({ circuit }: { circuit: Circuit }) {
  const { t } = usePreferences();
  const usedPins = Object.keys(boards[circuit.board].pins).filter((pin) =>
    circuit.wires.some((w) => [w.from, w.to].includes(`board.${pin}`)),
  );
  const rails = getBreadboards(circuit)
    .flatMap((b) => ["VCC", "GND"].map((pin) => `rail.${b.id}.${pin}`))
    .filter((pin) => circuit.wires.some((w) => w.from === pin || w.to === pin));
  const nodes: { y: number; height: number }[] = [];
  let nextY = 45;
  circuit.parts.forEach((p) => {
    const height = Math.max(
      73,
      Math.ceil(catalog[p.kind].pins.length / 2) * 30 + 20,
    );
    nodes.push({ y: nextY, height });
    nextY += height + 50;
  });
  const height = Math.max(
    440,
    nextY + 20,
    160 + (usedPins.length + rails.length) * 44,
  );
  const ports: Record<string, [number, number]> = {};
  usedPins.forEach((p, i) => (ports[`board.${p}`] = [210, 95 + i * 44]));
  rails.forEach((p, i) => (ports[p] = [210, 155 + (usedPins.length + i) * 44]));
  circuit.parts.forEach((p, i) =>
    catalog[p.kind].pins.forEach(
      (pin, j) =>
        (ports[`${p.id}.${pin}`] = [
          480 + (j % 2) * 180,
          nodes[i].y + 25 + Math.floor(j / 2) * 30,
        ]),
    ),
  );
  return (
    <div className="schematic">
      <svg
        role="img"
        aria-label={t("接続データから描画した回路図")}
        viewBox={`0 0 800 ${height}`}
      >
        <defs>
          <pattern
            id="dots"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#344158" />
          </pattern>
        </defs>
        <rect width="800" height={height} fill="url(#dots)" />
        <rect
          x="45"
          y="50"
          width="165"
          height={Math.max(170, usedPins.length * 44 + 55)}
          rx="14"
          fill="var(--surface-raised)"
          stroke="#3b7e6a"
        />
        <text x="63" y="77" fill="var(--success)" fontSize="13">
          {circuit.board.toUpperCase()}
        </text>
        {usedPins.map((p) => (
          <g key={p}>
            <text
              x="64"
              y={ports[`board.${p}`][1] + 4}
              fill="var(--text-secondary)"
              fontSize="12"
            >
              {p}
            </text>
            <circle cx="210" cy={ports[`board.${p}`][1]} r="4" fill="#34d399" />
          </g>
        ))}
        {rails.map((pin) => (
          <g key={pin}>
            <rect
              x="45"
              y={ports[pin][1] - 17}
              width="165"
              height="34"
              rx="6"
              fill="var(--surface-raised)"
              stroke="#495775"
            />
            <text
              x="63"
              y={ports[pin][1] + 4}
              fill="var(--text-secondary)"
              fontSize="12"
            >
              {pin}
            </text>
            <circle
              cx="210"
              cy={ports[pin][1]}
              r="4"
              fill={pin.endsWith("VCC") ? "#fb7185" : "#94a3b8"}
            />
          </g>
        ))}
        {circuit.wires.map((w, i) => {
          const a = ports[w.from],
            b = ports[w.to];
          const mid = 250 + (i % 22) * 9;
          return (
            <g key={i}>
              <path
                d={`M ${a[0]} ${a[1]} H ${mid} V ${b[1]} H ${b[0]}`}
                fill="none"
                stroke={w.color}
                strokeWidth="1.8"
                opacity=".7"
              >
                <title>
                  {w.from} → {w.to}: {w.explanation}
                </title>
              </path>
            </g>
          );
        })}
        {circuit.parts.map((p, i) => (
          <g key={p.id}>
            <rect
              x="480"
              y={nodes[i].y}
              width="180"
              height={nodes[i].height}
              rx="9"
              fill="var(--surface-raised)"
              stroke="#495775"
            />
            <text
              x="570"
              y={nodes[i].y - 9}
              textAnchor="middle"
              fill="var(--text)"
              fontSize="12"
            >
              {p.id} · {t(catalog[p.kind].name)} {p.value}
            </text>
            {catalog[p.kind].pins.map((pin, j) => (
              <g key={pin}>
                <circle
                  cx={ports[`${p.id}.${pin}`][0]}
                  cy={ports[`${p.id}.${pin}`][1]}
                  r="4"
                  fill={
                    pin === "NC"
                      ? "#64748b"
                      : p.kind === "led"
                        ? ledColors[resolveLedColor(p)].color
                        : catalog[p.kind].color
                  }
                />
                <text
                  x={ports[`${p.id}.${pin}`][0] + (j % 2 ? -12 : 12)}
                  y={ports[`${p.id}.${pin}`][1] + 4}
                  textAnchor={j % 2 ? "end" : "start"}
                  fill="var(--text-secondary)"
                  fontSize="11"
                >
                  {pin}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      <p>
        {t(
          "接続図 · 交差する線は接続されません。端子名を基準に確認してください。",
        )}
      </p>
    </div>
  );
}
