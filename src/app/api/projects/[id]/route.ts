import { NextRequest, NextResponse } from "next/server";
import { apiError, database, owner } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = owner(req);
    const { id } = await ctx.params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      return NextResponse.json({ error: "無効なIDです。" }, { status: 400 });
    const result = await database()
      .collection("users")
      .doc(user)
      .collection("projects")
      .doc(id)
      .get();
    if (!result.exists)
      return NextResponse.json(
        { error: "プロジェクトが見つかりません。" },
        { status: 404 },
      );
    return NextResponse.json(result.data(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
