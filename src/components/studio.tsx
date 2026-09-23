"use client";
import { usePreferences, Text, PreferenceControls } from "./preferences";
import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ledColors } from "@/lib/led";
import {
  ArrowDown,
  ArrowDownToLine,
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
  CircleHelp,
  Eye,
  PencilRuler,
  Save,
  ShoppingCart,
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
  isAnalog,
  partKinds,
  compileCircuit,
  validateCircuit,
  validateDraft,
  type Circuit,
  type Board,
  type Project,
} from "@/lib/circuit";
import { demoProject, type Example } from "@/lib/demo";
import Schematic from "./schematic";
import CircuitChat from "./circuit-chat";
import LayoutEditor from "./layout-editor";
import PurchaseModal from "./purchase-modal";
import Tutorial from "./tutorial";
import { MAX_MESSAGES } from "@/lib/conversation";
const BoardScene = dynamic(() => import("./board-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-fallback">
      <LoaderCircle className="spin" />
      <Text message="3Dワークスペースを準備中" />
    </div>
  ),
});
type Config = {
  active: boolean;
  gemini: boolean;
  gmi: boolean;
  digikey: boolean;
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
  const { t, locale } = usePreferences();
  const [project, setProject] = useState<Project>(() => demoProject());
  const [selectedBoard, setSelectedBoard] = useState<Board>("esp32");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"viewer" | "editor">("viewer");
  const [editorSession, setEditorSession] = useState(0);
  const generating = useRef(false);
  const [newDesign, setNewDesign] = useState(false);
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
  const [purchasing, setPurchasing] = useState(false);
  const [history, setHistory] = useState(false);
  const [examples, setExamples] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [historyError, setHistoryError] = useState("");
  const stepList = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const activityBar = useRef<HTMLElement>(null);
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
    void loadConfig().then((data) => {
      if (data && !data.active && !data.requiresAccessCode) void connect();
    });
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
  useEffect(() => {
    if (!examples) return;
    const dismiss = (event: PointerEvent) => {
      if (
        !activityBar.current
          ?.querySelector(".examples-wrap")
          ?.contains(event.target as Node)
      )
        setExamples(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExamples(false);
        activityBar.current
          ?.querySelector<HTMLButtonElement>(
            "[aria-controls=activity-examples]",
          )
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [examples]);
  function applyProject(p: Project) {
    p = {
      ...p,
      circuit: p.edited ? validateDraft(p.circuit) : validateCircuit(p.circuit),
    };
    setMode("viewer");
    setEditorSession((s) => s + 1);
    setProject(p);
    setNewDesign(false);
    setPrompt("");
    setError("");
    setSelectedBoard(p.circuit.board);
    setStep(compileCircuit(p.circuit).steps.length);
    setPlaying(false);
    setTab("3d");
    setReset((s) => s + 1);
  }
  function sample(example: Example) {
    if (generating.current) return;
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
    const requestPrompt = prompt.trim();
    if (generating.current || !requestPrompt || requestPrompt.length > 2000)
      return;
    if (!newDesign && (project.messages?.length ?? 0) >= MAX_MESSAGES) return;
    generating.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cfg = await loadConfig();
      if (!cfg?.active) {
        setSettings(true);
        throw new Error(t("接続設定からセッションを開始してください。"));
      }
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: requestPrompt,
          board: selectedBoard,
          locale,
          ...(newDesign
            ? {}
            : {
                context: {
                  circuit: project.circuit,
                  messages: project.messages ?? [],
                },
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      applyProject(data);
      if (data.storage === "browser") {
        try {
          saveLocal(data);
          setNotice(
            data.warning || "回路と会話履歴をこのブラウザに保存しました。",
          );
        } catch {
          setNotice(
            "回路の生成は完了しましたが、ブラウザに保存できません。JSONをダウンロードしてください。",
          );
        }
      } else setNotice("回路を生成し、保存しました。");
      workspace.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました。");
    } finally {
      generating.current = false;
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
  function editCircuit(next: Circuit) {
    if (generating.current) return;
    setProject((previous) => ({
      ...previous,
      id: previous.edited ? previous.id : crypto.randomUUID(),
      circuit: next,
      edited: true,
      source: "manual",
      storage: "browser",
      review: {
        status: "unavailable",
        text: t(
          "手動編集後の補助レビューは未実施です。コードは自動更新されません。",
        ),
      },
    }));
    setNotice("");
    setStep(compileCircuit(next).steps.length);
    setPlaying(false);
  }
  async function save() {
    if (generating.current) return;
    if (project.storage === "firestore") {
      setNotice("このプロジェクトは保存済みです。");
      return;
    }
    generating.current = true;
    setSaving(true);
    setError("");
    try {
      if (project.edited && config?.active && config.firestore) {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: project.id,
            circuit: project.circuit,
            messages: project.messages ?? [],
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setProject(data);
        setNotice("編集した回路と配置を保存しました。");
      } else {
        saveLocal(project);
        setNotice("このブラウザに保存しました。プロジェクト一覧から開けます。");
      }
    } catch {
      try {
        saveLocal(project);
        setNotice(
          "クラウドに保存できなかったため、このブラウザに保存しました。",
        );
      } catch {
        setError("保存できません。JSONをダウンロードしてください。");
      }
    } finally {
      generating.current = false;
      setSaving(false);
    }
  }
  async function openHistory() {
    if (generating.current) return;
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
    if (generating.current) return;
    try {
      const p = item.local
        ? readLocal().find((p) => p.id === item.id)
        : await fetch(`/api/projects/${item.id}`).then(async (r) => {
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            return d;
          });
      if (!p) throw new Error(t("保存データがありません。"));
      if (generating.current) return;
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
      [t("部品"), t("仕様"), t("数量")],
      ...bom.map((p) => [t(p.name), t(p.value), p.quantity]),
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
        <a href="#" className="brand" aria-label={t("breadberry ホーム")}>
          <span className="brand-icon">
            <CircuitBoard size={23} />
          </span>
          breadberry<span className="beta">BETA</span>
        </a>
        <div className="header-actions">
          <PreferenceControls />
          <Tutorial />
          <button
            className="settings-button"
            onClick={() => {
              setError("");
              setSettings(true);
            }}
          >
            <Settings2 size={16} />
            <span>{t("接続設定")}</span>
            <span
              className={`status-dot ${config?.active && config.gemini ? "online" : ""}`}
            />
          </button>
        </div>
      </header>
      {notice && (
        <div className="alert notice" role="status">
          {t(notice)}
          <button aria-label={t("閉じる")} onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <section id="workspace" ref={workspace} className="workspace reveal">
        <aside
          ref={activityBar}
          className="activity-bar"
          aria-label={t("アクティビティバー")}
        >
          <nav className="activity-group" aria-label={t("移動")}>
            <a
              className="activity-button"
              href="#workspace"
              title={t("ワークスペース")}
            >
              <CircuitBoard size={18} />
              <span>{t("ワークスペース")}</span>
            </a>
            <button
              className="activity-button"
              disabled={busy || saving}
              aria-haspopup="dialog"
              onClick={() => void openHistory()}
            >
              <FolderOpen size={18} />
              <span>{t("プロジェクト")}</span>
            </button>
          </nav>
          <div
            className="activity-group"
            role="group"
            aria-label={t("ワークスペースモード")}
          >
            {(["viewer", "editor"] as const).map((value) => (
              <button
                key={value}
                className="activity-button"
                disabled={busy || saving}
                aria-label={
                  value === "viewer" ? t("Viewer · 閲覧") : t("Editor · 編集")
                }
                title={
                  value === "viewer"
                    ? t("3Dと組み立て手順")
                    : t("部品の追加・移動・配線")
                }
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setPlaying(false);
                  setStep(compiled.steps.length);
                }}
              >
                {value === "viewer" ? (
                  <Eye size={18} />
                ) : (
                  <PencilRuler size={18} />
                )}
                <span>{value === "viewer" ? "Viewer" : "Editor"}</span>
              </button>
            ))}
          </div>
          <div
            className="activity-group"
            role="group"
            aria-label={t("回路ファイル")}
          >
            <div className="examples-wrap">
              <button
                className="activity-button"
                disabled={busy || saving}
                aria-expanded={examples}
                aria-controls="activity-examples"
                onClick={() => setExamples((s) => !s)}
              >
                <Plus size={18} />
                <span>{t("サンプル")}</span>
              </button>
              {examples && (
                <div className="examples-menu" id="activity-examples">
                  <button onClick={() => sample("climate")}>
                    <Thermometer size={15} /> {t("温湿度センサー")}
                  </button>
                  <button onClick={() => sample("led")}>
                    <Zap size={15} /> {t("LEDブリンク")}
                  </button>
                  <button onClick={() => sample("temperature")}>
                    <Thermometer size={15} /> {t("DS18B20 温度計")}
                  </button>
                  <button onClick={() => sample("display")}>
                    <Zap size={15} /> {t("OLEDディスプレイ")}
                  </button>
                </div>
              )}
            </div>
            <button
              className="activity-button"
              disabled={busy || saving}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Save size={18} />
              )}
              <span>{t("保存")}</span>
            </button>
            <button
              className="activity-button"
              onClick={() =>
                download(
                  "breadberry-circuit.json",
                  JSON.stringify(project, null, 2),
                )
              }
            >
              <Download size={18} />
              <span>{t("エクスポート")}</span>
            </button>
          </div>
          <nav
            className="activity-group activity-help"
            aria-label={t("サポート")}
          >
            <a
              className="activity-button"
              href="#how-it-works"
              title={t("使い方を見る")}
            >
              <CircleHelp size={18} />
              <span>{t("ヘルプ")}</span>
            </a>
          </nav>
        </aside>
        <div className="workspace-heading">
          <div className="project-heading">
            <span className="project-icon">
              <Thermometer size={19} />
            </span>
            <div>
              <div className="project-breadcrumb">
                WORKSPACE <span>/</span>{" "}
                {project.edited
                  ? t("手動編集した回路")
                  : project.source === "demo"
                    ? "SAMPLE PROJECT"
                    : "YOUR PROJECT"}
              </div>
              <h2>
                {project.source === "demo" ? t(circuit.title) : circuit.title}
              </h2>
            </div>
            <span className="project-badge">
              {project.edited
                ? t("手動編集した回路")
                : project.source === "demo"
                  ? t("サンプル")
                  : t("AI生成")}
            </span>
          </div>
        </div>
        <div className="workbench">
          <aside className="parts-panel">
            <div className="panel-title">
              <span>{t("パーツライブラリ")}</span>
              <span className="count">{bom.length}</span>
            </div>
            <details className="parts-catalog">
              <summary>
                {t("対応するセンサー・部品")}
              </summary>
              <p>
                {t(
                  "部品を選ぶと入力欄にセットします。3.3V回路・最大6部品。モジュールは端子名と実物の仕様を確認してください。",
                )}
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
                          ? t("Raspberry Pi 4/5はADC非搭載です")
                          : t(catalog[kind].note)
                      }
                      onClick={() =>
                        setPrompt(
                          newDesign
                            ? t(
                                "{0}を使う回路と動作確認用のコードを作成してください。",
                                [t(catalog[kind].name)],
                              )
                            : t("現在の回路に{0}を追加してください。", [
                                t(catalog[kind].name),
                              ]),
                        )
                      }
                    >
                      {t(catalog[kind].name)}
                      {unavailable ? t("（ADCが必要）") : ""}
                    </button>
                  );
                })}
              </div>
            </details>
            <label className="parts-search">
              <Search size={14} />
              <input
                aria-label={t("パーツを検索")}
                placeholder={t("パーツを検索…")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span>⌕</span>
            </label>
            <div className="section-caption">{t("この回路に必要なもの")}</div>
            <div className="parts-list">
              {bom
                .filter((p) =>
                  (t(p.name) + " " + p.name + " " + t(p.value))
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
                        <span
                          className="mini-led"
                          style={
                            {
                              "--led-color":
                                ledColors[p.ledColor ?? "green"].color,
                              "--led-base":
                                ledColors[p.ledColor ?? "green"].base,
                            } as CSSProperties
                          }
                          aria-label={`${t(ledColors[p.ledColor ?? "green"].label)} LED`}
                        />
                      ) : p.kind === "resistor" ? (
                        <span className="mini-resistor" />
                      ) : p.kind === "wire" ? (
                        <span className="mini-wires" />
                      ) : (
                        <Thermometer />
                      )}
                    </div>
                    <div className="part-info">
                      <strong>{t(p.name)}</strong>
                      <small>{t(p.value)}</small>
                    </div>
                    <span className="quantity">×{p.quantity}</span>
                  </div>
                ))}
              {!bom.some((p) =>
                (t(p.name) + " " + p.name + " " + t(p.value))
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ) && <p className="empty">{t("該当する部品がありません。")}</p>}
            </div>
            <button className="bom-download" onClick={exportBOM}>
              <ArrowDownToLine size={14} /> {t("部品リストをダウンロード")}
            </button>
            <button
              className="bom-download parts-purchase"
              disabled={busy || saving}
              aria-haspopup="dialog"
              onClick={() => {
                setExamples(false);
                setPurchasing(true);
              }}
            >
              <ShoppingCart size={14} />
              <span>{t("購入する")}</span>
              <Sparkles size={14} />
            </button>
            <div className="parts-tip">
              <span className="tip-icon">
                <Layers3 size={18} />
              </span>
              <strong>{t("小さな一歩が、大きな発見に。")}</strong>
              <p>
                {t("すべてのパーツには役割があります。")}
                <br />
                {t("ひとつずつ、つないでみましょう。")}
              </p>
              <span>LET’S MAKE SOMETHING.</span>
            </div>
          </aside>
          <div className="canvas-panel">
            {mode === "editor" ? (
              <LayoutEditor
                key={editorSession}
                circuit={circuit}
                onChange={editCircuit}
                disabled={busy || saving}
              />
            ) : (
              <>
                <div className="canvas-toolbar">
                  <div
                    className="view-tabs"
                    role="tablist"
                    aria-label={t("回路の表示")}
                  >
                    <button
                      role="tab"
                      aria-selected={tab === "3d"}
                      onClick={() => setTab("3d")}
                      className={tab === "3d" ? "selected" : ""}
                    >
                      <Box size={14} />
                      {t("ブレッドボード")}
                      <span>3D</span>
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "schematic"}
                      onClick={() => setTab("schematic")}
                      className={tab === "schematic" ? "selected" : ""}
                    >
                      <Workflow size={14} />
                      {t("回路図")}
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "code"}
                      onClick={() => setTab("code")}
                      className={tab === "code" ? "selected" : ""}
                    >
                      <Code2 size={14} />
                      {t("コード")}
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
                        <span>{t("400穴ブレッドボード")}</span>
                      </div>
                      <BoardScene
                        circuit={circuit}
                        step={step}
                        view={view}
                        reset={reset}
                      />
                      <div className="scene-tools">
                        <button
                          title={t("表示をリセット")}
                          aria-label={t("表示をリセット")}
                          onClick={() => setReset((r) => r + 1)}
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button
                          title={t("真上から表示")}
                          aria-label={t("真上から表示")}
                          aria-pressed={view === "top"}
                          className={view === "top" ? "active" : ""}
                          onClick={() =>
                            setView((v) =>
                              v === "top" ? "perspective" : "top",
                            )
                          }
                        >
                          <Layers3 size={16} />
                        </button>
                        <button
                          title={t("全画面")}
                          aria-label={t("全画面")}
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
                          {t("ドラッグで回転 · スクロールでズーム")}
                        </span>
                        <span>{t("配線ガイド · 実寸ではありません")}</span>
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
                          {t("ダウンロード")}
                        </button>
                      </div>
                      <pre>
                        <code>{circuit.firmware}</code>
                      </pre>
                      <p>
                        {t(
                          "必要なライブラリ・実行環境は下の設計メモをご確認ください。コードは自動実行されません。",
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div className="playback">
                  <button
                    className="play-button"
                    onClick={togglePlay}
                    aria-label={playing ? t("一時停止") : t("組み立てを再生")}
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
                          ? t("回路のできあがり。")
                          : step === 0
                            ? t("さあ、組み立てましょう。")
                            : t(current?.title ?? "パーツを追加してください")}
                      </strong>
                      <span>
                        <b>{String(step).padStart(2, "0")}</b> /{" "}
                        {String(compiled.steps.length).padStart(2, "0")} STEPS
                      </span>
                    </div>
                    <input
                      aria-label={t("組み立て工程")}
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
                          "--progress": `${(step / Math.max(1, compiled.steps.length)) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  <button
                    className="icon-button"
                    aria-label={t("前の工程")}
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
                    aria-label={t("次の工程")}
                    disabled={step === compiled.steps.length}
                    onClick={() => {
                      setStep((s) => s + 1);
                      setPlaying(false);
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                  <select
                    aria-label={t("再生速度")}
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                    <option value={2}>2×</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <aside className="guide-panel" hidden={mode === "editor"}>
            <div className="panel-title">
              <span>
                <Layers3 size={15} />
                {t("組み立てガイド")}
              </span>
              <span className="live-pill">STEP BY STEP</span>
            </div>
            <p className="guide-intro">
              {t("ひとつずつ、カタチにしていこう。")}
            </p>
            <div className="guide-progress">
              <span>
                <b>{String(step).padStart(2, "0")}</b>
                <small> / {compiled.steps.length}</small>
              </span>
              <span>
                {step === compiled.steps.length
                  ? t("すべての工程を表示中")
                  : t("工程を選んで確認できます")}
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
                        ? t(s.title)
                        : t("ジャンパ線をつなぐ {0}", [
                            i - circuit.parts.length + 1,
                          ])}
                    </strong>
                    <small>
                      {s.type === "part"
                        ? t(catalog[circuit.parts[i].kind].name)
                        : t(s.title)}
                    </small>
                    {i === step - 1 && (
                      <span className="step-details">
                        {t(s.detail)}
                        {s.from && (
                          <span className="pin-pair">
                            {t(s.from)}
                            <ArrowDown size={12} />
                            {t(s.to ?? "")}
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
                {t("配線中は電源をオフに。")}
                <br />
                <span>{t("通電前に実物のピン表記を確認。")}</span>
              </p>
            </div>
          </aside>
          <CircuitChat
            messages={project.messages ?? []}
            prompt={prompt}
            setPrompt={setPrompt}
            selectedBoard={selectedBoard}
            setSelectedBoard={setSelectedBoard}
            busy={busy || saving}
            phase={phase}
            error={settings ? "" : error}
            newDesign={newDesign}
            setNewDesign={setNewDesign}
            onSubmit={() => void generate()}
          />
        </div>
        <div className="workspace-status">
          <span>
            <span className="status-dot online" />
            {project.edited
              ? t("手動編集あり · Editorでレイアウトを確認してください")
              : t("接続データの整合性チェック済み")}
            <span className="status-sub"> {t("· 実機動作は未検証")}</span>
          </span>
          <span>
            {project.edited
              ? t("手動編集した回路")
              : project.source === "demo"
                ? t("サンプル回路")
                : `Gemini · GMI ${project.review.status === "reviewed" ? t("レビュー済み") : t("レビュー未実施")}`}
            <i />
            {project.storage === "firestore"
              ? t("保存済み")
              : t("ブラウザでプレビュー")}
          </span>
        </div>
      </section>
      <section className="below-workspace reveal">
        <div className="design-note">
          <div className="eyebrow">
            <Sparkles size={13} /> DESIGN NOTES
          </div>
          <h3>{t("つなぐ前に、ひと呼吸。")}</h3>
          <p>
            {project.source === "demo"
              ? t(circuit.description)
              : circuit.description}
          </p>
          <details>
            <summary>
              {t("配線・コードの注意点を確認")}
              <ChevronDown size={14} />
            </summary>
            <ul>
              {circuit.notes.map((n, i) => (
                <li key={i}>{project.source === "demo" ? t(n) : n}</li>
              ))}
            </ul>
            <strong>
              {t("補助レビュー")}{" "}
              {project.review.status === "reviewed" ? "· GMI Cloud" : ""}
            </strong>
            <p className="review-text">{t(project.review.text)}</p>
          </details>
        </div>
        <div id="how-it-works" className="how-it-works">
          <div className="eyebrow">FROM IDEA TO REALITY</div>
          <div className="how-steps">
            {[
              {
                n: "01",
                icon: Sparkles,
                title: t("アイデアを伝える"),
                text: t("つくりたいものを、あなたの言葉で。"),
              },
              {
                n: "02",
                icon: Cpu,
                title: t("パーツをそろえる"),
                text: t("回路に必要な部品を、ひと目で。"),
              },
              {
                n: "03",
                icon: Box,
                title: t("ひとつずつ、つなぐ"),
                text: t("3Dガイドと一緒に、最初の一歩。"),
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
          {t("想像を、つなごう。")}
          <span className="footer-spark">✧</span>
        </span>
      </footer>
      {purchasing && (
        <PurchaseModal
          circuit={circuit}
          onClose={() => setPurchasing(false)}
          onConnect={() => {
            setPurchasing(false);
            setSettings(true);
          }}
        />
      )}
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
              aria-label={t("閉じる")}
              onClick={() => setSettings(false)}
            >
              <X size={18} />
            </button>
            <div className="modal-symbol">
              <Settings2 />
            </div>
            <h2 id="settings-title">{t("AIとの接続を、準備しよう。")}</h2>
            <p>
              {t(
                "キーはサーバーの環境変数で管理されます。設定がなくてもサンプル回路を体験できます。",
              )}
            </p>
            <div className="config-rows">
              {[
                ["Gemini", config?.gemini],
                ["GMI Cloud", config?.gmi],
                ["DigiKey", config?.digikey],
                ["Firestore", config?.firestore],
              ].map(([name, ok]) => (
                <div key={String(name)}>
                  <span>{name}</span>
                  <span className={ok ? "configured" : ""}>
                    {ok ? t("設定済み") : t("未設定")}
                  </span>
                </div>
              ))}
            </div>
            {config?.requiresAccessCode && (
              <label className="access-field">
                {t("アクセスコード")}
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
                {t(error)}
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
              {t("セッションを開始")}
            </button>
            <a
              className="setup-link"
              href="https://github.com/kn1515/breadberry#セットアップ"
              target="_blank"
              rel="noreferrer"
            >
              {t("セットアップ手順を見る")}
              <ArrowUpRight size={14} />
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
              aria-label={t("閉じる")}
              onClick={() => setHistory(false)}
            >
              <X size={18} />
            </button>
            <div className="eyebrow">YOUR COLLECTION</div>
            <h2 id="history-title">{t("つくる、の続きを。")}</h2>
            <p>{t("このブラウザのセッションに紐づくプロジェクトです。")}</p>
            {historyError && (
              <div className="alert error">{t(historyError)}</div>
            )}
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
                        {p.local ? t("ブラウザ保存") : "Firestore"}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))
              ) : (
                <div className="empty">
                  <FolderOpen size={27} />
                  <p>{t("保存したプロジェクトがここに並びます。")}</p>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setHistory(false);
                      save();
                    }}
                  >
                    {t("サンプルを保存する")}
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
