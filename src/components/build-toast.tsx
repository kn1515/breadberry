"use client";
import { useEffect, useRef } from "react";
import { CircleCheck } from "lucide-react";
import { usePreferences } from "./preferences";

export type BuildToastState = { id: number; board: string };

/** A manual popover enters the top layer, so it stays visible above the modal build dialog. */
export default function BuildToast({
  toast,
  onHide,
}: {
  toast: BuildToastState | null;
  onHide: () => void;
}) {
  const { t } = usePreferences();
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const popover = element.current;
    if (!toast || !popover) return;
    try {
      // Re-showing moves it above a dialog opened after an earlier toast.
      if (popover.matches(":popover-open")) popover.hidePopover();
      popover.showPopover();
    } catch {
      // Without popover support it still renders as a fixed element.
    }
    const timer = setTimeout(onHide, 5000);
    return () => {
      clearTimeout(timer);
      try {
        popover.hidePopover();
      } catch {}
    };
  }, [toast, onHide]);
  if (!toast) return null;
  return (
    <div
      ref={element}
      key={toast.id}
      popover="manual"
      role="status"
      aria-live="polite"
      className="build-toast"
    >
      <CircleCheck size={20} aria-hidden />
      <div>
        <strong>{t("ビルド成功")}</strong>
        <p>{t("{0} · main.pyを保存して実行を開始しました", [toast.board])}</p>
      </div>
    </div>
  );
}
