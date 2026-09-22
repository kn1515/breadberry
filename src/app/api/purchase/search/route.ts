import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ServiceError } from "@/lib/ai";
import { searchDigiKey } from "@/lib/digikey";
import {
  apiError,
  bodyJson,
  checkOrigin,
  owner,
  takeDigiKeyQuota,
} from "@/lib/server";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const input = z
      .object({ query: z.string().trim().min(1).max(200) })
      .safeParse(await bodyJson(req, 2048));
    if (!input.success)
      throw new ServiceError("検索語を1〜200文字で入力してください。", 400);
    const result = await searchDigiKey(input.data.query, () =>
      takeDigiKeyQuota(user),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
