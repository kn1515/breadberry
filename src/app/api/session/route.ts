import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  bodyJson,
  checkOrigin,
  newSession,
  owner,
} from "@/lib/server";
import { digiKeyConfigured } from "@/lib/digikey";
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
      digikey: digiKeyConfigured(),
      firestore: !!process.env.GOOGLE_CLOUD_PROJECT,
      // Retained for clients loaded before access codes were removed.
      requiresAccessCode: false,
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
    await bodyJson(req);
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
