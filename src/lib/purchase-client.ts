import { abortable, withDeadline } from "./async";
import {
  PURCHASE_SEARCH_TIMEOUT_MS,
  type PurchaseSearchEvent,
} from "./purchase";

export async function requestPurchase(
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: PurchaseSearchEvent) => void,
  timeoutMs = PURCHASE_SEARCH_TIMEOUT_MS,
) {
  return withDeadline(
    async (requestSignal) => {
      const response = await fetch("/api/purchase/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify(body),
        signal: requestSignal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "商品検索に失敗しました。");
      }
      // Keep compatibility with JSON responses (and servers being rolled out).
      if (
        !response.headers.get("content-type")?.includes("application/x-ndjson")
      ) {
        const result = await response.json();
        requestSignal.throwIfAborted();
        onEvent({ type: "result", result });
        return;
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new Error("商品検索の応答が空です。再試行してください。");
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await abortable(
            () => reader.read(),
            requestSignal,
          );
          buffer += decoder.decode(value, { stream: !done });
          if (buffer.length > 1024 * 1024)
            throw new Error("商品検索の応答を確認できませんでした。");
          const lines = buffer.split("\n");
          buffer = done ? "" : lines.pop()!;
          for (const line of lines) {
            if (!line.trim()) continue;
            requestSignal.throwIfAborted();
            const event = JSON.parse(line) as PurchaseSearchEvent;
            if (event.type === "error") throw new Error(event.error);
            if (!["phase", "offers", "result"].includes(event.type))
              throw new Error("商品検索の応答を確認できませんでした。");
            onEvent(event);
            if (event.type === "result") return;
          }
          if (done)
            throw new Error(
              "検索の応答が途中で途切れました。取得済みの候補を確認するか再試行してください。",
            );
        }
      } finally {
        // Do not let a stalled stream cancellation keep the UI pending.
        void reader.cancel().catch(() => {});
      }
    },
    timeoutMs,
    signal,
    new Error(
      "検索に時間がかかっているため中断しました。取得済みの候補を確認するか、この部品だけ再試行してください。",
    ),
  );
}
