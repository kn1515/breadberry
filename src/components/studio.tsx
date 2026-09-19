"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  Code2,
  Cpu,
  Download,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import {
  billOfMaterials,
  boards,
  catalog,
  partKinds,
  isAnalog,
  compileCircuit,
  validateCircuit,
  type Board,
  type Project,
} from "@/lib/circuit";
import { demoProject, type Example } from "@/lib/demo";
import Schematic from "./schematic";
const BoardScene = dynamic(() => import("./board-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-fallback">
      <LoaderCircle className="spin" />
      3Dワークスペースを準備中
    </div>
  ),
});
type Config = {
  active: boolean;
  gemini: boolean;
  gmi: boolean;
  firestore: boolean;
  requiresAccessCode: boolean;
};
type Saved = {
  id: string;
  title: string;
  createdAt: string;
  board: Board;
  local?: boolean;
};
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readLocal(): Project[] {
  try {
    return JSON.parse(localStorage.getItem("breadberry-projects") || "[]");
  } catch {
    return [];
  }
}
export default function Studio() {
  const [project, setProject] = useState<Project>(() => demoProject());
  const [selectedBoard, setSelectedBoard] = useState<Board>("esp32");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"3d" | "schematic" | "code">("3d");
  const [view, setView] = useState<"perspective" | "top">("perspective");
  const [reset, setReset] = useState(0);
  const [step, setStep] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState(false);
  const [examples, setExamples] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [historyError, setHistoryError] = useState("");
  const stepList = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const circuit = project.circuit;
  const compiled = useMemo(() => compileCircuit(circuit), [circuit]);
  const bom = useMemo(() => billOfMaterials(circuit), [circuit]);
  const current = compiled.steps[Math.max(0, step - 1)];
  useEffect(() => {
    const list = stepList.current;
    const active = list?.querySelector<HTMLElement>("[aria-current=step]");
    if (list && active)
      list.scrollTo({
        top: Math.max(0, active.offsetTop - list.offsetTop - 20),
        behavior: "smooth",
      });
  }, [step]);
  async function loadConfig() {
    try {
      const r = await fetch("/api/session");
      const data = await r.json();
      setConfig(data);
      return data as Config;
    } catch {
      return null;
    }
  }
  useEffect(() => {
    void loadConfig();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setStep((s) => {
          if (s >= compiled.steps.length) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      2200 / speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, compiled.steps.length]);
  useEffect(() => {
    if (!busy) return;
    setPhase(0);
    const timer = setInterval(() => setPhase((s) => Math.min(s + 1, 2)), 14000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!settings && !history) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettings(false);
        setHistory(false);
      }
    };
    window.addEventListener("keydown", handler);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = old;
    };
  }, [settings, history]);
  function applyProject(p: Project) {
    validateCircuit(p.circuit);
    setProject(p);
    setSelectedBoard(p.circuit.board);
    setStep(compileCircuit(p.circuit).steps.length);
    setPlaying(false);
    setTab("3d");
    setReset((s) => s + 1);
  }
  function sample(example: Example) {
    applyProject(demoProject(selectedBoard, example));
    setExamples(false);
    setError("");
    setNotice("サンプル回路を開きました。生成APIは使用していません。");
    workspace.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function connect() {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await loadConfig();
      setAccessCode("");
      setSettings(false);
      setNotice("セッションを開始しました。回路を生成できます。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "接続できませんでした。");
    } finally {
      setConnecting(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cfg = await loadConfig();
      if (!cfg?.active) {
        setSettings(true);
        throw new Error("接続設定からセッションを開始してください。");
      }
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, board: selectedBoard }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      applyProject(data);
      if (data.storage === "browser") {
        saveLocal(data);
        setNotice(data.warning);
      } else setNotice("回路を生成し、Firestoreに保存しました。");
      workspace.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました。");
    } finally {
      setBusy(false);
    }
  }
  function saveLocal(p: Project) {
    const entry = { ...p, createdAt: new Date().toISOString() };
    localStorage.setItem(
      "breadberry-projects",
      JSON.stringify(
        [entry, ...readLocal().filter((x) => x.id !== p.id)].slice(0, 20),
      ),
    );
  }
  function save() {
    try {
      if (project.storage === "firestore") {
        setNotice("このプロジェクトはFirestoreに保存済みです。");
        return;
      }
      saveLocal(project);
      setNotice("このブラウザに保存しました。プロジェクト一覧から開けます。");
    } catch {
      setError("ブラウザに保存できません。JSONをダウンロードしてください。");
    }
  }
  async function openHistory() {
    setHistory(true);
    setHistoryError("");
    setSaved(
      readLocal().map((p) => ({
        id: p.id,
        title: p.circuit.title,
        createdAt: p.createdAt,
        board: p.circuit.board,
        local: true,
      })),
    );
    if (!config?.active) return;
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaved((s) => [...data.projects, ...s]);
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "一覧を取得できません。",
      );
    }
  }
  async function openProject(item: Saved) {
    try {
      const p = item.local
        ? readLocal().find((p) => p.id === item.id)
        : await fetch(`/api/projects/${item.id}`).then(async (r) => {
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            return d;
          });
      if (!p) throw new Error("保存データがありません。");
      applyProject(p);
      setHistory(false);
      setNotice("保存したプロジェクトを開きました。");
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "読み込めませんでした。",
      );
    }
  }
  function exportBOM() {
    const rows = [
      ["部品", "仕様", "数量"],
      ...bom.map((p) => [p.name, p.value, p.quantity]),
    ];
    download(
      "breadberry-parts.csv",
      "\uFEFF" +
        rows
          .map((row) =>
            row
              .map(
                (v) =>
                  '"' +
                  String(v)
                    .replace(/^[=+@\-\t\r]/, (m) => "'" + m)
                    .replace(/"/g, '""') +
                  '"',
              )
              .join(","),
          )
          .join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  function togglePlay() {
    if (step === compiled.steps.length) setStep(0);
    setPlaying((p) => !p);
  }
  return (
    <main>
      <div className="ambient">
        <div className="aurora aurora-one" />
        <div className="aurora aurora-two" />
      </div>
      <div className="grain" />
      <header className="topbar">
        <a href="#" className="brand" aria-label="breadberry ホーム">
          <span className="brand-icon">
            <CircuitBoard size={23} />
          </span>
          breadberry<span className="beta">BETA</span>
        </a>
        <nav>
          <a href="#workspace" className="nav-active">
            ワークスペース
          </a>
          <button onClick={() => void openHistory()}>プロジェクト</button>
          <a href="#how-it-works">
            使い方 <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="mobile-projects icon-button"
            aria-label="プロジェクト"
            onClick={() => void openHistory()}
          >
            <FolderOpen size={18} />
          </button>
          <button
            className="settings-button"
            onClick={() => {
              setError("");
              setSettings(true);
            }}
          >
            <Settings2 size={16} />
            <span>接続設定</span>
            <span
              className={`status-dot ${config?.active && config.gemini ? "online" : ""}`}
            />
          </button>
        </div>
      </header>
      <section className="intro reveal">
        <form
          className="prompt-card"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <div className="prompt-heading">
            <span>
              <Sparkles size={17} /> どんなものを、つくりますか？
            </span>
            <span className="ai-label">AI DESIGNER</span>
          </div>
          <label htmlFor="prompt" className="sr-only">
            作りたいもの
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例：お部屋の温度と湿度を測って、暑くなったらLEDで知らせたい"
            minLength={8}
            maxLength={2000}
            required
            disabled={busy}
          />
          <div className="prompt-bottom">
            <div className="select-wrap">
              <Cpu size={14} />
              <select
                aria-label="使用する基板"
                value={selectedBoard}
                onChange={(e) => setSelectedBoard(e.target.value as Board)}
                disabled={busy}
              >
                {Object.entries(boards).map(([key, b]) => (
                  <option key={key} value={key}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </div>
            <button
              className="primary-button"
              disabled={busy || prompt.trim().length < 8}
            >
              {busy ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              {busy ? "設計しています" : "回路を生成"}
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="prompt-caption">
            <span className="status-dot online" />
            {busy
              ? [
                  "Geminiが回路を設計しています…",
                  "接続データを生成しています…",
                  "接続検査と補助レビューを進めています…",
                ][phase]
              : "アイデアから、部品選び・配線・コードまで。"}
          </div>
          <details className="parts-catalog">
            <summary>対応するセンサー・部品（{partKinds.length}種類）</summary>
            <p>
              部品を選ぶと入力欄にセットします。3.3V回路・最大6部品。モジュールは端子名と実物の仕様を確認してください。
            </p>
            <div className="catalog-grid">
              {partKinds.map((kind) => {
                const unavailable =
                  selectedBoard === "raspberry-pi" && isAnalog(kind);
                return (
                  <button
                    type="button"
                    key={kind}
                    disabled={busy || unavailable}
                    title={
                      unavailable
                        ? "Raspberry Pi 4/5はADC非搭載です"
                        : catalog[kind].note
                    }
                    onClick={() =>
                      setPrompt(
                        `${catalog[kind].name}を使う回路と動作確認用のコードを作成してください。`,
                      )
                    }
                  >
                    {catalog[kind].name}
                    {unavailable ? "（ADCが必要）" : ""}
                  </button>
                );
              })}
            </div>
          </details>
        </form>
      </section>
      {error && !settings && (
        <div className="alert error" role="alert">
          {error}
          <button aria-label="閉じる" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div className="alert notice" role="status">
          {notice}
          <button aria-label="閉じる" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <section id="workspace" ref={workspace} className="workspace reveal">
        <div className="workspace-heading">
          <div className="project-heading">
            <span className="project-icon">
              <Thermometer size={19} />
            </span>
            <div>
              <div className="project-breadcrumb">
                WORKSPACE <span>/</span>{" "}
                {project.source === "demo" ? "SAMPLE PROJECT" : "YOUR PROJECT"}
              </div>
              <h2>{circuit.title}</h2>
            </div>
            <span className="project-badge">
              {project.source === "demo" ? "サンプル" : "AI生成"}
            </span>
          </div>
          <div className="project-actions">
            <div className="examples-wrap">
              <button
                className="text-button"
                onClick={() => setExamples((s) => !s)}
              >
                <Plus size={15} />
                <span>サンプル</span>
                <ChevronDown size={12} />
              </button>
              {examples && (
                <div className="examples-menu">
                  <button onClick={() => sample("climate")}>
                    <Thermometer size={15} /> 温湿度センサー
                  </button>
                  <button onClick={() => sample("led")}>
                    <Zap size={15} /> LEDブリンク
                  </button>
                  <button onClick={() => sample("temperature")}>
                    <Thermometer size={15} /> DS18B20 温度計
                  </button>
                  <button onClick={() => sample("display")}>
                    <Zap size={15} /> OLEDディスプレイ
                  </button>
                </div>
              )}
            </div>
            <button className="text-button" onClick={save}>
              <FolderOpen size={15} />
              <span>保存</span>
            </button>
            <button
              className="export-button"
              onClick={() =>
                download(
                  "breadberry-circuit.json",
                  JSON.stringify(project, null, 2),
                )
              }
            >
              <Download size={14} />
              <span>エクスポート</span>
            </button>
          </div>
        </div>
        <div className="workbench">
          <aside className="parts-panel">
            <div className="panel-title">
              <span>パーツライブラリ</span>
              <span className="count">{bom.length}</span>
            </div>
            <label className="parts-search">
              <Search size={14} />
              <input
                aria-label="パーツを検索"
                placeholder="パーツを検索…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span>⌕</span>
            </label>
            <div className="section-caption">この回路に必要なもの</div>
            <div className="parts-list">
              {bom
                .filter((p) =>
                  (p.name + p.value)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((p, i) => (
                  <div className="part-row" key={p.name + p.value}>
                    <div className={`part-thumbnail thumb-${p.kind}`}>
                      {p.kind === "board" ? (
                        <Cpu />
                      ) : p.kind === "breadboard" ? (
                        <span className="mini-breadboard" />
                      ) : p.kind === "led" ? (
                        <span className="mini-led" />
                      ) : p.kind === "resistor" ? (
                        <span className="mini-resistor" />
                      ) : p.kind === "wire" ? (
                        <span className="mini-wires" />
                      ) : (
                        <Thermometer />
                      )}
                    </div>
                    <div className="part-info">
                      <strong>{p.name}</strong>
                      <small>{p.value}</small>
                    </div>
                    <span className="quantity">×{p.quantity}</span>
                  </div>
                ))}
              {!bom.some((p) =>
                (p.name + p.value).toLowerCase().includes(query.toLowerCase()),
              ) && <p className="empty">該当する部品がありません。</p>}
            </div>
            <button className="bom-download" onClick={exportBOM}>
              <ArrowDownToLine size={14} /> 部品リストをダウンロード
            </button>
            <div className="parts-tip">
              <span className="tip-icon">
                <Layers3 size={18} />
              </span>
              <strong>小さな一歩が、大きな発見に。</strong>
              <p>
                すべてのパーツには役割があります。
                <br />
                ひとつずつ、つないでみましょう。
              </p>
              <span>LET’S MAKE SOMETHING.</span>
            </div>
          </aside>
          <div className="canvas-panel">
            <div className="canvas-toolbar">
              <div className="view-tabs" role="tablist" aria-label="回路の表示">
                <button
                  role="tab"
                  aria-selected={tab === "3d"}
                  onClick={() => setTab("3d")}
                  className={tab === "3d" ? "selected" : ""}
                >
                  <Box size={14} />
                  ブレッドボード<span>3D</span>
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "schematic"}
                  onClick={() => setTab("schematic")}
                  className={tab === "schematic" ? "selected" : ""}
                >
                  <Workflow size={14} />
                  回路図
                </button>
                <button
                  role="tab"
                  aria-selected={tab === "code"}
                  onClick={() => setTab("code")}
                  className={tab === "code" ? "selected" : ""}
                >
                  <Code2 size={14} />
                  コード
                </button>
              </div>
              <span className="toolbar-hint">
                <span className="status-dot online" />
                3.3 V
              </span>
            </div>
            <div className="canvas-content">
              {tab === "3d" ? (
                <>
                  <div className="scene-tags">
                    <span>
                      <span className="status-dot online" />
                      {boards[circuit.board].name}
                    </span>
                    <span>400穴ブレッドボード</span>
                  </div>
                  <BoardScene
                    circuit={circuit}
                    step={step}
                    view={view}
                    reset={reset}
                  />
                  <div className="scene-tools">
                    <button
                      title="表示をリセット"
                      aria-label="表示をリセット"
                      onClick={() => setReset((r) => r + 1)}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <button
                      title="真上から表示"
                      aria-label="真上から表示"
                      aria-pressed={view === "top"}
                      className={view === "top" ? "active" : ""}
                      onClick={() =>
                        setView((v) => (v === "top" ? "perspective" : "top"))
                      }
                    >
                      <Layers3 size={16} />
                    </button>
                    <button
                      title="全画面"
                      aria-label="全画面"
                      onClick={() => {
                        if (document.fullscreenElement)
                          void document.exitFullscreen();
                        else
                          void workspace.current
                            ?.requestFullscreen?.()
                            .catch(() =>
                              setNotice(
                                "このブラウザは全画面表示に対応していません。",
                              ),
                            );
                      }}
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                  <div className="scene-footer">
                    <span>
                      <span className="mouse-icon" />
                      ドラッグで回転 · スクロールでズーム
                    </span>
                    <span>配線ガイド · 実寸ではありません</span>
                  </div>
                </>
              ) : tab === "schematic" ? (
                <Schematic circuit={circuit} />
              ) : (
                <div className="code-view">
                  <div>
                    <span>
                      {circuit.firmwareLanguage === "python"
                        ? "main.py"
                        : "sketch.ino"}
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(
                          circuit.firmwareLanguage === "python"
                            ? "main.py"
                            : "sketch.ino",
                          circuit.firmware,
                          "text/plain",
                        )
                      }
                    >
                      <Download size={14} />
                      ダウンロード
                    </button>
                  </div>
                  <pre>
                    <code>{circuit.firmware}</code>
                  </pre>
                  <p>
                    必要なライブラリ・実行環境は下の設計メモをご確認ください。コードは自動実行されません。
                  </p>
                </div>
              )}
            </div>
            <div className="playback">
              <button
                className="play-button"
                onClick={togglePlay}
                aria-label={playing ? "一時停止" : "組み立てを再生"}
              >
                {playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </button>
              <div className="playback-track">
                <div>
                  <strong>
                    {step === compiled.steps.length
                      ? "回路のできあがり。"
                      : step === 0
                        ? "さあ、組み立てましょう。"
                        : current.title}
                  </strong>
                  <span>
                    <b>{String(step).padStart(2, "0")}</b> /{" "}
                    {String(compiled.steps.length).padStart(2, "0")} STEPS
                  </span>
                </div>
                <input
                  aria-label="組み立て工程"
                  type="range"
                  min={0}
                  max={compiled.steps.length}
                  value={step}
                  onChange={(e) => {
                    setStep(Number(e.target.value));
                    setPlaying(false);
                  }}
                  style={
                    {
                      "--progress": `${(step / compiled.steps.length) * 100}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
              <button
                className="icon-button"
                aria-label="前の工程"
                disabled={step === 0}
                onClick={() => {
                  setStep((s) => s - 1);
                  setPlaying(false);
                }}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="次の工程"
                disabled={step === compiled.steps.length}
                onClick={() => {
                  setStep((s) => s + 1);
                  setPlaying(false);
                }}
              >
                <ChevronRight size={17} />
              </button>
              <select
                aria-label="再生速度"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </div>
          </div>
          <aside className="guide-panel">
            <div className="panel-title">
              <span>
                <Layers3 size={15} />
                組み立てガイド
              </span>
              <span className="live-pill">STEP BY STEP</span>
            </div>
            <p className="guide-intro">ひとつずつ、カタチにしていこう。</p>
            <div className="guide-progress">
              <span>
                <b>{String(step).padStart(2, "0")}</b>
                <small> / {compiled.steps.length}</small>
              </span>
              <span>
                {step === compiled.steps.length
                  ? "すべての工程を表示中"
                  : "工程を選んで確認できます"}
              </span>
            </div>
            <div className="step-list" ref={stepList}>
              {compiled.steps.map((s, i) => (
                <button
                  key={s.id}
                  className={`step-item ${i < step ? "complete" : ""} ${i === step - 1 ? "current" : ""}`}
                  onClick={() => {
                    setStep(i + 1);
                    setPlaying(false);
                    setTab("3d");
                  }}
                  aria-current={i === step - 1 ? "step" : undefined}
                >
                  <span className="step-number">
                    {i < step - 1 ? (
                      <Check size={12} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>
                      {s.type === "part"
                        ? s.title
                        : `ジャンパ線をつなぐ ${i - circuit.parts.length + 1}`}
                    </strong>
                    <small>
                      {s.type === "part"
                        ? catalog[circuit.parts[i].kind].name
                        : s.title}
                    </small>
                    {i === step - 1 && (
                      <span className="step-details">
                        {s.detail}
                        {s.from && (
                          <span className="pin-pair">
                            {s.from}
                            <ArrowDown size={12} />
                            {s.to}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {i === step - 1 && <span className="current-dot" />}
                </button>
              ))}
            </div>
            <div className="connection-tip">
              <ShieldCheck size={17} />
              <p>
                配線中は電源をオフに。
                <br />
                <span>通電前に実物のピン表記を確認。</span>
              </p>
            </div>
          </aside>
        </div>
        <div className="workspace-status">
          <span>
            <span className="status-dot online" />
            接続データの整合性チェック済み
            <span className="status-sub"> · 実機動作は未検証</span>
          </span>
          <span>
            {project.source === "demo"
              ? "サンプル回路"
              : `Gemini · GMI ${project.review.status === "reviewed" ? "レビュー済み" : "レビュー未実施"}`}
            <i />
            {project.storage === "firestore"
              ? "Firestore に保存済み"
              : "ブラウザでプレビュー"}
          </span>
        </div>
      </section>
      <section className="below-workspace reveal">
        <div className="design-note">
          <div className="eyebrow">
            <Sparkles size={13} /> DESIGN NOTES
          </div>
          <h3>つなぐ前に、ひと呼吸。</h3>
          <p>{circuit.description}</p>
          <details>
            <summary>
              配線・コードの注意点を確認 <ChevronDown size={14} />
            </summary>
            <ul>
              {circuit.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <strong>
              補助レビュー{" "}
              {project.review.status === "reviewed" ? "· GMI Cloud" : ""}
            </strong>
            <p className="review-text">{project.review.text}</p>
          </details>
        </div>
        <div id="how-it-works" className="how-it-works">
          <div className="eyebrow">FROM IDEA TO REALITY</div>
          <div className="how-steps">
            {[
              {
                n: "01",
                icon: Sparkles,
                title: "アイデアを伝える",
                text: "つくりたいものを、あなたの言葉で。",
              },
              {
                n: "02",
                icon: Cpu,
                title: "パーツをそろえる",
                text: "回路に必要な部品を、ひと目で。",
              },
              {
                n: "03",
                icon: Box,
                title: "ひとつずつ、つなぐ",
                text: "3Dガイドと一緒に、最初の一歩。",
              },
            ].map(({ n, icon: Icon, title, text }) => (
              <div key={n}>
                <span className="how-number">{n}</span>
                <Icon size={18} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer>
        <a className="brand" href="#">
          <CircuitBoard size={17} />
          breadberry
        </a>
        <span>Made for curious minds.</span>
        <span>
          想像を、つなごう。<span className="footer-spark">✧</span>
        </span>
      </footer>
      {settings && (
        <div className="modal-backdrop" onClick={() => setSettings(false)}>
          <dialog
            open
            aria-labelledby="settings-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={trapFocus}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="閉じる"
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
            <div className="modal-symbol">
              <Settings2 />
            </div>
            <h2 id="settings-title">AIとの接続を、準備しよう。</h2>
            <p>
              キーはサーバーの環境変数で管理されます。設定がなくてもサンプル回路を体験できます。
            </p>
            <div className="config-rows">
              {[
                ["Gemini", config?.gemini],
                ["GMI Cloud", config?.gmi],
                ["Firestore", config?.firestore],
              ].map(([name, ok]) => (
                <div key={String(name)}>
                  <span>{name}</span>
                  <span className={ok ? "configured" : ""}>
                    {ok ? "設定済み" : "未設定"}
                  </span>
                </div>
              ))}
            </div>
            {config?.requiresAccessCode && (
              <label className="access-field">
                アクセスコード
                <input
                  type="password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button
              className="primary-button connect-button"
              onClick={() => void connect()}
              disabled={connecting || !config?.gemini || !config?.firestore}
            >
              {connecting ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Zap size={16} />
              )}
              セッションを開始
            </button>
            <a
              className="setup-link"
              href="https://github.com/kn1515/breadberry#セットアップ"
              target="_blank"
              rel="noreferrer"
            >
              セットアップ手順を見る <ArrowUpRight size={14} />
            </a>
          </dialog>
        </div>
      )}
      {history && (
        <div className="modal-backdrop" onClick={() => setHistory(false)}>
          <dialog
            open
            aria-labelledby="history-title"
            className="modal history-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={trapFocus}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="閉じる"
              onClick={() => setHistory(false)}
            >
              <X size={18} />
            </button>
            <div className="eyebrow">YOUR COLLECTION</div>
            <h2 id="history-title">つくる、の続きを。</h2>
            <p>このブラウザのセッションに紐づくプロジェクトです。</p>
            {historyError && <div className="alert error">{historyError}</div>}
            <div className="saved-list">
              {saved.length ? (
                saved.map((p) => (
                  <button
                    key={`${p.local}-${p.id}`}
                    onClick={() => void openProject(p)}
                  >
                    <span className="project-icon">
                      <CircuitBoard size={19} />
                    </span>
                    <span>
                      <strong>{p.title}</strong>
                      <small>
                        {boards[p.board].name} ·{" "}
                        {p.local ? "ブラウザ保存" : "Firestore"}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))
              ) : (
                <div className="empty">
                  <FolderOpen size={27} />
                  <p>保存したプロジェクトがここに並びます。</p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setHistory(false);
                      save();
                    }}
                  >
                    サンプルを保存する
                  </button>
                </div>
              )}
            </div>
          </dialog>
        </div>
      )}
    </main>
  );
}
function trapFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const nodes = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
    ),
  );
  const first = nodes[0],
    last = nodes.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
