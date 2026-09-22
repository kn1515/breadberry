"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  boards,
  catalog,
  compileCircuit,
  partKinds,
  placementFor,
  type Circuit,
  type Kind,
} from "@/lib/circuit";
import { addPart, checkLayout, movePart, removePart } from "@/lib/layout";
import {
  ledColorNames,
  ledColors,
  resolveLedColor,
  withLedColor,
  type LedColor,
} from "@/lib/led";

const BoardScene = dynamic(() => import("./board-scene"), {
  ssr: false,
  loading: () => <div className="scene-fallback">3Dエディターを準備中</div>,
});
const LedModelPicker = dynamic(() => import("./led-model-picker"), {
  ssr: false,
});

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
  const [newLedColor, setNewLedColor] = useState<LedColor>("green");
  const [past, setPast] = useState<Circuit[]>([]);
  const [future, setFuture] = useState<Circuit[]>([]);
  const [checked, setChecked] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"perspective" | "top">("perspective");
  const [reset, setReset] = useState(0);
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
    if (
      circuit.parts.some(
        (p, i) => p.id === id && placementFor(p, i).hole !== hole,
      )
    )
      change(movePart(circuit, id, hole));
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
        {kind === "led" && (
          <label>
            LEDの色
            <select
              aria-label="追加するLEDの色"
              value={newLedColor}
              disabled={disabled}
              onChange={(e) => setNewLedColor(e.target.value as LedColor)}
            >
              {ledColorNames.map((color) => (
                <option key={color} value={color}>
                  {ledColors[color].label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          disabled={disabled || circuit.parts.length >= 30}
          onClick={() => {
            const next = addPart(circuit, kind);
            if (kind === "led") {
              next.parts = next.parts.map((p, i) =>
                i === next.parts.length - 1 ? withLedColor(p, newLedColor) : p,
              );
            }
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
        <button
          className="editor-check"
          onClick={() => {
            setChecked(true);
            setResultsOpen(true);
          }}
        >
          レイアウトチェック
        </button>
      </div>
      {kind === "led" && (
        <LedModelPicker
          value={newLedColor}
          onChange={setNewLedColor}
          disabled={disabled}
        />
      )}
      <p className="editor-help" id="editor-3d-help">
        3Dの部品をクリックして選択し、ドラッグして移動します。空いている穴のクリックでも移動できます。背景のドラッグで回転、スクロールでズーム。Escで移動をキャンセル。配線を変えた場合はコードも確認してください。
      </p>
      <div className="editor-scene-toolbar">
        <button
          aria-pressed={view === "top"}
          onClick={() => setView((v) => (v === "top" ? "perspective" : "top"))}
        >
          真上から編集
        </button>
        <button onClick={() => setReset((value) => value + 1)}>
          視点をリセット
        </button>
        <span>
          選択: {part ? `${part.id} · ${catalog[part.kind].name}` : "なし"}
        </span>
      </div>
      <div
        className="editor-scene"
        aria-label="3D配置エディター"
        aria-describedby="editor-3d-help"
      >
        <BoardScene
          circuit={circuit}
          step={compiled.steps.length}
          view={view}
          reset={reset}
          editor={{
            selected,
            onSelect: setSelected,
            onMove: move,
            disabled,
            invalidParts: issues.flatMap((issue) => issue.parts),
          }}
        />
      </div>
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
            {part.kind === "led" && (
              <label>
                LEDの色
                <select
                  aria-label="LEDの色"
                  value={resolveLedColor(part)}
                  onChange={(e) =>
                    change({
                      ...circuit,
                      parts: circuit.parts.map((p) =>
                        p.id === part.id
                          ? withLedColor(p, e.target.value as LedColor)
                          : p,
                      ),
                    })
                  }
                >
                  {ledColorNames.map((color) => (
                    <option key={color} value={color}>
                      {ledColors[color].label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
      {resultsOpen &&
        createPortal(
          <div className="editor-results" role="status">
            <div className="editor-results-header">
              <strong>
                {issues.length
                  ? `要確認: ${issues.length}件`
                  : "レイアウトチェック: 問題は見つかりませんでした"}
              </strong>
              <button
                type="button"
                aria-label="レイアウトチェック結果を閉じる"
                onClick={() => setResultsOpen(false)}
              >
                閉じる
              </button>
            </div>
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
          </div>,
          document.body,
        )}
    </section>
  );
}
