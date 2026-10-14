import { randomUUID } from "node:crypto";
import { generateCircuit, reviewCircuit, ServiceError } from "./ai";
import type { Board, Circuit, Project } from "./circuit";
import type { CircuitContext } from "./conversation";
import type { Locale } from "./i18n";

export type AgentEvent = { at: string; step: string; attempt: number; outcome: "started" | "passed" | "failed" | "retry"; detail: string };
export async function runCircuitAgent(prompt: string, board: Board, context: CircuitContext | undefined, locale: Locale, sessionId: string, onEvent?: (event: AgentEvent) => void) {
  const traceId = randomUUID();
  const events: AgentEvent[] = [];
  const maxAttempts = Math.min(3, Math.max(1, Number(process.env.AGENT_MAX_ATTEMPTS || 3) || 3));
  const record = (step: string, attempt: number, outcome: AgentEvent["outcome"], detail: string) => {
    const event = { at: new Date().toISOString(), step, attempt, outcome, detail: detail.slice(0, 500) };
    events.push(event);
    onEvent?.(event);
    console.log(JSON.stringify({ severity: outcome === "failed" ? "WARNING" : "INFO", message: "breadberry.agent", traceId, session: sessionId.slice(0, 8), ...event }));
  };
  let feedback: string | undefined;
  let circuit: Circuit | undefined;
  let review: Project["review"] = { status: "unavailable", text: "レビュー未実施" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    record("generation", attempt, "started", feedback ? "指摘を反映して回路を修正" : "回路を生成");
    try {
      circuit = await generateCircuit(prompt, board, context, locale, feedback);
      record("selection", attempt, "passed", `部品選定: ${circuit.parts.map((part) => `${part.kind} (${part.value})`).slice(0, 12).join("、")}`);
      record("validation", attempt, "passed", "接続チェックを通過");
    } catch (error) {
      if (!(error instanceof ServiceError) || error.status !== 422) throw error;
      feedback = error.message;
      record("validation", attempt, "failed", feedback);
      if (attempt < maxAttempts) { record("repair", attempt, "retry", "検査エラーに基づき再生成"); continue; }
      throw new ServiceError("自動修復の上限に達しました。入力を見直してください。", 422);
    }
    record("review", attempt, "started", "補助レビューを実行");
    review = await reviewCircuit(circuit, locale);
    const actionable = review.status === "reviewed" && /^FIX\s*:/i.test(review.text.trim());
    record("review", attempt, actionable || review.status === "unavailable" ? "failed" : "passed", review.status === "unavailable" ? "レビューを取得できませんでした" : review.text);
    if (actionable && attempt < maxAttempts) {
      feedback = "補助レビューの修正指摘: " + review.text.slice(0, 700);
      record("repair", attempt, "retry", "レビューの修正指摘に基づき再生成");
      continue;
    }
    if (actionable) throw new ServiceError("レビューの修正指摘を解消できませんでした。より簡単な回路を指定してください。", 422);
    record("complete", attempt, "passed", "生成処理が完了");
    return { circuit, review, agentEvents: events, traceId };
  }
  throw new ServiceError("回路の自動修復に失敗しました。", 422);
}
