import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { randomUUID } from "node:crypto";
import { validateDraft, type Project } from "@/lib/circuit";
import { appendExchange, generateRequestSchema } from "@/lib/conversation";
import { generateCircuit, reviewCircuit, ServiceError } from "@/lib/ai";
import { screenPrompt, screenResponse } from "@/lib/model-armor";
import { flushTraces, traced } from "@/lib/tracing";
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
const design = traced(
  "Circuit design request",
  "chain",
  async (input: z.infer<typeof generateRequestSchema>) => {
    await screenPrompt(input.prompt);
    const circuit = await generateCircuit(
      input.prompt,
      input.board,
      input.context,
      input.locale,
    );
    const [review] = await Promise.all([
      reviewCircuit(circuit, input.locale),
      screenResponse(
        [
          circuit.title,
          circuit.description,
          ...circuit.notes,
          circuit.firmware,
        ].join("\n"),
      ),
    ]);
    return { circuit, review };
  },
);
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
    const { circuit, review } = await design(input.data);
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
  } finally {
    await flushTraces();
  }
}
