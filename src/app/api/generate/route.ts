import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { boardSchema, type Project } from "@/lib/circuit";
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
    const input = z
      .object({
        prompt: z.string().trim().min(8).max(2000),
        board: boardSchema,
      })
      .safeParse(await bodyJson(req));
    if (!input.success)
      throw new ServiceError(
        "作りたいものを8〜2000文字で入力し、基板を選択してください。",
        400,
      );
    if (!process.env.GEMINI_API_KEY)
      throw new ServiceError("Gemini APIキーが未設定です。");
    await takeQuota(user);
    const circuit = await generateCircuit(input.data.prompt, input.data.board);
    const review = await reviewCircuit(circuit);
    const project: Project = {
      id: randomUUID(),
      circuit,
      createdAt: new Date().toISOString(),
      source: "gemini",
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
