"use client";
import { usePreferences } from "./preferences";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  LoaderCircle,
  ShoppingCart,
  Sparkles,
  X,
} from "lucide-react";
import type { Circuit } from "@/lib/circuit";
import { requestPurchase } from "@/lib/purchase-client";
import { withDeadline } from "@/lib/async";
import {
  canPurchase,
  cartLines,
  DIGIKEY_CART_ACTION,
  domesticStores,
  orderQuantity,
  purchaseParts,
  unitPrice,
  type PurchaseOffer,
  type RecommendedProduct,
  PURCHASE_BATCH_TIMEOUT_MS,
  type PurchasePhase,
} from "@/lib/purchase";

type Row = {
  query: string;
  offers: PurchaseOffer[];
  selected: string;
  quantity: number;
  loading: boolean;
  phase: PurchasePhase;
  error: string;
  sandbox: boolean;
  digikeyLimited: boolean;
  recommendation: string;
  best: RecommendedProduct | null;
  searchSuggestions: string;
};
const formatYen = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }).format(value);

export default function PurchaseModal({
  circuit,
  onClose,
}: {
  circuit: Circuit;
  onClose: () => void;
}) {
  const { t, locale } = usePreferences();
  const yen = (value: number) =>
    formatYen(value, locale === "en" ? "en-US" : "ja-JP");
  const parts = useMemo(() => purchaseParts(circuit), [circuit]);
  const [rows, setRows] = useState<Row[]>(() =>
    parts.map((p) => ({
      query: p.query,
      offers: [],
      selected: "",
      quantity: p.quantity,
      loading: true,
      phase: "queued",
      error: "",
      sandbox: false,
      digikeyLimited: false,
      recommendation: "",
      best: null,
      searchSuggestions: "",
    })),
  );
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const batch = useRef<AbortController | null>(null);
  const requests = useRef(new Map<number, AbortController>());
  const manualSelection = useRef(new Set<number>());
  const update = (i: number, patch: Partial<Row>) =>
    setRows((old) =>
      old.map((row, n) => (n === i ? { ...row, ...patch } : row)),
    );

  async function search(i: number, query: string, parent: AbortSignal) {
    requests.current.get(i)?.abort();
    const controller = new AbortController();
    requests.current.set(i, controller);
    manualSelection.current.delete(i);
    const signal = AbortSignal.any([parent, controller.signal]);
    const current = () =>
      requests.current.get(i) === controller && !abort.current?.signal.aborted;
    update(i, { loading: true, phase: "connecting", error: "", selected: "" });
    setSubmitted(false);
    try {
      await requestPurchase(
        { query, circuit, locale, partId: parts[i].id },
        signal,
        (event) => {
          if (!current() || signal.aborted) return;
          if (event.type === "phase") {
            update(i, { phase: event.phase });
            return;
          }
          if (event.type === "offers") {
            update(i, {
              offers: event.search.offers.filter((o) =>
                canPurchase(o, orderQuantity(o, parts[i].quantity)),
              ),
              sandbox: event.search.sandbox,
              digikeyLimited: !!event.search.digikeyLimited,
            });
            return;
          }
          if (event.type !== "result") return;
          const result = event.result;
          const offers = result.offers.filter((o) =>
            canPurchase(o, orderQuantity(o, parts[i].quantity)),
          );
          const recommended = result.sandbox
            ? undefined
            : offers.find(
                (o) => o.partNumber === result.recommendation?.partNumber,
              );
          setRows((old) =>
            old.map((row, n) =>
              n !== i
                ? row
                : {
                    ...row,
                    offers,
                    sandbox: result.sandbox,
                    digikeyLimited: !!result.digikeyLimited,
                    loading: false,
                    phase: "done",
                    selected: manualSelection.current.has(i)
                      ? offers.some((o) => o.partNumber === row.selected)
                        ? row.selected
                        : ""
                      : (recommended?.partNumber ?? ""),
                    quantity: manualSelection.current.has(i)
                      ? row.quantity
                      : recommended
                        ? orderQuantity(recommended, parts[i].quantity)
                        : parts[i].quantity,
                    recommendation: result.recommendation?.reason ?? "",
                    best: result.sandbox
                      ? null
                      : (result.recommendation?.best ?? null),
                    searchSuggestions:
                      result.recommendation?.searchSuggestions ?? "",
                  },
            ),
          );
        },
      );
    } catch (error) {
      if (current())
        update(i, {
          loading: false,
          phase: "done",
          error:
            error instanceof Error ? error.message : "商品検索に失敗しました。",
        });
    } finally {
      if (requests.current.get(i) === controller) requests.current.delete(i);
    }
  }

  async function searchBatch(indices: number[], parent: AbortSignal) {
    const controller = new AbortController();
    batch.current = controller;
    const signal = AbortSignal.any([parent, controller.signal]);
    const timer = setTimeout(
      () =>
        controller.abort(
          new Error(
            "検索の待ち時間が長いため一旦終了しました。未完了の部品だけ再試行できます。",
          ),
        ),
      PURCHASE_BATCH_TIMEOUT_MS,
    );
    setRows((old) =>
      old.map((row, i) =>
        indices.includes(i)
          ? { ...row, loading: true, phase: "queued", error: "" }
          : row,
      ),
    );
    let next = 0;
    try {
      await Promise.all(
        Array.from({ length: Math.min(3, indices.length) }, async () => {
          while (next < indices.length && !signal.aborted) {
            const i = indices[next++];
            await search(i, rows[i]?.query.trim() || parts[i].query, signal);
          }
        }),
      );
    } finally {
      clearTimeout(timer);
      if (batch.current === controller && !parent.aborted && signal.aborted)
        setRows((old) =>
          old.map((row, i) =>
            indices.includes(i) && row.loading
              ? {
                  ...row,
                  loading: false,
                  phase: "done",
                  error:
                    signal.reason instanceof Error
                      ? signal.reason.message
                      : "検索を中止しました。未完了の部品だけ再試行できます。",
                }
              : row,
          ),
        );
      if (batch.current === controller) batch.current = null;
    }
  }

  function stopSearch() {
    const reason = new Error(
      "検索を中止しました。未完了の部品だけ再試行できます。",
    );
    batch.current?.abort(reason);
    for (const request of requests.current.values()) request.abort(reason);
    setRows((old) =>
      old.map((row) =>
        row.loading
          ? { ...row, loading: false, phase: "done", error: reason.message }
          : row,
      ),
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    void (async () => {
      try {
        const config = await withDeadline(
          async (signal) => {
            const response = await fetch("/api/session", { signal });
            if (!response.ok)
              throw new Error(
                t("接続状態を確認できませんでした。閉じて再度お試しください。"),
              );
            return response.json();
          },
          10000,
          controller.signal,
          new Error(
            t(
              "接続状態の確認がタイムアウトしました。閉じて再度お試しください。",
            ),
          ),
        );
        if (controller.signal.aborted) return;
        if ((!config.digikey && !config.gemini) || !config.active) {
          setMessage(
            !config.digikey && !config.gemini
              ? "DigiKeyの商品検索は準備中です。管理者に連携設定を依頼してください。"
              : "利用期限が切れました。一覧を閉じて再度お試しください。",
          );
          setRows((old) => old.map((r) => ({ ...r, loading: false })));
          return;
        }
        setReady(true);
        await searchBatch(
          parts.map((_, i) => i),
          controller.signal,
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "接続状態を確認できませんでした。",
          );
          setRows((old) => old.map((r) => ({ ...r, loading: false })));
        }
      }
    })();
    return () => {
      controller.abort();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
    // The modal is mounted for one snapshot of the current circuit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = rows.flatMap((row) => {
    const offer = row.offers.find((o) => o.partNumber === row.selected);
    return offer ? [{ offer, quantity: row.quantity }] : [];
  });
  const lines = cartLines(selected);
  const sandbox = rows.some((r) => r.sandbox);
  const valid =
    lines.length > 0 &&
    selected.every((line) => canPurchase(line.offer, line.quantity)) &&
    lines.every((line) => canPurchase(line.offer, line.quantity)) &&
    !sandbox;
  const knownTotal = lines.reduce(
    (sum, line) =>
      sum + (unitPrice(line.offer, line.quantity) ?? 0) * line.quantity,
    0,
  );
  const unknownPrice = lines.some(
    (line) => unitPrice(line.offer, line.quantity) === null,
  );
  const loading = rows.some((r) => r.loading);
  const completed = rows.filter((r) => !r.loading && !r.error).length;
  const unfinished = rows.flatMap((r, i) => (r.error ? [i] : []));
  const phaseText: Record<PurchasePhase, string> = {
    queued: "順番待ち",
    connecting: "検索を開始しています…",
    digikey: "DigiKeyの商品を検索中…",
    discovery: "有力な商品を検索中…",
    verification: "在庫・仕様を確認中…",
    done: "確認完了",
  };

  return (
    <dialog
      ref={dialog}
      className="purchase-dialog"
      aria-labelledby="purchase-title"
      aria-describedby="purchase-help"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="purchase-header">
        <div>
          <span className="purchase-eyebrow">PARTS · SHOPPING</span>
          <h2 id="purchase-title">
            <ShoppingCart size={22} /> {t("部品を購入する")}
          </h2>
        </div>
        <button
          autoFocus
          className="icon-button"
          aria-label={t("購入一覧を閉じる")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p id="purchase-help">
        {t(
          "DigiKey・秋月・千石・共立・マルツ・Amazonから、回路に合う商品を見つけ次第表示します。全ショップを検索するとは限りません。売り切れ・在庫を確認できない商品はおすすめに含めません。",
        )}
      </p>
      {message && (
        <div className="purchase-message" role="status">
          {t(message)}
        </div>
      )}
      {rows.some((row) => row.digikeyLimited) && (
        <p className="purchase-message" role="status">
          {t(
            "DigiKeyは検索上限に達したため、今回の検索対象から外しています。ほかのショップは引き続き検索できます。",
          )}
        </p>
      )}
      {sandbox && (
        <p className="purchase-message" role="status">
          {t(
            "テスト用の商品情報です。実際の検索条件と一致しないためカートへ追加できません。",
          )}
        </p>
      )}
      <section
        className="purchase-recommended"
        aria-label={t("おすすめ購入リスト")}
      >
        <h3>
          <Sparkles size={17} /> {t("おすすめ購入リスト")}
        </h3>
        <p className="purchase-note">
          {t(
            "適合性・必要数量を確認し、価格も考慮した商品を部品ごとに1つ表示します。在庫・価格は取得時点の情報です。購入前に各商品ページで再確認してください。",
          )}
        </p>
        {!ready && loading && (
          <p className="purchase-status" role="status">
            <LoaderCircle size={14} className="spin" />
            {t("接続状態を確認中…")}
          </p>
        )}
        {ready && (
          <>
            <div className="purchase-progress">
              <p role="status">
                {t("確認済み {0} / {1} 部品", [completed, parts.length])}
              </p>
              <progress
                value={completed}
                max={parts.length}
                aria-label={t("商品検索の進捗")}
              />
              <p className="purchase-note">
                {t(
                  "見つかった商品から表示します。検索は最大90秒で一旦終了し、未完了の部品だけ再試行できます。",
                )}
              </p>
              {loading && (
                <button type="button" onClick={stopSearch}>
                  {t("検索を中止")}
                </button>
              )}
              {!loading && unfinished.length > 0 && ready && (
                <button
                  type="button"
                  onClick={() => {
                    if (abort.current)
                      void searchBatch(unfinished, abort.current.signal);
                  }}
                >
                  {t("未完了の部品を再試行")}
                </button>
              )}
            </div>
          </>
        )}
        <ul className="purchase-best-list">
          {rows.map((row, i) =>
            row.best && !row.sandbox ? (
              <li className="purchase-best" key={parts[i].id}>
                <div className="purchase-part-heading">
                  <h4>{t(parts[i].name)}</h4>
                  <span>
                    {row.best.store === "digikey"
                      ? "DigiKey"
                      : t(domesticStores[row.best.store].name)}
                  </span>
                </div>
                <a
                  className="purchase-product-link"
                  href={row.best.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.best.name} <ExternalLink size={14} />
                </a>
                <p className="purchase-spec">
                  {t("注文数 {0} × {1}個入り（必要数 {2}）", [
                    row.best.quantity,
                    row.best.unitsPerPack,
                    parts[i].quantity,
                  ])}
                </p>
                <strong>
                  {row.best.totalPrice === null
                    ? t("価格は商品ページで確認")
                    : t("商品代金 {0}（送料別）", [yen(row.best.totalPrice)])}
                </strong>
                <p className="purchase-note">{row.best.reason}</p>
                {row.best.checks && (
                  <p className="purchase-note">
                    {t("購入前の確認:")} {row.best.checks}
                  </p>
                )}
                <p className="purchase-note">
                  {t("在庫確認:")} {row.best.stockEvidence}
                </p>
                <p className="purchase-note">
                  {t("確認日時:")}{" "}
                  {new Date(row.best.checkedAt).toLocaleString(
                    locale === "en" ? "en-US" : "ja-JP",
                  )}
                </p>
              </li>
            ) : null,
          )}
        </ul>
        {ready && (
          <ul className="purchase-search-progress">
            {rows.map((row, i) =>
              row.loading || row.error ? (
                <li key={parts[i].id}>
                  <strong>{t(parts[i].name)}</strong>
                  {row.loading ? (
                    <span className="purchase-status">
                      {row.phase !== "queued" && (
                        <LoaderCircle size={14} className="spin" />
                      )}
                      {t(phaseText[row.phase])}
                    </span>
                  ) : (
                    <>
                      <span className="purchase-error" role="alert">
                        {t(row.error)}
                      </span>
                      <button
                        type="button"
                        disabled={!ready}
                        onClick={() => {
                          if (abort.current)
                            void search(
                              i,
                              row.query.trim(),
                              abort.current.signal,
                            );
                        }}
                      >
                        {t("この部品を再試行")}
                      </button>
                    </>
                  )}
                  {row.offers.length > 0 && (
                    <span className="purchase-note">
                      {t(
                        "DigiKeyの候補 {0}件を取得済み。下の詳細から選択できます。",
                        [row.offers.length],
                      )}
                    </span>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        )}
        {ready && !loading && !rows.some((row) => row.best) && (
          <p className="purchase-status">
            {t(
              "在庫と適合性を確認できる商品が見つかりませんでした。再検索してください。",
            )}
          </p>
        )}
        {rows.map((row, i) =>
          !row.loading && !row.best && !row.error && row.recommendation ? (
            <p className="purchase-note" key={parts[i].id}>
              {t(parts[i].name)}: {t(row.error || row.recommendation)}
            </p>
          ) : null,
        )}
        {rows.map((row, i) =>
          row.searchSuggestions ? (
            <iframe
              key={parts[i].id}
              className="purchase-search-suggestions"
              title={t("{0}の検索の参照元", [t(parts[i].name)])}
              srcDoc={row.searchSuggestions}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          ) : null,
        )}
      </section>
      <details className="purchase-details">
        <summary>{t("検索条件・DigiKeyの商品を変更")}</summary>
        <div className="purchase-list" aria-busy={loading}>
          {parts.map((part, i) => {
            const row = rows[i];
            const offer = row.offers.find((o) => o.partNumber === row.selected);
            return (
              <section
                className="purchase-row"
                key={part.id}
                aria-label={t("{0}の購入候補", [t(part.name)])}
              >
                <div className="purchase-part-heading">
                  <h3>
                    {t(part.name)}
                    {part.ledColor && ` (${part.ledColor})`}
                  </h3>
                  <span>
                    {t("必要数")} {part.quantity}
                  </span>
                </div>
                <p className="purchase-spec">{t(part.value)}</p>
                <p className="purchase-note">{t(part.note)}</p>
                <form
                  className="purchase-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (ready && !row.loading && abort.current)
                      void search(i, row.query.trim(), abort.current.signal);
                  }}
                >
                  <input
                    aria-label={t("{0}の検索語", [t(part.name)])}
                    value={row.query}
                    maxLength={200}
                    required
                    disabled={!ready || row.loading}
                    onChange={(event) =>
                      update(i, { query: event.target.value })
                    }
                  />
                  <button
                    type="submit"
                    disabled={!ready || row.loading || !row.query.trim()}
                  >
                    {t("再検索")}
                  </button>
                </form>
                {row.loading ? (
                  <p className="purchase-status" role="status">
                    <LoaderCircle size={16} className="spin" />{" "}
                    {t(phaseText[row.phase])}
                  </p>
                ) : row.error ? (
                  <p className="purchase-error" role="alert">
                    {t(row.error)}
                  </p>
                ) : ready && row.offers.length === 0 && !row.best ? (
                  <p className="purchase-status">
                    {t(
                      "候補が見つかりません。検索語や型番を変更してください。",
                    )}
                  </p>
                ) : null}
                {row.recommendation && (
                  <p className="purchase-note" role="status">
                    <strong>{t("AIの選定結果:")} </strong>
                    {t(row.recommendation)}
                  </p>
                )}
                {row.offers.length > 0 && (
                  <>
                    <label className="purchase-selection">
                      {t("購入する商品")}
                      <select
                        aria-label={t("{0}の商品", [t(part.name)])}
                        value={row.selected}
                        onChange={(event) => {
                          manualSelection.current.add(i);
                          const next = row.offers.find(
                            (o) => o.partNumber === event.target.value,
                          );
                          update(i, {
                            selected: event.target.value,
                            quantity: next
                              ? orderQuantity(next, part.quantity)
                              : part.quantity,
                          });
                          setSubmitted(false);
                        }}
                      >
                        <option value="">
                          {t("購入対象に含めない（商品を選択）")}
                        </option>
                        {row.offers.map((o) => (
                          <option
                            key={o.partNumber}
                            value={o.partNumber}
                            disabled={
                              o.stock < o.minimum ||
                              (o.maximum !== null && o.maximum < o.minimum)
                            }
                          >
                            {o.manufacturerPartNumber} · {o.partNumber} ·{" "}
                            {o.packaging} {t("· 在庫")} {o.stock}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="purchase-links">
                      {row.offers.map((o) => (
                        <a
                          key={o.partNumber}
                          href={o.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {o.manufacturerPartNumber} ({o.packaging}){" "}
                          <ExternalLink size={12} />
                        </a>
                      ))}
                    </div>
                  </>
                )}
                {offer && (
                  <div className="purchase-offer">
                    <p>
                      <strong>{offer.manufacturer}</strong> {offer.description}
                    </p>
                    <div className="purchase-offer-details">
                      <label>
                        {t("購入数量")}
                        <input
                          aria-label={t("{0}の購入数量", [t(part.name)])}
                          type="number"
                          min={offer.minimum}
                          max={Math.min(
                            offer.stock,
                            offer.maximum ?? 100000,
                            100000,
                          )}
                          step={1}
                          value={row.quantity}
                          onChange={(event) => {
                            manualSelection.current.add(i);
                            update(i, { quantity: Number(event.target.value) });
                            setSubmitted(false);
                          }}
                        />
                      </label>
                      <span>
                        {t("最少")} {offer.minimum} {t("/ 在庫")} {offer.stock}
                      </span>
                      <strong>
                        {unitPrice(offer, row.quantity) === null
                          ? t("価格はDigiKeyで確認")
                          : t("{0} / 個", [
                              yen(unitPrice(offer, row.quantity)!),
                            ])}
                      </strong>
                    </div>
                    {!canPurchase(offer, row.quantity) && (
                      <p className="purchase-error">
                        {t(
                          "最低購入数量・在庫数の範囲内で整数を指定してください。",
                        )}
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </details>
      <div className="purchase-footer">
        <div>
          <strong>
            {lines.length} {t("商品を選択 ·")} {yen(knownTotal)}
            {unknownPrice ? t(" ＋ 価格未確認分") : ""}
          </strong>
          <p>
            {t(
              "概算・送料等を除く。同一商品は数量を合算します。最終価格と注文確定はDigiKeyで確認してください。",
            )}
          </p>
        </div>
        {lines.length > 0 && !valid && !sandbox && !loading && (
          <p className="purchase-error" role="alert">
            {t(
              "同一商品の合計数量を含め、最低購入数量・在庫数・購入上限を確認してください。",
            )}
          </p>
        )}
        <form
          action={DIGIKEY_CART_ACTION}
          method="post"
          target="_blank"
          rel="noopener noreferrer"
          onSubmit={(event) => {
            if (!valid || submitted) {
              event.preventDefault();
              return;
            }
            setSubmitted(true);
          }}
        >
          {lines.map((line, i) => (
            <span key={line.offer.partNumber} hidden>
              <input
                type="hidden"
                name={`part${i + 1}`}
                value={line.offer.partNumber}
              />
              <input type="hidden" name={`qty${i + 1}`} value={line.quantity} />
            </span>
          ))}
          <button
            className="purchase-button"
            type="submit"
            disabled={!valid || submitted}
          >
            <ShoppingCart size={17} /> {t("購入する · DigiKeyのカートへ")}
            <Sparkles size={14} />
          </button>
        </form>
        {submitted && (
          <p role="status">
            {t(
              "DigiKeyへ送信しました。開いたタブで追加結果を確認してください。",
            )}
          </p>
        )}
      </div>
    </dialog>
  );
}
