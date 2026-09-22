"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  CircuitBoard,
  MessageSquare,
  PencilRuler,
  Play,
  Save,
  X,
  Zap,
} from "lucide-react";

const steps = [
  {
    title: "まずは、回路をひとつ。",
    description:
      "「サンプル」から好きな回路を選びましょう。AIで作るなら、接続設定を済ませてチャットの「新しい回路」へ。",
    hint: "例：LEDを点滅させたい",
    icons: [MessageSquare, CircuitBoard],
    labels: ["アイデアを伝える", "回路ができる"],
  },
  {
    title: "再生して、つなぎ方を見る。",
    description:
      "Viewerの再生ボタンで、部品と配線を順番に確認。3Dはドラッグで回転でき、「回路図」「コード」にも切り替えられます。",
    hint: "組み立てガイドの各工程もクリックできます",
    icons: [Play, Zap],
    labels: ["組み立てを再生", "ひとつずつ確認"],
  },
  {
    title: "調整したら、保存しよう。",
    description:
      "変更はチャットで相談するか、Editorで部品や配線を編集。「保存」した回路は「プロジェクト」から開けます。",
    hint: "「エクスポート」でJSONのダウンロードもできます",
    icons: [PencilRuler, Save],
    labels: ["回路を編集", "保存して、続きへ"],
  },
];

export default function Tutorial() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const current = steps[step];
  const last = step === steps.length - 1;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function close() {
    dialog.current?.close();
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tutorial-trigger"
        aria-label="チュートリアルを開く"
        title="チュートリアルを開く"
        aria-haspopup="dialog"
        aria-controls="tutorial-dialog"
        aria-expanded={open}
        onClick={() => {
          setStep(0);
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <BookOpen size={18} aria-hidden="true" />
        <span>使い方</span>
      </button>
      <dialog
        ref={dialog}
        id="tutorial-dialog"
        className="tutorial-dialog"
        aria-labelledby="tutorial-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }}
      >
        <div className="tutorial-header">
          <span>
            <BookOpen size={15} aria-hidden="true" /> 約30秒でわかる使い方
          </span>
          <button
            type="button"
            autoFocus
            className="tutorial-close"
            aria-label="チュートリアルを閉じる"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        <h2 id="tutorial-title">アイデアから、動く回路へ。</h2>
        <div
          className="tutorial-progress"
          role="group"
          aria-label="チュートリアルのステップ"
        >
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-label={`ステップ${index + 1}：${item.title}`}
              aria-current={step === index ? "step" : undefined}
              onClick={() => setStep(index)}
            >
              <span className={index <= step ? "is-complete" : ""} />
            </button>
          ))}
        </div>
        <div aria-live="polite" aria-atomic="true">
          <div key={step} className="tutorial-step">
            <div className="tutorial-preview" aria-hidden="true">
              {current.icons.map((Icon, index) => (
                <div className="tutorial-preview-item" key={index}>
                  {index === 1 && (
                    <ArrowRight className="tutorial-arrow" size={22} />
                  )}
                  <span className="tutorial-preview-icon">
                    <Icon size={30} />
                  </span>
                  <span>{current.labels[index]}</span>
                </div>
              ))}
              <span className="tutorial-preview-check">
                <Check size={13} />
              </span>
            </div>
            <p className="tutorial-counter">STEP 0{step + 1} / 03</p>
            <h3>{current.title}</h3>
            <p className="tutorial-description">{current.description}</p>
            <p className="tutorial-hint">{current.hint}</p>
          </div>
        </div>
        <div className="tutorial-footer">
          <button
            type="button"
            className="tutorial-back"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft size={16} /> 戻る
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => (last ? close() : setStep((value) => value + 1))}
          >
            {last ? "使ってみる" : "次へ"}
            {last ? <Check size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
        <p className="tutorial-reminder">
          ヘッダーの本のアイコンから、いつでも見返せます
        </p>
      </dialog>
    </>
  );
}
