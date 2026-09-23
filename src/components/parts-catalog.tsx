"use client";

import {
  Component,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Center } from "@react-three/drei";
import { Search, X } from "lucide-react";
import {
  catalog,
  partKinds,
  isAnalog,
  type Board,
  type Circuit,
} from "@/lib/circuit";
import { Part } from "./board-scene";
import { usePreferences } from "./preferences";

type Kind = Circuit["parts"][number]["kind"];
class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Preview({ kind }: { kind: Kind }) {
  const { t } = usePreferences();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Mount only visible rows: keep the WebGL context count bounded while scrolling.
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const def = catalog[kind];
  const holes = Object.fromEntries(
    def.pins.map((pin, i) => [`preview.${pin}`, `b${12 + def.offsets[i]}`]),
  );
  const fallback = <span>{t("3Dプレビューを表示できません。")}</span>;
  return (
    <div
      ref={host}
      className="catalog-preview"
      role="img"
      aria-label={t("{0}の3Dモデル", [t(def.name)])}
    >
      {visible && (
        <PreviewBoundary fallback={fallback}>
          <Canvas
            frameloop="demand"
            orthographic
            camera={{ position: [2, 2, 4], zoom: 80 }}
            dpr={[1, 1.5]}
            fallback={fallback}
          >
            <ambientLight intensity={1.8} />
            <directionalLight position={[3, 5, 4]} intensity={2.5} />
            <Suspense fallback={null}>
              <Center>
                <Part
                  part={{
                    id: "preview",
                    kind,
                    value: kind === "resistor" ? "220Ω" : "",
                    purpose: "",
                  }}
                  holes={holes}
                  active={false}
                  labels={false}
                />
              </Center>
            </Suspense>
          </Canvas>
        </PreviewBoundary>
      )}
    </div>
  );
}

export default function PartsCatalog({
  board,
  disabled,
  onSelect,
  onClose,
}: {
  board: Board;
  disabled: boolean;
  onSelect: (kind: Kind) => void;
  onClose: () => void;
}) {
  const { t } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const kinds = partKinds.filter((kind) =>
    `${kind} ${catalog[kind].name} ${t(catalog[kind].name)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="catalog-modal modal"
      aria-labelledby="catalog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="catalog-header">
        <h2 id="catalog-title">{t("対応するセンサー・部品")}</h2>
        <button
          autoFocus
          className="icon-button"
          aria-label={t("部品一覧を閉じる")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <p>{t("3Dモデルと名前を確認し、使いたい部品を選択してください。")}</p>
      <label className="parts-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("対応部品を検索")}
          placeholder={t("パーツを検索…")}
        />
      </label>
      <p className="catalog-count" role="status">
        {t("{0}種類の部品", [kinds.length])}
      </p>
      <ul className="catalog-list">
        {kinds.map((kind) => {
          const unavailable = board === "raspberry-pi" && isAnalog(kind);
          return (
            <li key={kind}>
              <Preview kind={kind} />
              <div>
                <h3>{t(catalog[kind].name)}</h3>
                <p>{catalog[kind].pins.join(" / ")}</p>
                {unavailable && <p>{t("Raspberry Pi 4/5はADC非搭載です")}</p>}
                <button
                  className="secondary-button"
                  disabled={disabled || unavailable}
                  onClick={() => onSelect(kind)}
                  aria-label={t("{0}を選択", [t(catalog[kind].name)])}
                >
                  {t("この部品を使う")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {!kinds.length && <p>{t("該当する部品がありません。")}</p>}
    </dialog>
  );
}
