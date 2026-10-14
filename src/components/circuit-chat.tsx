"use client";
import { usePreferences } from "./preferences";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircuitBoard,
  Cpu,
  CircleHelp,
  Flag,
  LoaderCircle,
  MessageSquare,
  Play,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { boards, type Board } from "@/lib/circuit";
import {
  MAX_MESSAGES,
  type ChatMessage,
  type ChatMode,
} from "@/lib/conversation";
import type { AgentEvent } from "@/lib/agent";

const traceSteps: Record<string, { label: string; icon: LucideIcon }> = {
  generation: { label: "回路生成", icon: Sparkles },
  selection: { label: "部品選定", icon: Cpu },
  validation: { label: "接続検査", icon: ShieldCheck },
  repair: { label: "回路を自動修正", icon: Wrench },
  review: { label: "補助レビュー", icon: ScanSearch },
  complete: { label: "検証完了", icon: Flag },
};
const traceOutcomes: Record<
  AgentEvent["outcome"],
  { label: string; icon: LucideIcon }
> = {
  started: { label: "開始", icon: Play },
  passed: { label: "成功", icon: Check },
  failed: { label: "問題を検出", icon: TriangleAlert },
  retry: { label: "再試行", icon: RotateCcw },
};

type Props = {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (value: string) => void;
  selectedBoard: Board;
  setSelectedBoard: (value: Board) => void;
  busy: boolean;
  phase: number;
  error: string;
  chatMode: ChatMode;
  setChatMode: (value: ChatMode) => void;
  onSubmit: () => void;
  agentEvents: AgentEvent[];
};
export default function CircuitChat({
  messages,
  prompt,
  setPrompt,
  selectedBoard,
  setSelectedBoard,
  busy,
  phase,
  error,
  chatMode,
  setChatMode,
  onSubmit,
  agentEvents,
}: Props) {
  const { t } = usePreferences();
  const transcript = useRef<HTMLDivElement>(null);
  const traceList = useRef<HTMLOListElement>(null);
  const asking = chatMode === "ask";
  // Ask mode runs no design agent, so it has no live trace to show.
  const tracing = busy && !asking;
  const [traceOpen, setTraceOpen] = useState(tracing);
  const atLimit = chatMode !== "new" && messages.length >= MAX_MESSAGES;
  const lastEvent = agentEvents.at(-1);
  const traceStatus = tracing
    ? "running"
    : lastEvent?.step === "complete"
      ? "done"
      : "failed";
  useEffect(() => {
    const list = transcript.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy, error]);
  useEffect(() => {
    // Expand the trace while the agent runs; fold it afterwards to give the conversation room.
    setTraceOpen(tracing);
  }, [tracing]);
  useEffect(() => {
    const list = traceList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [agentEvents, traceOpen]);
  return (
    <aside className="chat-panel" aria-label={t("回路設計チャット")}>
      <div className="chat-heading">
        <MessageSquare size={17} />
        <h3>{t("回路設計チャット")}</h3>
        <span>
          {messages.length / 2} {t("往復")}
        </span>
      </div>
      {(tracing || agentEvents.length > 0) && (
        <details
          className={`agent-trace ${traceStatus}`}
          open={traceOpen}
          onToggle={(e) => setTraceOpen(e.currentTarget.open)}
        >
          <summary>
            <Activity size={14} />
            <span className="agent-trace-title">{t("回路設計の実行履歴")}</span>
            <span className="agent-trace-status">
              {traceStatus === "running" ? (
                <LoaderCircle size={11} className="spin" />
              ) : traceStatus === "done" ? (
                <Check size={11} />
              ) : (
                <TriangleAlert size={11} />
              )}
              {t(
                { running: "実行中", done: "正常終了", failed: "中断" }[
                  traceStatus
                ],
              )}
            </span>
            <span className="agent-trace-count">
              {t("{0}ステップ", [agentEvents.length])}
            </span>
            <ChevronDown size={14} className="agent-trace-chevron" />
          </summary>
          <ol ref={traceList} role="log" aria-live="polite">
            {agentEvents.map((event, index) => {
              const meta = traceSteps[event.step] ?? {
                label: event.step,
                icon: Activity,
              };
              const outcome = traceOutcomes[event.outcome];
              const StepIcon = meta.icon;
              const OutcomeIcon = outcome.icon;
              return (
                <li key={index} className={`trace-item ${event.outcome}`}>
                  <span className="trace-icon" aria-hidden="true">
                    <StepIcon size={13} />
                  </span>
                  <div className="trace-body">
                    <div className="trace-row">
                      <strong>{t(meta.label)}</strong>
                      <span className="trace-outcome">
                        <OutcomeIcon size={10} />
                        {t(outcome.label)}
                      </span>
                      {event.attempt > 1 && (
                        <span className="trace-attempt">
                          {t("試行{0}", [event.attempt])}
                        </span>
                      )}
                      <time dateTime={event.at}>
                        {new Date(event.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{t(event.detail)}</p>
                  </div>
                </li>
              );
            })}
            {tracing && (
              <li className="trace-item running">
                <span className="trace-icon" aria-hidden="true">
                  <LoaderCircle size={13} className="spin" />
                </span>
                <div className="trace-body">
                  <div className="trace-row">
                    <strong>{t("処理中…")}</strong>
                  </div>
                </div>
              </li>
            )}
          </ol>
        </details>
      )}
      <div className="chat-mode" role="group" aria-label={t("設計モード")}>
        {(
          [
            ["revise", "現在の回路を修正"],
            ["new", "新しい回路"],
            ["ask", "質問のみ"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={chatMode === value}
            disabled={busy}
            onClick={() => setChatMode(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div
        className="chat-messages"
        ref={transcript}
        role="log"
        aria-label={t("会話履歴")}
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            {asking ? <CircleHelp size={24} /> : <Sparkles size={24} />}
            <p>{t("回路を見ながら、何度でも相談。")}</p>
            <span>
              {asking
                ? t(
                    "「この抵抗は何のため？」「GP15を選んだ理由は？」など、回路やコードについて質問できます。回路は変更されません。",
                  )
                : t(
                    "「抵抗を470Ωにして」「LEDを追加して」など、変更したいことを送信してください。サンプル回路からも始められます。",
                  )}
            </span>
          </div>
        )}
        {messages.map((message, i) => (
          <article key={i} className={`chat-message ${message.role}`}>
            <strong>
              {message.role === "user" ? (
                <User size={12} />
              ) : (
                <CircuitBoard size={12} />
              )}
              {message.role === "user" ? t("あなた") : "breadberry"}
            </strong>
            <p>{message.content}</p>
          </article>
        ))}
        {busy && (
          <>
            <article className="chat-message user pending">
              <strong>
                <User size={12} />
                {t("あなた")}
              </strong>
              <p>{prompt}</p>
            </article>
            <p className="chat-pending">
              <LoaderCircle size={14} className="spin" />
              {t(asking ? "回答を考えています…" : "回路を設計しています…")}
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {t(error)}
        </p>
      )}
      {atLimit && (
        <p className="chat-error">
          {t(
            "この会話は50往復に達しました。「新しい回路」から続けてください。",
          )}
        </p>
      )}
      <form
        className="prompt-card"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="prompt-heading">
          <span>
            {asking ? <CircleHelp size={17} /> : <Sparkles size={17} />}{" "}
            {t(asking ? "質問を入力" : "変更したいことを入力")}
          </span>
          <span className="ai-label">{asking ? "ASK" : "AI DESIGNER"}</span>
        </div>
        <label htmlFor="prompt" className="sr-only">
          {t("作りたいもの")}
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t(
            asking
              ? "例：この回路で抵抗が必要なのはなぜ？"
              : "例：LEDを青色に変更して、点滅間隔を1秒にして",
          )}
          minLength={1}
          maxLength={2000}
          required
          disabled={busy}
          onKeyDown={(e) => {
            if (
              (e.ctrlKey || e.metaKey) &&
              e.key === "Enter" &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="prompt-bottom">
          {asking ? (
            <span className="prompt-readonly">
              <ShieldCheck size={14} />
              {t("回路は変更されません")}
            </span>
          ) : (
            <div className="select-wrap">
              <Cpu size={14} />
              <select
                aria-label={t("使用する基板")}
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
          )}
          <button
            className="primary-button"
            disabled={busy || !prompt.trim() || atLimit}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : asking ? (
              <CircleHelp size={15} />
            ) : (
              <Sparkles size={15} />
            )}{" "}
            {busy
              ? t(asking ? "回答しています" : "設計しています")
              : t(
                  { revise: "回路を修正", new: "回路を生成", ask: "質問する" }[
                    chatMode
                  ],
                )}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="prompt-caption">
          <span className="status-dot online" />
          {busy
            ? asking
              ? t("AIが回答を考えています…")
              : [
                  t("AIが回路を設計しています…"),
                  t("接続データを生成しています…"),
                  t("接続検査と補助レビューを進めています…"),
                ][phase]
            : t("Ctrl / ⌘ + Enter で送信")}
        </div>
      </form>
    </aside>
  );
}
