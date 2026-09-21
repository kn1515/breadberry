"use client";
import { useMemo, useRef, useState } from "react";
import {
  boards,
  catalog,
  compileCircuit,
  holePosition,
  layoutHolePosition,
  partKinds,
  placementFor,
  type Circuit,
  type Kind,
} from "@/lib/circuit";
import { addPart, checkLayout, partBounds, removePart } from "@/lib/layout";

const sx = (x: number) => 420 + x * 90;
const sy = (z: number) => 215 + z * 90;

export default function LayoutEditor({
  circuit,
  onChange,
  disabled,
}: {
  circuit: Circuit;
  onChange: (circuit: Circuit) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState(circuit.parts[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("led");
  const [past, setPast] = useState<Circuit[]>([]);
  const [future, setFuture] = useState<Circuit[]>([]);
  const [checked, setChecked] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const [dragHole, setDragHole] = useState<string | null>(null);
  const issues = useMemo(
    () => (checked ? checkLayout(circuit) : []),
    [circuit, checked],
  );
  const compiled = useMemo(() => compileCircuit(circuit), [circuit]);
  const index = circuit.parts.findIndex((p) => p.id === selected);
  const part = circuit.parts[index];
  const placement = part ? placementFor(part, index) : null;
  const endpoints = [
    ...Object.keys(boards[circuit.board].pins).map((pin) => `board.${pin}`),
    ...circuit.parts.flatMap((p) =>
      catalog[p.kind].pins
        .filter((pin) => pin !== "NC")
        .map((pin) => `${p.id}.${pin}`),
    ),
  ];
  function change(next: Circuit) {
    if (disabled) return;
    setPast((values) => [...values.slice(-49), circuit]);
    setFuture([]);
    onChange(next);
  }
  function move(id: string, hole: string) {
    change({
      ...circuit,
      parts: circuit.parts.map((p, i) =>
        p.id === id ? { ...p, placement: { ...placementFor(p, i), hole } } : p,
      ),
    });
  }
  function nearest(event: React.PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (
      point.x < sx(-3.6) ||
      point.x > sx(3.6) ||
      point.y < sy(-1.4) ||
      point.y > sy(1.4)
    )
      return null;
    const row = Math.max(
      1,
      Math.min(30, Math.round((point.x - 420) / 90 / 0.24 + 15.5)),
    );
    const col = [..."abcdefghij"].reduce((a, b) =>
      Math.abs(sy(holePosition(`${a}1`)[2]) - point.y) <
      Math.abs(sy(holePosition(`${b}1`)[2]) - point.y)
        ? a
        : b,
    );
    return `${col}${row}`;
  }
  return (
    <section className="layout-editor" aria-label="レイアウトエディター">
      <div className="editor-actions">
        <label>
          追加するパーツ
          <select
            aria-label="追加するパーツ"
            value={kind}
            disabled={disabled}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            {partKinds.map((k) => (
              <option key={k} value={k}>
                {catalog[k].name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={disabled || circuit.parts.length >= 30}
          onClick={() => {
            const next = addPart(circuit, kind);
            change(next);
            setSelected(next.parts.at(-1)!.id);
          }}
        >
          パーツを追加
        </button>
        <button
          disabled={disabled || !past.length}
          onClick={() => {
            const previous = past.at(-1)!;
            setPast(past.slice(0, -1));
            setFuture([circuit, ...future]);
            onChange(previous);
          }}
        >
          元に戻す
        </button>
        <button
          disabled={disabled || !future.length}
          onClick={() => {
            setPast([...past, circuit]);
            onChange(future[0]);
            setFuture(future.slice(1));
          }}
        >
          やり直す
        </button>
        <button className="editor-check" onClick={() => setChecked(true)}>
          レイアウトチェック
        </button>
      </div>
      <p className="editor-help">
        部品をドラッグ、または部品を選んで穴をクリックして移動。配置は3D・組み立てガイドにも反映されます。最大30部品。配線を変えた場合はコードも確認してください。
      </p>
      <svg
        className="editor-board"
        viewBox="0 0 840 430"
        aria-label="パーツ配置ボード"
        onPointerMove={(e) => {
          if (drag.current) setDragHole(nearest(e));
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragHole(null);
        }}
        onPointerUp={(e) => {
          const start = drag.current;
          drag.current = null;
          setDragHole(null);
          if (
            start &&
            Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
          ) {
            const hole = nearest(e);
            if (hole) move(start.id, hole);
          }
        }}
      >
        <rect x="44" y="18" width="752" height="394" rx="16" fill="#dbe2ea" />
        <rect x="82" y="208" width="676" height="14" rx="4" fill="#8190a5" />
        {Array.from({ length: 30 }, (_, i) => (
          <text
            key={i}
            x={sx((i + 1 - 15.5) * 0.24)}
            y="62"
            textAnchor="middle"
            fill="#334155"
            fontSize="10"
          >
            {i + 1}
          </text>
        ))}
        {[..."abcdefghij"].map((col) => (
          <g key={col}>
            <text
              x="63"
              y={sy(holePosition(`${col}1`)[2]) + 4}
              fill="#334155"
              fontSize="12"
            >
              {col.toUpperCase()}
            </text>
            {Array.from({ length: 30 }, (_, i) => {
              const hole = `${col}${i + 1}`,
                p = holePosition(hole);
              return (
                <circle
                  key={hole}
                  cx={sx(p[0])}
                  cy={sy(p[2])}
                  r="5"
                  fill="#56667d"
                  data-hole={hole}
                  onClick={() => {
                    if (selected && !disabled) move(selected, hole);
                  }}
                >
                  <title>{hole.toUpperCase()}</title>
                </circle>
              );
            })}
          </g>
        ))}
        {compiled.wires
          .filter(
            (w) => !w.from.startsWith("board.") && !w.to.startsWith("board."),
          )
          .map((w) => (
            <line
              key={w.id}
              x1={sx(w.start.position[0])}
              y1={sy(w.start.position[2])}
              x2={sx(w.end.position[0])}
              y2={sy(w.end.position[2])}
              stroke={w.color}
              strokeWidth="3"
              pointerEvents="none"
            />
          ))}
        {circuit.parts.map((p, i) => {
          const b = partBounds(circuit, i),
            active = p.id === selected;
          const invalid = issues.some((issue) => issue.parts.includes(p.id));
          return (
            <g
              key={p.id}
              role="button"
              aria-label={`部品 ${p.id} を選択`}
              aria-pressed={active}
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (!disabled && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setSelected(p.id);
                }
              }}
              onPointerDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                setSelected(p.id);
                drag.current = { id: p.id, x: e.clientX, y: e.clientY };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onClick={() => !disabled && setSelected(p.id)}
              className="editor-part"
            >
              <rect
                x={sx(b.x - b.width / 2)}
                y={sy(b.z - b.depth / 2)}
                width={b.width * 90}
                height={b.depth * 90}
                rx="5"
                fill={catalog[p.kind].color}
                fillOpacity=".85"
                stroke={invalid ? "#dc2626" : active ? "#4f46e5" : "#334155"}
                strokeWidth={active || invalid ? 3 : 1}
              />
              {catalog[p.kind].pins.map((pin) => {
                const pos = layoutHolePosition(
                  compiled.pinHoles[`${p.id}.${pin}`],
                );
                return (
                  <circle
                    key={pin}
                    cx={sx(pos[0])}
                    cy={sy(pos[2])}
                    r="3"
                    fill="#0f172a"
                  />
                );
              })}
              <text
                x={sx(b.x)}
                y={sy(b.z - b.depth / 2) - 6}
                textAnchor="middle"
                fill="#172033"
                fontSize="12"
                fontWeight="bold"
              >
                {p.id}
              </text>
              <title>
                {catalog[p.kind].name} · {p.value}
              </title>
            </g>
          );
        })}
        {dragHole && (
          <circle
            cx={sx(holePosition(dragHole)[0])}
            cy={sy(holePosition(dragHole)[2])}
            r="9"
            fill="none"
            stroke="#4f46e5"
            strokeWidth="3"
            pointerEvents="none"
          />
        )}
      </svg>
      <fieldset className="editor-properties" disabled={disabled}>
        <legend>選択中のパーツ</legend>
        <label>
          部品
          <select
            aria-label="編集する部品"
            value={part?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">選択してください</option>
            {circuit.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {catalog[p.kind].name}
              </option>
            ))}
          </select>
        </label>
        {part && placement && (
          <>
            <label>
              先頭ピンの穴
              <select
                aria-label="配置する穴"
                value={placement.hole}
                onChange={(e) => move(part.id, e.target.value)}
              >
                {[..."abcdefghij"].flatMap((col) =>
                  Array.from({ length: 30 }, (_, i) => (
                    <option key={`${col}${i + 1}`} value={`${col}${i + 1}`}>
                      {col.toUpperCase()}
                      {i + 1}
                    </option>
                  )),
                )}
              </select>
            </label>
            <label>
              値・仕様
              <input
                aria-label="パーツの値"
                maxLength={60}
                value={part.value}
                onChange={(e) =>
                  change({
                    ...circuit,
                    parts: circuit.parts.map((p) =>
                      p.id === part.id ? { ...p, value: e.target.value } : p,
                    ),
                  })
                }
              />
            </label>
            <button
              onClick={() =>
                change({
                  ...circuit,
                  parts: circuit.parts.map((p) =>
                    p.id === part.id
                      ? {
                          ...p,
                          placement: {
                            ...placement,
                            reversed: !placement.reversed,
                          },
                        }
                      : p,
                  ),
                })
              }
            >
              向きを反転
            </button>
            <button
              onClick={() => {
                change(removePart(circuit, part.id));
                setSelected("");
              }}
            >
              部品を削除
            </button>
            <span className="editor-pins">
              {catalog[part.kind].pins
                .map(
                  (pin) =>
                    `${pin}: ${compiled.pinHoles[`${part.id}.${pin}`].toUpperCase()}`,
                )
                .join(" / ")}
            </span>
          </>
        )}
      </fieldset>
      <details className="editor-wiring">
        <summary>配線を編集（{circuit.wires.length}本）</summary>
        <div className="editor-actions">
          <label>
            接続元
            <select
              aria-label="配線の接続元"
              value={from}
              disabled={disabled}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">選択</option>
              {endpoints.map((pin) => (
                <option key={pin}>{pin}</option>
              ))}
            </select>
          </label>
          <label>
            接続先
            <select
              aria-label="配線の接続先"
              value={to}
              disabled={disabled}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">選択</option>
              {endpoints.map((pin) => (
                <option key={pin}>{pin}</option>
              ))}
            </select>
          </label>
          <button
            disabled={
              disabled ||
              !endpoints.includes(from) ||
              !endpoints.includes(to) ||
              from === to ||
              circuit.wires.length >= 60 ||
              circuit.wires.some(
                (w) =>
                  [w.from, w.to].includes(from) && [w.from, w.to].includes(to),
              )
            }
            onClick={() =>
              change({
                ...circuit,
                wires: [
                  ...circuit.wires,
                  {
                    from,
                    to,
                    color: "#38bdf8",
                    explanation: "ユーザーが追加した配線",
                  },
                ],
              })
            }
          >
            配線を追加
          </button>
        </div>
        <ul>
          {circuit.wires.map((w, i) => (
            <li key={i}>
              {w.from} → {w.to}
              <button
                disabled={disabled}
                aria-label={`配線 ${w.from} → ${w.to} を削除`}
                onClick={() =>
                  change({
                    ...circuit,
                    wires: circuit.wires.filter((_, j) => i !== j),
                  })
                }
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </details>
      {checked && (
        <div className="editor-results" role="status">
          <strong>
            {issues.length
              ? `要確認: ${issues.length}件`
              : "レイアウトチェック: 問題は見つかりませんでした"}
          </strong>
          <ul>
            {issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                {issue.message}
                {issue.parts[0] && (
                  <button onClick={() => setSelected(issue.parts[0])}>
                    部品を選択
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p>
            表示モデルと導通列の検査です。実物の寸法・定格・動作を保証するものではありません。
          </p>
        </div>
      )}
    </section>
  );
}
