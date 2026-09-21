"use client";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  ChevronDown,
  Cpu,
  LoaderCircle,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import {
  boards,
  catalog,
  isAnalog,
  partKinds,
  type Board,
} from "@/lib/circuit";
import { MAX_MESSAGES, type ChatMessage } from "@/lib/conversation";

type Props = {
  messages: ChatMessage[];
  prompt: string;
  setPrompt: (value: string) => void;
  selectedBoard: Board;
  setSelectedBoard: (value: Board) => void;
  busy: boolean;
  phase: number;
  error: string;
  newDesign: boolean;
  setNewDesign: (value: boolean) => void;
  onSubmit: () => void;
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
  newDesign,
  setNewDesign,
  onSubmit,
}: Props) {
  const transcript = useRef<HTMLDivElement>(null);
  const atLimit = !newDesign && messages.length >= MAX_MESSAGES;
  useEffect(() => {
    const list = transcript.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, busy, error]);
  return (
    <aside className="chat-panel" aria-label="回路設計チャット">
      <div className="chat-heading">
        <MessageSquare size={17} />
        <h3>回路設計チャット</h3>
        <span>{messages.length / 2} 往復</span>
      </div>
      <div className="chat-mode" role="group" aria-label="設計モード">
        <button
          type="button"
          aria-pressed={!newDesign}
          disabled={busy}
          onClick={() => setNewDesign(false)}
        >
          現在の回路を修正
        </button>
        <button
          type="button"
          aria-pressed={newDesign}
          disabled={busy}
          onClick={() => setNewDesign(true)}
        >
          新しい回路
        </button>
      </div>
      <p className="chat-context">
        {newDesign
          ? "次の送信で新しい回路と会話を開始します。"
          : "表示中の回路と会話を引き継いで修正します。"}
      </p>
      <div
        className="chat-messages"
        ref={transcript}
        role="log"
        aria-label="会話履歴"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            <Sparkles size={24} />
            <p>回路を見ながら、何度でも相談。</p>
            <span>
              「抵抗を470Ωにして」「LEDを追加して」など、変更したいことを送信してください。サンプル回路からも始められます。
            </span>
          </div>
        )}
        {messages.map((message, i) => (
          <article key={i} className={`chat-message ${message.role}`}>
            <strong>{message.role === "user" ? "あなた" : "breadberry"}</strong>
            <p>{message.content}</p>
          </article>
        ))}
        {busy && (
          <>
            <article className="chat-message user pending">
              <strong>あなた</strong>
              <p>{prompt}</p>
            </article>
            <p className="chat-pending">
              <LoaderCircle size={14} className="spin" />
              回路を設計しています…
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
      {atLimit && (
        <p className="chat-error">
          この会話は50往復に達しました。「新しい回路」から続けてください。
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
            <Sparkles size={17} /> 変更したいことを入力
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
          placeholder="例：LEDを青色に変更して、点滅間隔を1秒にして"
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
            disabled={busy || !prompt.trim() || atLimit}
          >
            {busy ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Sparkles size={15} />
            )}{" "}
            {busy ? "設計しています" : newDesign ? "回路を生成" : "回路を修正"}
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
            : "Ctrl / ⌘ + Enter で送信"}
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
                      newDesign
                        ? `${catalog[kind].name}を使う回路と動作確認用のコードを作成してください。`
                        : `現在の回路に${catalog[kind].name}を追加してください。`,
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
    </aside>
  );
}
