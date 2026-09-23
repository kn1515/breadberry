import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ServiceError } from "@/lib/ai";
import { digiKeyConfigured } from "@/lib/digikey";
import { draftCircuitSchema, validateDraft } from "@/lib/circuit";
import { purchaseParts, type PurchaseSearchEvent } from "@/lib/purchase";
import { runPurchaseSearch } from "@/lib/purchase-search";
import {
  apiError,
  bodyJson,
  checkOrigin,
  owner,
  takeDigiKeyQuota,
} from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 65;
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
    const options = {
      part,
      circuit,
      query: input.data.query,
      locale: input.data.locale,
      digikey: digiKeyConfigured(),
      takeQuota: () => takeDigiKeyQuota(user),
    };
    if (!req.headers.get("accept")?.includes("application/x-ndjson")) {
      const result = await runPurchaseSearch({
        ...options,
        signal: req.signal,
        emit: () => {},
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const stop = new AbortController();
    const signal = AbortSignal.any([req.signal, stop.signal]);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: PurchaseSearchEvent) => {
          if (!closed && !signal.aborted)
            controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        };
        void (async () => {
          try {
            const result = await runPurchaseSearch({
              ...options,
              signal,
              emit,
            });
            emit({ type: "result", result });
          } catch (error) {
            emit({
              type: "error",
              status: error instanceof ServiceError ? error.status : 503,
              error:
                error instanceof ServiceError
                  ? error.message
                  : "商品検索に失敗しました。接続状態を確認して再試行してください。",
            });
          } finally {
            if (!closed) {
              closed = true;
              controller.close();
            }
          }
        })();
      },
      cancel() {
        closed = true;
        stop.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
