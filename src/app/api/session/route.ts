import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  bodyJson,
  checkOrigin,
  constantEqual,
  newSession,
  owner,
} from "@/lib/server";
import { ServiceError } from "@/lib/ai";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  let active = false;
  try {
    owner(req);
    active = true;
  } catch {}
  return NextResponse.json(
    {
      active,
      gemini: !!process.env.GEMINI_API_KEY,
      gmi: !!process.env.GMI_API_KEY,
      firestore: !!process.env.GOOGLE_CLOUD_PROJECT,
      requiresAccessCode: !!process.env.APP_ACCESS_TOKEN,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    try {
      owner(req);
      return NextResponse.json({ ok: true });
    } catch {}
    const body = await bodyJson(req);
    if (
      process.env.APP_ACCESS_TOKEN &&
      !constantEqual(
        String(body?.accessCode ?? ""),
        process.env.APP_ACCESS_TOKEN,
      )
    )
      throw new ServiceError("アクセスコードが正しくありません。", 401);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("bb_session", newSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 86400,
    });
    return response;
  } catch (e) {
    return apiError(e);
  }
}
