import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { draftCircuitSchema, validateDraft, type Project } from "@/lib/circuit";
import { messageSchema, MAX_MESSAGES } from "@/lib/conversation";
import { ServiceError } from "@/lib/ai";
import {
  apiError,
  database,
  owner,
  bodyJson,
  checkOrigin,
  saveProject,
} from "@/lib/server";
export const runtime = "nodejs";
const draftProjectRequest = z.object({
  id: z.string().uuid(),
  circuit: draftCircuitSchema,
  messages: z.array(messageSchema).max(MAX_MESSAGES),
});
export async function GET(req: NextRequest) {
  try {
    const id = owner(req);
    const result = await database()
      .collection("users")
      .doc(id)
      .collection("projects")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();
    return NextResponse.json(
      {
        projects: result.docs.map((d) => ({
          id: d.id,
          title: d.data().circuit.title,
          createdAt: d.data().createdAt,
          board: d.data().circuit.board,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return apiError(e);
  }
}

/** Save a manual draft without labeling it as a verified generated circuit. */
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const parsed = draftProjectRequest.safeParse(
      await bodyJson(req, 1024 * 1024),
    );
    if (!parsed.success)
      throw new ServiceError("保存する回路データが不正です。", 400);
    let circuit;
    try {
      circuit = validateDraft(parsed.data.circuit);
    } catch {
      throw new ServiceError("部品IDまたは配線の接続先が不正です。", 400);
    }
    const project: Project = {
      id: parsed.data.id,
      circuit,
      messages: parsed.data.messages,
      createdAt: new Date().toISOString(),
      source: "manual",
      storage: "firestore",
      edited: true,
      review: {
        status: "unavailable",
        text: "手動編集後の補助レビューは未実施です。コードは自動更新されません。",
      },
    };
    await saveProject(user, project);
    return NextResponse.json(project, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
