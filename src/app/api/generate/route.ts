import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { validateDraft, type Project } from "@/lib/circuit";
import { appendExchange, generateRequestSchema } from "@/lib/conversation";
import { ServiceError } from "@/lib/ai";
import { runCircuitAgent } from "@/lib/agent";
import {
  apiError,
  bodyJson,
  checkOrigin,
  owner,
  saveProject,
  takeQuota,
} from "@/lib/server";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const input = generateRequestSchema.safeParse(
      await bodyJson(req, 1024 * 1024),
    );
    if (!input.success)
      throw new ServiceError(
        "1〜2000文字で入力し、基板を選択してください。会話が50往復に達した場合は新しい回路を開始してください。",
        400,
      );
    if (input.data.context) {
      try {
        input.data.context.circuit = validateDraft(input.data.context.circuit);
      } catch {
        throw new ServiceError(
          "修正元の回路データが不正です。プロジェクトを開き直してください。",
          400,
        );
      }
    }
    if (!process.env.GEMINI_API_KEY)
      throw new ServiceError("回路生成は現在利用できません。");
    await takeQuota(user);
    if (req.headers.get("accept")?.includes("application/x-ndjson")) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (type: string, data: unknown) => {
            try { controller.enqueue(encoder.encode(JSON.stringify({ type, data }) + "\n")); } catch { /* connection closed */ }
          };
          void (async () => {
            try {
              const { circuit, review, agentEvents, traceId } = await runCircuitAgent(
                input.data.prompt, input.data.board, input.data.context, input.data.locale, user,
                (event) => send("event", event),
              );
              const project: Project = {
                id: randomUUID(), circuit, createdAt: new Date().toISOString(),
                source: "gemini", messages: appendExchange(input.data.context?.messages ?? [], input.data.prompt, circuit),
                review, agentEvents, traceId, storage: "firestore",
              };
              try { await saveProject(user, project); send("result", project); }
              catch {
                send("result", { ...project, storage: "browser", warning: "保存に失敗しました。回路をJSONでダウンロードして保管してください。" });
              }
            } catch (error) {
              send("error", { message: error instanceof ServiceError ? error.message : "回路生成に失敗しました。" });
            } finally { controller.close(); }
          })();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
      });
    }
    const { circuit, review, agentEvents, traceId } = await runCircuitAgent(input.data.prompt, input.data.board, input.data.context, input.data.locale, user);
    const project: Project = {
      id: randomUUID(),
      circuit,
      createdAt: new Date().toISOString(),
      source: "gemini",
      messages: appendExchange(
        input.data.context?.messages ?? [],
        input.data.prompt,
        circuit,
      ),
      review,
      agentEvents,
      traceId,
      storage: "firestore",
    };
    try {
      await saveProject(user, project);
      return NextResponse.json(project);
    } catch {
      return NextResponse.json({
        ...project,
        storage: "browser",
        warning:
          "保存に失敗しました。回路をJSONでダウンロードして保管してください。",
      });
    }
  } catch (e) {
    return apiError(e);
  }
}
