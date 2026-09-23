import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ServiceError } from "@/lib/ai";
import { digiKeyConfigured, searchDigiKey } from "@/lib/digikey";
import { draftCircuitSchema, validateDraft } from "@/lib/circuit";
import {
  canPurchase,
  orderQuantity,
  purchaseParts,
  type PurchaseRecommendation,
} from "@/lib/purchase";
import { recommendPurchase } from "@/lib/purchase-ai";
import {
  apiError,
  bodyJson,
  checkOrigin,
  owner,
  takeDigiKeyQuota,
} from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const user = owner(req);
    const input = z
      .object({
        locale: z.enum(["ja", "en"]).default("ja"),
        query: z.string().trim().min(1).max(200),
        circuit: draftCircuitSchema,
        partId: z.string().regex(/^bom-\d{1,2}$/),
      })
      .safeParse(await bodyJson(req, 1024 * 1024));
    if (!input.success)
      throw new ServiceError("検索語と回路・部品情報を確認してください。", 400);
    let circuit;
    try {
      circuit = validateDraft(input.data.circuit);
    } catch {
      throw new ServiceError(
        "回路情報が不正です。プロジェクトを開き直してください。",
        400,
      );
    }
    const part = purchaseParts(circuit).find((p) => p.id === input.data.partId);
    if (!part) throw new ServiceError("対象の部品が見つかりません。", 400);
    const search = digiKeyConfigured()
      ? await searchDigiKey(input.data.query, () => takeDigiKeyQuota(user))
      : { offers: [], sandbox: false };
    const result = {
      ...search,
      offers: search.offers.filter((offer) =>
        canPurchase(offer, orderQuantity(offer, part.quantity)),
      ),
    };
    let recommendation: PurchaseRecommendation;
    try {
      recommendation = result.sandbox
        ? {
            partNumber: null,
            reason: "テスト用の商品情報のため自動選択しません。",
            best: null,
            searchSuggestions: "",
          }
        : await recommendPurchase(
            part,
            circuit,
            input.data.query,
            result.offers,
            () => takeDigiKeyQuota(user),
            input.data.locale,
            result.checkedAt,
          );
    } catch (error) {
      // Preserve real search results for manual selection if AI is unavailable.
      recommendation = {
        partNumber: null,
        best: null,
        searchSuggestions: "",
        reason:
          error instanceof ServiceError
            ? `${error.message} 商品は手動で選択できます。`
            : "AIの自動選択を利用できません。商品は手動で選択できます。",
      };
    }
    return NextResponse.json(
      { ...result, recommendation },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
