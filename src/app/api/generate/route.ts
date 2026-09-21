import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { validateDraft, type Project } from "@/lib/circuit";
import { appendExchange, generateRequestSchema } from "@/lib/conversation";
import { generateCircuit, reviewCircuit, ServiceError } from "@/lib/ai";
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
      throw new ServiceError("Gemini APIキーが未設定です。");
    await takeQuota(user);
    const circuit = await generateCircuit(
      input.data.prompt,
      input.data.board,
      input.data.context,
    );
    const review = await reviewCircuit(circuit);
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
          "Firestoreへの保存に失敗しました。回路をJSONでダウンロードして保管してください。",
      });
    }
  } catch (e) {
    return apiError(e);
  }
}
