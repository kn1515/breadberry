import { ServiceError } from "./ai";
import { withDeadline } from "./async";
import type { Circuit } from "./circuit";
import type { Locale } from "./i18n";
import { searchDigiKey } from "./digikey";
import { recommendPurchase } from "./purchase-ai";
import {
  canPurchase,
  orderQuantity,
  type PurchasePart,
  type PurchaseSearch,
  type PurchaseSearchEvent,
  type RecommendedPurchaseSearch,
} from "./purchase";

type Options = {
  part: PurchasePart;
  circuit: Circuit;
  query: string;
  locale: Locale;
  digikey: boolean;
  takeDigiKeyQuota: () => Promise<void>;
  takePurchaseAiQuota: () => Promise<void>;
  signal: AbortSignal;
  emit: (event: PurchaseSearchEvent) => void;
};
// Injection keeps the actual orchestration testable with delayed providers.
export async function runPurchaseSearch(
  options: Options,
  services = {
    search: searchDigiKey,
    recommend: recommendPurchase,
    timeoutMs: 55_000,
    quotaTimeoutMs: 5_000,
  },
): Promise<RecommendedPurchaseSearch> {
  const { part, circuit, query, locale, emit } = options;
  return withDeadline(
    async (signal) => {
      const quota = (take: () => Promise<void>) =>
        withDeadline(
          async (quotaSignal) => {
            await take();
            quotaSignal.throwIfAborted();
          },
          services.quotaTimeoutMs,
          signal,
          new ServiceError(
            "利用状況の確認がタイムアウトしました。接続状態を確認して再試行してください。",
            504,
          ),
        );
      let search: PurchaseSearch = { offers: [], sandbox: false };
      if (options.digikey) {
        emit({ type: "phase", phase: "digikey" });
        try {
          search = await services.search(
            query,
            () => quota(options.takeDigiKeyQuota),
            signal,
          );
        } catch (error) {
          signal.throwIfAborted();
          if (!(error instanceof ServiceError) || error.status !== 429)
            throw error;
          // Local daily limits and DigiKey's own 429 must not block other stores.
          search = { offers: [], sandbox: false, digikeyLimited: true };
        }
      }
      signal.throwIfAborted();
      search = {
        ...search,
        offers: search.offers.filter((o) =>
          canPurchase(o, orderQuantity(o, part.quantity)),
        ),
      };
      emit({ type: "offers", search });
      if (search.sandbox)
        return {
          ...search,
          recommendation: {
            partNumber: null,
            best: null,
            searchSuggestions: "",
            reason: "テスト用の商品情報のため自動選択しません。",
          },
        };
      const recommendation = await services.recommend(
        part,
        circuit,
        query,
        search.offers,
        () => quota(options.takePurchaseAiQuota),
        locale,
        search.checkedAt,
        {
          signal,
          onPhase: (phase) => {
            signal.throwIfAborted();
            emit({ type: "phase", phase });
          },
        },
      );
      signal.throwIfAborted();
      return { ...search, recommendation };
    },
    services.timeoutMs,
    options.signal,
    new ServiceError(
      "検索に時間がかかっているため中断しました。取得済みの候補を確認するか、この部品だけ再試行してください。",
      504,
    ),
  );
}
