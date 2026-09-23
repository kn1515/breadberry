"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, MousePointer2, X } from "lucide-react";
import { usePreferences } from "./preferences";

const steps = [
  {
    target: '[data-tour="samples"]',
    title: "まずは、回路をひとつ。",
    description:
      "「サンプル」から回路を選べます。今表示されている回路で操作を体験しましょう。",
  },
  {
    target: ".chat-panel textarea",
    title: "アイデアを伝える",
    description:
      "ここに作りたいものや修正内容を入力します。「回路を修正」で今の回路を変更できます。",
  },
  {
    target: '[data-tour="catalog"]',
    title: "パーツをそろえる",
    description:
      "このボタンを押すと、対応部品の3Dモデルと名前を一覧で確認できます。",
  },
  {
    target: '[data-tour="play"]',
    title: "ひとつずつ、つなぐ",
    description:
      "組み立てを再生しています。このボタンで一時停止・再開できます。スライダーで工程を選べます。",
  },
  {
    target: '[data-tour="editor"]',
    title: "回路を編集",
    description:
      "Editorに切り替えました。部品を追加・移動し、レイアウトチェックで配置を確認できます。",
  },
  {
    target: '[data-tour="download"]',
    title: "保存して、続きへ",
    description:
      "部品リストはここからダウンロードできます。「保存」で回路を残し、「購入する」で商品を確認できます。",
  },
];

export default function Tutorial({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const current = steps[step];
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const card = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previous.current = document.activeElement as HTMLElement | null;
    card.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]"))
        onClose();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous.current?.focus({ preventScroll: true });
    };
  }, [onClose]);
  useEffect(() => {
    let target: HTMLElement | null = null;
    const update = () => {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      setPoint({
        x: Math.max(8, Math.min(innerWidth - 32, rect.right - 8)),
        y: rect.bottom - 4,
      });
    };
    // Studio switches the displayed mode before locating the actual control.
    const frame = requestAnimationFrame(() => {
      target = document.querySelector<HTMLElement>(current.target);
      if (!target) {
        setPoint(null);
        return;
      }
      target.classList.add("tour-highlight");
      target.setAttribute("aria-describedby", "tour-description");
      target.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "center",
      });
      update();
    });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      target?.classList.remove("tour-highlight");
      target?.removeAttribute("aria-describedby");
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [current]);
  return (
    <>
      {point && (
        <MousePointer2
          className="tour-pointer"
          aria-hidden="true"
          style={{ left: point.x, top: point.y }}
          size={28}
        />
      )}
      <section
        ref={card}
        tabIndex={-1}
        className="tour-card"
        role="region"
        aria-label={t("操作チュートリアル")}
      >
        <button
          className="icon-button tour-close"
          onClick={onClose}
          aria-label={t("チュートリアルを閉じる")}
        >
          <X size={18} />
        </button>
        <div aria-live="polite" aria-atomic="true">
          <span className="tutorial-counter">
            STEP {step + 1} / {steps.length}
          </span>
          <h2>{t(current.title)}</h2>
          <p id="tour-description">{t(current.description)}</p>
        </div>
        <div className="tour-actions">
          <button
            className="text-button"
            disabled={step === 0}
            onClick={() => onStep(step - 1)}
          >
            <ChevronLeft size={16} />
            {t("戻る")}
          </button>
          <button
            className="primary-button"
            onClick={() =>
              step === steps.length - 1 ? onClose() : onStep(step + 1)
            }
          >
            {t(step === steps.length - 1 ? "完了" : "次へ")}
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </>
  );
}
