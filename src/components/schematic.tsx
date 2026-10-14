"use client";
import { useId, useRef, useState } from "react";
import { usePreferences } from "./preferences";
import { boards, getBreadboards, catalog, type Circuit } from "@/lib/circuit";
import { ledColors, resolveLedColor } from "@/lib/led";
export default function Schematic({ circuit }: { circuit: Circuit }) {
  const { t } = usePreferences();
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gridId = useId().replace(/:/g, "");
  const exportSvg = () => {
    if (!svgRef.current) return;
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svgRef.current)], {
        type: "image/svg+xml;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "breadberry-schematic.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const usedPins = Object.keys(boards[circuit.board].pins).filter((pin) =>
    circuit.wires.some((w) => [w.from, w.to].includes(`board.${pin}`)),
  );
  const rails = getBreadboards(circuit)
    .flatMap((b) => ["VCC", "GND"].map((pin) => `rail.${b.id}.${pin}`))
    .filter((pin) => circuit.wires.some((w) => w.from === pin || w.to === pin));
  const nodes: { y: number; height: number }[] = [];
  let nextY = 100;
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
          nodes[i].y +
            (catalog[p.kind].pins.length === 2
              ? 40
              : 25 + Math.floor(j / 2) * 30),
        ]),
    ),
  );
  return (
    <div className="schematic cad-schematic">
      <div
        className="schematic-toolbar"
        role="toolbar"
        aria-label={t("回路図の操作")}
      >
        <strong>{t("CAD 回路図")}</strong>
        <button
          type="button"
          aria-label={t("縮小")}
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          −
        </button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button
          type="button"
          aria-label={t("拡大")}
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          ＋
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          {t("全体表示")}
        </button>
        <button type="button" onClick={exportSvg}>
          {t("SVG 保存")}
        </button>
      </div>
      <div className="schematic-sheet">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: `${zoom * 100}%` }}
          role="img"
          aria-label={t("接続データから描画した回路図")}
          viewBox={`0 0 800 ${height}`}
        >
          <rect width="800" height={height} fill="#fcfcf7" />
          <rect
            x="16"
            y="16"
            width="768"
            height={height - 32}
            fill="none"
            stroke="#b4bdb9"
          />
          <text
            x="36"
            y="42"
            fill="#58645f"
            fontSize="12"
            fontFamily="monospace"
          >
            BREADBERRY / {t("回路図")}
          </text>
          <defs>
            <pattern
              id={gridId}
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r=".7" fill="#c8d0c9" />
            </pattern>
          </defs>
          <rect width="800" height={height} fill={`url(#${gridId})`} />
          <rect
            x="45"
            y="50"
            width="165"
            height={Math.max(170, usedPins.length * 44 + 55)}
            rx="1"
            fill="#fcfcf7"
            stroke="#3b7e6a"
          />
          <text x="63" y="77" fill="#246247" fontSize="13">
            {circuit.board.toUpperCase()}
          </text>
          {usedPins.map((p) => (
            <g key={p}>
              <text
                x="64"
                y={ports[`board.${p}`][1] + 4}
                fill="#34463e"
                fontSize="12"
              >
                {p}
              </text>
              <circle
                cx="210"
                cy={ports[`board.${p}`][1]}
                r="4"
                fill="#34d399"
              />
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
                fill="#fcfcf7"
                stroke="#495775"
              />
              <text x="63" y={ports[pin][1] + 4} fill="#34463e" fontSize="12">
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
            if (!a || !b) return null;
            const mid = 240 + i * (210 / Math.max(1, circuit.wires.length));
            // Approach right-hand pins from outside the symbol body.
            const approach = (
              point: [number, number],
              endpoint: string,
              reverse = false,
            ) => {
              const partIndex = circuit.parts.findIndex((p) =>
                endpoint.startsWith(`${p.id}.`),
              );
              if (point[0] !== 660 || partIndex < 0)
                return reverse ? `H ${point[0]}` : "";
              const above = nodes[partIndex].y - 25;
              const outside =
                685 + i * (60 / Math.max(1, circuit.wires.length));
              return reverse
                ? `V ${above} H ${outside} V ${point[1]} H ${point[0]}`
                : `H ${outside} V ${above}`;
            };
            return (
              <g key={i}>
                <path
                  d={`M ${a[0]} ${a[1]} ${approach(a, w.from)} H ${mid} V ${b[0] === 660 ? nodes[circuit.parts.findIndex((p) => w.to.startsWith(`${p.id}.`))].y - 25 : b[1]} ${approach(b, w.to, true)}`}
                  fill="none"
                  stroke={selected === i ? "#d35817" : "#246247"}
                  strokeWidth={selected === i ? 3 : 1.5}
                  tabIndex={0}
                  role="button"
                  aria-label={`${w.from} → ${w.to}: ${w.explanation}`}
                  onClick={() => setSelected(selected === i ? null : i)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(selected === i ? null : i);
                    }
                  }}
                >
                  <title>{`${w.from} → ${w.to}: ${w.explanation}`}</title>
                </path>
              </g>
            );
          })}
          {circuit.parts.map((p, i) => (
            <g key={p.id}>
              {catalog[p.kind].pins.length === 2 ? (
                <g
                  transform={`translate(480 ${nodes[i].y + 40})`}
                  fill="none"
                  stroke="#21372d"
                  strokeWidth="2"
                >
                  {p.kind === "resistor" ||
                  p.kind === "ldr" ||
                  p.kind === "ntc" ? (
                    <>
                      <path d="M 0 0 H 60 M 120 0 H 180" />
                      <rect
                        x="60"
                        y="-12"
                        width="60"
                        height="24"
                        fill="#fcfcf7"
                      />
                      {p.kind === "ldr" && (
                        <path d="M 68 -35 L 82 -19 M 83 -35 L 97 -19 M 78 -20 L 82 -19 L 81 -24 M 93 -20 L 97 -19 L 96 -24" />
                      )}
                      {p.kind === "ntc" && <path d="M 55 21 L 120 -21 H 130" />}
                    </>
                  ) : p.kind === "capacitor" ? (
                    <>
                      <path d="M 0 0 H 83 M 97 0 H 180 M 83 -20 V 20 M 97 -20 V 20" />
                    </>
                  ) : p.kind === "led" ? (
                    <>
                      <path d="M 0 0 H 75 M 105 0 H 180 M 75 -18 L 105 0 L 75 18 Z M 105 -18 V 18 M 100 -28 L 116 -44 M 109 -44 H 116 V -37 M 114 -18 L 130 -34 M 123 -34 H 130 V -27" />
                    </>
                  ) : p.kind === "button" ? (
                    <>
                      <path d="M 0 0 H 65 M 115 0 H 180 M 65 -7 L 110 -27 M 85 -35 H 105" />
                      <circle cx="65" r="3" fill="#21372d" />
                      <circle cx="115" r="3" fill="#21372d" />
                    </>
                  ) : (
                    <>
                      <path d="M 0 0 H 55 M 125 0 H 180" />
                      <rect x="55" y="-22" width="70" height="44" />
                    </>
                  )}
                </g>
              ) : (
                <rect
                  x="480"
                  y={nodes[i].y}
                  width="180"
                  height={nodes[i].height}
                  rx="1"
                  fill="#fcfcf7"
                  stroke="#21372d"
                />
              )}
              <text
                x="570"
                y={nodes[i].y - 9}
                textAnchor="middle"
                fill="#21372d"
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
                    fill="#34463e"
                    fontSize="11"
                  >
                    {pin}
                  </text>
                </g>
              ))}
            </g>
          ))}
        </svg>
      </div>
      {selected !== null && circuit.wires[selected] && (
        <p role="status">
          {circuit.wires[selected].from} → {circuit.wires[selected].to} ·{" "}
          {circuit.wires[selected].explanation}
        </p>
      )}
      <p>
        {t(
          "接続図 · 交差する線は接続されません。端子名を基準に確認してください。",
        )}
      </p>
    </div>
  );
}
