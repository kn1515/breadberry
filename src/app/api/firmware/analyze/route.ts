import { NextRequest, NextResponse } from "next/server";
import { ServiceError } from "@/lib/ai";
import { validateDraft } from "@/lib/circuit";
import { firmwareAnalysisRequest } from "@/lib/firmware";
import { analyzeFirmware } from "@/lib/firmware-ai";
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
const analyze = traced("Firmware error analysis", "chain", analyzeFirmware);

export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const parsed = firmwareAnalysisRequest.safeParse(
      await bodyJson(req, 256 * 1024),
    );
    if (!parsed.success)
      throw new ServiceError(
        "解析するコードとエラーログを確認してください。",
        400,
      );
    const input = parsed.data;
    try {
      input.circuit = validateDraft(input.circuit);
    } catch {
      throw new ServiceError("解析する回路データが不正です。", 400);
    }
    if (!process.env.GEMINI_API_KEY)
      throw new ServiceError("AIによるエラー解析は現在利用できません。");
    await takeQuota(user);
    await screenPrompt(JSON.stringify(input));
    const result = await analyze(input);
    await screenResponse(JSON.stringify(result));
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  } finally {
    await flushTraces();
  }
}
