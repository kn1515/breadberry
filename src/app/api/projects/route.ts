import { NextRequest, NextResponse } from "next/server";
import { apiError, database, owner } from "@/lib/server";
export const runtime = "nodejs";
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
