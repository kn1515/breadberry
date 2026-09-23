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
import { digiKeyConfigured } from "@/lib/digikey";
export const runtime = "nodejs";
function requiresAccessCode(req: NextRequest) {
  return (
    process.env.NODE_ENV === "production" &&
    !["localhost", "127.0.0.1", "::1"].includes(req.nextUrl.hostname) &&
    !!process.env.APP_ACCESS_TOKEN
  );
}
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
      digikey: digiKeyConfigured(),
      firestore: !!process.env.GOOGLE_CLOUD_PROJECT,
      requiresAccessCode: requiresAccessCode(req),
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
    const accessToken = process.env.APP_ACCESS_TOKEN;
    if (
      requiresAccessCode(req) &&
      !constantEqual(
        String(body?.accessCode ?? ""),
        accessToken ?? "",
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
