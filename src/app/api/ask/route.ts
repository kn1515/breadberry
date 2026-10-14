import { NextRequest, NextResponse } from "next/server";
import { ServiceError } from "@/lib/ai";
import { answerQuestion } from "@/lib/ask-ai";
import { validateDraft } from "@/lib/circuit";
import { askRequestSchema } from "@/lib/conversation";
import { screenPrompt, screenResponse } from "@/lib/model-armor";
import {
  apiError,
  bodyJson,
  checkOrigin,
  owner,
  takeQuota,
} from "@/lib/server";
import { flushTraces, traced } from "@/lib/tracing";

export const runtime = "nodejs";
export const maxDuration = 90;
/** Ask mode only answers; it never generates, validates or saves a circuit. */
const ask = traced(
  "Circuit question",
  "chain",
  async (input: Parameters<typeof answerQuestion>[0]) => {
    await screenPrompt(input.prompt);
    const answer = await answerQuestion(input);
    await screenResponse(answer);
    return answer;
  },
);

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const parsed = askRequestSchema.safeParse(await bodyJson(req, 1024 * 1024));
    if (!parsed.success)
      throw new ServiceError(
        "1〜2000文字で入力してください。会話が50往復に達した場合は新しい回路を開始してください。",
        400,
      );
    const input = parsed.data;
    try {
      input.context.circuit = validateDraft(input.context.circuit);
    } catch {
      throw new ServiceError(
        "質問対象の回路データが不正です。プロジェクトを開き直してください。",
        400,
      );
    }
    if (!process.env.GEMINI_API_KEY)
      throw new ServiceError("AIへの質問は現在利用できません。");
    await takeQuota(user);
    const answer = await ask(input);
    return NextResponse.json(
      { answer },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  } finally {
    await flushTraces();
  }
}
