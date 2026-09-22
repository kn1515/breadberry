"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, ShoppingCart, X } from "lucide-react";
import type { Circuit } from "@/lib/circuit";
import {
  canPurchase,
  cartLines,
  DIGIKEY_CART_ACTION,
  orderQuantity,
  purchaseParts,
  unitPrice,
  type PurchaseOffer,
  type PurchaseSearch,
} from "@/lib/purchase";

type Row = {
  query: string;
  offers: PurchaseOffer[];
  selected: string;
  quantity: number;
  loading: boolean;
  error: string;
  sandbox: boolean;
};
const yen = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }).format(value);

export default function PurchaseModal({
  circuit,
  onClose,
  onConnect,
}: {
  circuit: Circuit;
  onClose: () => void;
  onConnect: () => void;
}) {
  const parts = useMemo(() => purchaseParts(circuit), [circuit]);
  const [rows, setRows] = useState<Row[]>(() =>
    parts.map((p) => ({
      query: p.query,
      offers: [],
      selected: "",
      quantity: p.quantity,
      loading: true,
      error: "",
      sandbox: false,
    })),
  );
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [needsSession, setNeedsSession] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const update = (i: number, patch: Partial<Row>) =>
    setRows((old) =>
      old.map((row, n) => (n === i ? { ...row, ...patch } : row)),
    );

  async function search(i: number, query: string, signal: AbortSignal) {
    update(i, { loading: true, error: "", selected: "", offers: [] });
    setSubmitted(false);
    try {
      const response = await fetch("/api/purchase/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "商品検索に失敗しました。");
      const result = data as PurchaseSearch;
      if (!signal.aborted)
        update(i, {
          offers: result.offers,
          sandbox: result.sandbox,
          loading: false,
        });
    } catch (error) {
      if (!signal.aborted)
        update(i, {
          loading: false,
          error:
            error instanceof Error ? error.message : "商品検索に失敗しました。",
        });
    }
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
        const response = await fetch("/api/session", {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "接続状態を確認できませんでした。閉じて再度お試しください。",
          );
        const config = await response.json();
        if (controller.signal.aborted) return;
        if (!config.digikey || !config.active) {
          setMessage(
            !config.digikey
              ? "DigiKeyの商品検索は準備中です。管理者に連携設定を依頼してください。"
              : "部品検索を利用するには、接続設定からセッションを開始してください。",
          );
          setNeedsSession(!config.active);
          setRows((old) => old.map((r) => ({ ...r, loading: false })));
          return;
        }
        setReady(true);
        // Bound provider concurrency even for a 30-part editor circuit.
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(3, parts.length) }, async () => {
            while (next < parts.length && !controller.signal.aborted) {
              const i = next++;
              await search(i, parts[i].query, controller.signal);
            }
          }),
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
          <span className="purchase-eyebrow">PARTS · DIGIKEY</span>
          <h2 id="purchase-title">
            <ShoppingCart size={22} /> 部品を購入する
          </h2>
        </div>
        <button
          autoFocus
          className="icon-button"
          aria-label="購入一覧を閉じる"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p id="purchase-help">
        回路に必要な部品の購入候補です。商品ページで仕様・端子・入数を確認し、購入する商品を選択してください。
      </p>
      {message && (
        <div className="purchase-message" role="status">
          {message}
          {needsSession && (
            <button className="purchase-button" onClick={onConnect}>
              接続設定を開く
            </button>
          )}
        </div>
      )}
      {sandbox && (
        <p className="purchase-message" role="status">
          テスト用の商品情報です。実際の検索条件と一致しないためカートへ追加できません。
        </p>
      )}
      <div className="purchase-list" aria-busy={loading}>
        {parts.map((part, i) => {
          const row = rows[i];
          const offer = row.offers.find((o) => o.partNumber === row.selected);
          return (
            <section
              className="purchase-row"
              key={part.id}
              aria-label={`${part.name}の購入候補`}
            >
              <div className="purchase-part-heading">
                <h3>
                  {part.name}
                  {part.ledColor && ` (${part.ledColor})`}
                </h3>
                <span>必要数 {part.quantity}</span>
              </div>
              <p className="purchase-spec">{part.value}</p>
              <p className="purchase-note">{part.note}</p>
              <form
                className="purchase-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (ready && !row.loading && abort.current)
                    void search(i, row.query.trim(), abort.current.signal);
                }}
              >
                <input
                  aria-label={`${part.name}の検索語`}
                  value={row.query}
                  maxLength={200}
                  required
                  disabled={!ready || row.loading}
                  onChange={(event) => update(i, { query: event.target.value })}
                />
                <button
                  type="submit"
                  disabled={!ready || row.loading || !row.query.trim()}
                >
                  再検索
                </button>
              </form>
              {row.loading ? (
                <p className="purchase-status" role="status">
                  <LoaderCircle size={16} className="spin" /> 購入候補を検索中…
                </p>
              ) : row.error ? (
                <p className="purchase-error" role="alert">
                  {row.error}
                </p>
              ) : ready && row.offers.length === 0 ? (
                <p className="purchase-status">
                  候補が見つかりません。検索語や型番を変更してください。
                </p>
              ) : null}
              {row.offers.length > 0 && (
                <>
                  <label className="purchase-selection">
                    購入する商品
                    <select
                      aria-label={`${part.name}の商品`}
                      value={row.selected}
                      onChange={(event) => {
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
                      <option value="">購入対象に含めない（商品を選択）</option>
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
                          {o.packaging} · 在庫 {o.stock}
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
                      購入数量
                      <input
                        aria-label={`${part.name}の購入数量`}
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
                          update(i, { quantity: Number(event.target.value) });
                          setSubmitted(false);
                        }}
                      />
                    </label>
                    <span>
                      最少 {offer.minimum} / 在庫 {offer.stock}
                    </span>
                    <strong>
                      {unitPrice(offer, row.quantity) === null
                        ? "価格はDigiKeyで確認"
                        : `${yen(unitPrice(offer, row.quantity)!)} / 個`}
                    </strong>
                  </div>
                  {!canPurchase(offer, row.quantity) && (
                    <p className="purchase-error">
                      最低購入数量・在庫数の範囲内で整数を指定してください。
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="purchase-footer">
        <div>
          <strong>
            {lines.length} 商品を選択 · {yen(knownTotal)}
            {unknownPrice ? " ＋ 価格未確認分" : ""}
          </strong>
          <p>
            概算・送料等を除く。同一商品は数量を合算します。最終価格と注文確定はDigiKeyで確認してください。
          </p>
        </div>
        {lines.length > 0 && !valid && !sandbox && (
          <p className="purchase-error" role="alert">
            同一商品の合計数量を含め、最低購入数量・在庫数・購入上限を確認してください。
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
            <ShoppingCart size={17} /> 購入する · DigiKeyのカートへ
          </button>
        </form>
        {submitted && (
          <p role="status">
            DigiKeyへ送信しました。開いたタブで追加結果を確認してください。
          </p>
        )}
      </div>
    </dialog>
  );
}
