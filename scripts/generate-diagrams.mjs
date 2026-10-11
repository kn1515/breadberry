// docs/ の構成図（architecture / components / sequence）をSVGとPNGで生成します。
// 実行: npm run diagrams（PNGの描画にPlaywrightのChromiumを使います）
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const root = join(import.meta.dirname, "..");
const docs = join(root, "docs");
const uri = (svg) =>
  "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const file = (name) => readFileSync(join(docs, "icons", `${name}.svg`), "utf8");
// Google Cloud公式アイコンは色付きのまま使います。
const official = (name) => uri(file(name));
// Simple Iconsは単色のため、ブランドカラーを指定します。
const simple = (name, color) =>
  uri(
    file(name)
      .replace(/<title>.*?<\/title>/, "")
      .replace("<svg ", `<svg fill="${color}" `),
  );
const glyph = (body) =>
  uri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`,
  );

const ICON = {
  run: official("cloud_run"),
  firestore: official("firestore"),
  secret: official("secret_manager"),
  build: official("cloud_build"),
  registry: official("artifact_registry"),
  gcp: simple("googlecloud", "#4285f4"),
  gemini: simple("googlegemini", "#4285f4"),
  actions: simple("githubactions", "#2088ff"),
  next: simple("nextdotjs", "#000000"),
  react: simple("react", "#149eca"),
  three: simple("threedotjs", "#000000"),
  docker: simple("docker", "#2496ed"),
  digikey: simple("digikeyelectronics", "#cc0000"),
  browser: glyph(
    '<rect x="2" y="4" width="20" height="16" rx="2.5" fill="#fff" stroke="#5f6368" stroke-width="1.8"/>' +
      '<path d="M2 9h20" stroke="#5f6368" stroke-width="1.8"/>' +
      '<circle cx="5.2" cy="6.6" r=".9" fill="#5f6368"/><circle cx="8" cy="6.6" r=".9" fill="#5f6368"/>',
  ),
  cloud: glyph(
    '<path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9.5a4.75 4.75 0 0 1-.5 9.5z" fill="#fff" stroke="#5f6368" stroke-width="1.8" stroke-linejoin="round"/>',
  ),
  user: glyph(
    '<circle cx="12" cy="8" r="4" fill="#fff" stroke="#5f6368" stroke-width="1.8"/>' +
      '<path d="M4 21a8 8 0 0 1 16 0" fill="#fff" stroke="#5f6368" stroke-width="1.8" stroke-linecap="round"/>',
  ),
};

const BLUE = "#1a56c4",
  INK = "#202124",
  GREY = "#5f6368",
  LINE = "#3c4043",
  CI = "#80868b",
  GC = "#4285f4";

const esc = (t) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const img = (name, x, y, size) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${ICON[name]}" />`;
const text = (x, y, t, size = 13, fill = INK, bold = false, anchor = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}"${bold ? ' font-weight="700"' : ""}${anchor ? ` text-anchor="${anchor}"` : ""}>${esc(t)}</text>`;
const rect = (
  x,
  y,
  w,
  h,
  stroke = GREY,
  fill = "#ffffff",
  sw = 2,
  rx = 12,
  dash = "",
) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""} />`;
const path = (d, color = LINE, dashed = false, both = false) => {
  const m = color === LINE ? "a" : "b";
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="6 5"' : ""} marker-end="url(#${m})"${both ? ` marker-start="url(#${m})"` : ""} />`;
};
// 全角は13px、半角は7.2pxとして文字列の幅を見積もります。
const textWidth = (t) =>
  [...t].reduce((w, ch) => w + (ch.codePointAt(0) > 255 ? 13 : 7.2), 0);

function doc(w, h, title, body) {
  const marker = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}" /></marker>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="'Noto Sans JP', sans-serif">\n` +
    `<defs>${marker("a", LINE)}${marker("b", CI)}</defs>\n` +
    `<rect width="${w}" height="${h}" fill="#ffffff" />\n` +
    text(40, 52, title, 28, INK, true) +
    "\n" +
    body.join("\n") +
    "\n</svg>\n"
  );
}

function service(x, y, w, h, icon, title, lines, gc = true) {
  return [
    rect(x, y, w, h, gc ? GC : GREY),
    img(icon, x + 18, y + 14, 36),
    text(x + 66, y + 40, title, 18, gc ? BLUE : INK, true),
    ...lines.map(([t, c], i) => text(x + 20, y + 72 + 22 * i, t, 13, c)),
  ];
}

// ---------------------------------------------------------------- システム構成図
function architecture() {
  const b = [];
  b.push(rect(370, 90, 840, 730, GC, "#f1f6fe", 2, 16, "8 6"));
  b.push(img("gcp", 392, 104, 26));
  b.push(text(428, 124, "Google Cloud（asia-northeast1）", 18, BLUE, true));

  b.push(rect(40, 150, 260, 370));
  b.push(img("browser", 60, 166, 40));
  b.push(text(112, 194, "ブラウザ", 20, INK, true));
  b.push(img("react", 224, 174, 24));
  b.push(img("three", 256, 174, 24));
  b.push(text(60, 228, "React 19 / Three.js", 14, GREY));
  [
    "回路設計チャット",
    "3Dブレッドボード",
    "回路図 / 部品表",
    "組み立て工程ガイド",
    "レイアウトエディタ",
    "部品の購入提案",
  ].forEach((t, i) => b.push(text(60, 268 + 30 * i, "・" + t, 15)));
  b.push(text(60, 490, "署名付きCookie（bb_session）", 13, GREY));

  b.push(rect(400, 150, 380, 370, GC, "#ffffff", 3));
  b.push(img("run", 420, 166, 40));
  b.push(text(472, 194, "Cloud Run", 20, BLUE, true));
  b.push(img("next", 704, 174, 24));
  b.push(img("docker", 736, 174, 24));
  b.push(text(420, 228, "Next.js 16 App Router（Dockerコンテナ）", 14, GREY));
  [
    ["POST /api/generate", "回路生成 → 接続検査 → レビュー → 保存"],
    ["POST /api/purchase/search", "部品の在庫・販売店の検索と照合"],
    ["/api/projects, /api/projects/[id]", "回路の保存・一覧・取得"],
    ["/api/session ・ GET /api/health", "HMAC署名セッション / ヘルスチェック"],
  ].forEach(([t, d], i) => {
    b.push(text(420, 266 + 56 * i, t, 14, INK, true));
    b.push(text(436, 288 + 56 * i, d, 14, GREY));
  });
  b.push(text(420, 496, "Zodスキーマ検査・ネット検査・利用回数制限", 13, GREY));

  b.push(
    ...service(900, 150, 280, 108, "gemini", "Gemini API", [
      ["回路の構造化JSON生成", INK],
      ["Google検索 / URLコンテキスト", INK],
    ]),
    ...service(900, 290, 280, 108, "firestore", "Cloud Firestore", [
      ["プロジェクト（回路＋会話履歴）", INK],
      ["日次の利用回数カウンター", INK],
    ]),
    ...service(900, 430, 280, 90, "secret", "Secret Manager", [
      ["APIキー・セッション署名キー", INK],
    ]),
    ...service(
      1270,
      150,
      290,
      108,
      "cloud",
      "GMI Cloud",
      [
        ["生成結果の補助レビュー", INK],
        ["電圧・配線・ピン・コードの整合性", GREY],
      ],
      false,
    ),
    ...service(
      1270,
      290,
      290,
      108,
      "digikey",
      "DigiKey API",
      [
        ["部品の検索・在庫・価格", INK],
        ["OAuth 2.0（クライアント認証）", GREY],
      ],
      false,
    ),
  );

  b.push(path("M300 335 H398", LINE, false, true));
  b.push(text(335, 325, "HTTPS", 13, LINE, false, "middle"));
  b.push(path("M780 204 H898"));
  b.push(path("M780 344 H898", LINE, false, true));
  b.push(path("M900 475 H782"));
  b.push(path("M780 274 H1415 V260"));
  b.push(path("M780 414 H1415 V400"));

  b.push(text(40, 620, "デプロイ（main へのPRマージ時）", 16, GREY, true));
  b.push(
    ...service(
      40,
      650,
      260,
      110,
      "actions",
      "GitHub Actions",
      [
        ["make deploy", INK],
        ["Workload Identity 連携で認証", GREY],
      ],
      false,
    ),
    ...service(400, 650, 260, 110, "build", "Cloud Build", [
      ["Dockerイメージのビルド", INK],
    ]),
    ...service(760, 650, 260, 110, "registry", "Artifact Registry", [
      ["コンテナイメージの保管", INK],
    ]),
  );
  b.push(path("M300 705 H398", CI, true));
  b.push(path("M660 705 H758", CI, true));
  b.push(path("M890 650 V585 H590 V522", CI, true));
  b.push(text(740, 575, "gcloud run deploy", 13, GREY, false, "middle"));

  b.push(path("M1270 690 H1320"));
  b.push(text(1332, 695, "実行時の通信", 13, GREY));
  b.push(path("M1270 720 H1320", CI, true));
  b.push(text(1332, 725, "ビルド・デプロイ", 13, GREY));
  b.push(rect(1270, 742, 50, 18, GC, "#ffffff", 2, 4));
  b.push(text(1332, 756, "Google Cloud のサービス", 13, GREY));
  b.push(rect(1270, 772, 50, 18, GREY, "#ffffff", 2, 4));
  b.push(text(1332, 786, "外部サービス・クライアント", 13, GREY));
  return doc(1600, 860, "breadberry システム構成図", b);
}

// ---------------------------------------------------------------- コンポーネント図
function components() {
  const b = [];
  const X = [60, 290, 520, 750, 980];

  b.push(rect(40, 80, 1160, 250, GREY, "#fafafa", 2, 16));
  b.push(img("browser", 60, 92, 26));
  b.push(
    text(
      96,
      111,
      "ブラウザ（Reactクライアントコンポーネント / src/components）",
      16,
      INK,
      true,
    ),
  );
  b.push(img("react", 1118, 92, 24));
  b.push(img("three", 1152, 92, 24));
  b.push(rect(60, 125, 1120, 190, GREY));
  b.push(text(80, 152, "Studio", 16, INK, true));
  b.push(
    text(
      146,
      152,
      "studio.tsx — ワークスペース全体の状態と操作 / Preferences（言語・表示設定）",
      13,
      GREY,
    ),
  );
  [
    ["CircuitChat", "circuit-chat.tsx", ["回路設計チャット"]],
    ["BoardScene", "board-scene.tsx", ["3D描画と", "組み立てアニメ"]],
    ["Schematic", "schematic.tsx", ["ネットリストの", "接続図"]],
    ["LayoutEditor", "layout-editor.tsx", ["配置の編集と", "干渉チェック"]],
    ["PartsCatalog", "parts-catalog.tsx", ["部品カタログ"]],
    ["PurchaseModal", "purchase-modal.tsx", ["部品の購入提案"]],
    ["Tutorial", "tutorial.tsx", ["操作ガイド"]],
  ].forEach(([name, source, lines], i) => {
    const x = 80 + 156 * i;
    b.push(rect(x, 172, 144, 126, "#9aa0a6", "#ffffff", 1.5, 8));
    b.push(text(x + 12, 198, name, 14, INK, true));
    b.push(text(x + 12, 217, source, 11, GREY));
    lines.forEach((d, j) => b.push(text(x + 12, 248 + 19 * j, d, 12)));
  });

  b.push(path("M620 330 V368"));
  b.push(text(634, 355, "fetch（JSON / NDJSONストリーム）", 13, LINE));

  b.push(rect(40, 370, 1160, 120, GC, "#f1f6fe", 2, 16));
  b.push(img("run", 60, 380, 24));
  b.push(
    text(
      94,
      399,
      "APIルート（src/app/api）— Cloud Run 上の Next.js",
      16,
      BLUE,
      true,
    ),
  );
  [
    ["POST /api/generate", "回路の生成・修正"],
    ["GET /api/health", "ヘルスチェック"],
    ["POST /api/purchase/search", "部品の購入先検索"],
    ["/api/projects（/[id]）", "回路の保存・一覧・取得"],
    ["/api/session", "セッション開始・接続状態"],
  ].forEach(([name, d], i) => {
    b.push(rect(X[i], 410, 200, 65, GC, "#ffffff", 1.5, 8));
    b.push(text(X[i] + 12, 436, name, 13, INK, true));
    b.push(text(X[i] + 12, 458, d, 12, GREY));
  });

  b.push(rect(40, 530, 1160, 220, GC, "#f1f6fe", 2, 16));
  b.push(text(290, 559, "サーバーライブラリ（src/lib）", 16, BLUE, true));
  [
    [
      "ai.ts",
      ["generateCircuit", "reviewCircuit"],
      ["Gemini生成と検査", "GMI補助レビュー"],
    ],
    [
      "purchase-ai.ts",
      ["recommendPurchase"],
      ["販売店の探索と", "商品ページの照合"],
    ],
    [
      "purchase-search.ts",
      ["runPurchaseSearch"],
      ["購入検索の進行管理", "期限・中断・逐次通知"],
    ],
    ["digikey.ts", ["searchDigiKey"], ["OAuth・商品検索", "結果の正規化"]],
    [
      "server.ts",
      ["owner / checkOrigin", "takeQuota / saveProject"],
      ["全ルート共通の基盤", "セッション・利用回数・保存"],
    ],
  ].forEach(([name, functions, lines], i) => {
    b.push(rect(X[i], 580, 200, 150, GC, "#ffffff", 1.5, 8));
    b.push(text(X[i] + 12, 606, name, 14, INK, true));
    functions.forEach((f, j) =>
      b.push(text(X[i] + 12, 630 + 18 * j, f, 12, BLUE)),
    );
    lines.forEach((d, j) => b.push(text(X[i] + 12, 690 + 18 * j, d, 12, GREY)));
  });

  b.push(path("M160 475 V578"));
  b.push(path("M620 475 V578"));
  b.push(path("M900 475 L1040 578"));
  b.push(path("M1100 475 V578"));
  b.push(path("M520 655 H492"));
  b.push(path("M720 655 H748"));

  [
    [60, "cloud", "GMI Cloud", ["補助レビュー", "（OpenAI互換API）"], false],
    [
      290,
      "gemini",
      "Gemini API",
      ["構造化JSON出力", "Google検索 / URLコンテキスト"],
      true,
    ],
    [750, "digikey", "DigiKey API", ["商品検索・在庫・価格"], false],
    [
      980,
      "firestore",
      "Cloud Firestore",
      ["プロジェクト", "利用回数カウンター"],
      true,
    ],
  ].forEach(([x, icon, name, lines, gc]) => {
    b.push(rect(x, 800, 200, 104, gc ? GC : GREY));
    b.push(img(icon, x + 14, 812, 32));
    b.push(text(x + 54, 835, name, 16, gc ? BLUE : INK, true));
    lines.forEach((d, j) => b.push(text(x + 14, 868 + 19 * j, d, 12)));
  });
  b.push(path("M130 730 V798"));
  b.push(path("M225 730 L330 798"));
  b.push(path("M410 730 V798"));
  b.push(path("M850 730 V798"));
  b.push(path("M1080 730 V798"));

  b.push(rect(1230, 80, 330, 670, GREY, "#fafafa", 2, 16));
  b.push(text(1250, 111, "共有ドメイン（src/lib）", 16, INK, true));
  b.push(text(1250, 132, "クライアントとサーバーで共通のロジック", 12, GREY));
  [
    ["circuit.ts", "スキーマ・部品カタログ・接続検査・部品表"],
    ["layout.ts", "部品配置・ブレッドボード・干渉チェック"],
    ["logic.ts", "74HCロジックICのピンと論理"],
    ["led.ts", "LEDの色と3Dモデルの対応"],
    ["conversation.ts", "会話履歴の型と上限"],
    ["purchase.ts / purchase-catalog.ts", "購入データの型・登録商品"],
    ["demo.ts / cpu-demo.ts", "APIキー不要のサンプル回路"],
    ["i18n.ts / messages.ts", "日本語・英語の表示切り替え"],
  ].forEach(([name, d], i) => {
    const y = 148 + 74 * i;
    b.push(rect(1250, y, 290, 60, "#9aa0a6", "#ffffff", 1.5, 8));
    b.push(text(1262, y + 24, name, 13, INK, true));
    b.push(text(1262, y + 45, d, 12, GREY));
  });
  for (const y of [205, 430, 640]) b.push(path(`M1200 ${y} H1228`, CI, true));

  b.push(path("M1250 820 H1300"));
  b.push(text(1312, 825, "呼び出し（HTTP / 関数）", 13, GREY));
  b.push(path("M1250 850 H1300", CI, true));
  b.push(text(1312, 855, "import（共有ロジックの利用）", 13, GREY));
  b.push(rect(1250, 872, 50, 18, GC, "#ffffff", 2, 4));
  b.push(text(1312, 886, "Google Cloud 上で動く部分", 13, GREY));
  b.push(
    text(
      1250,
      918,
      "※ すべてのAPIルートが server.ts を利用（矢印は一部省略）",
      12,
      GREY,
    ),
  );
  return doc(1600, 940, "breadberry コンポーネント図", b);
}

// ---------------------------------------------------------------- 処理シーケンス図
function sequence() {
  const P = {
    user: [110, "user", "ユーザー", false],
    web: [330, "browser", "ブラウザ", false],
    run: [600, "run", "Cloud Run", true],
    fs: [860, "firestore", "Cloud Firestore", true],
    gem: [1080, "gemini", "Gemini API", true],
    gmi: [1290, "cloud", "GMI Cloud", false],
    dk: [1480, "digikey", "DigiKey API", false],
  };
  const H = 1480;
  const b = [];
  for (const [x, icon, name, gc] of Object.values(P)) {
    b.push(
      `<path d="M${x} 166 V${H - 40}" stroke="#bdc1c6" stroke-width="1.5" stroke-dasharray="5 5" />`,
    );
    b.push(rect(x - 85, 82, 170, 84, gc ? GC : GREY));
    b.push(img(icon, x - 17, 92, 34));
    b.push(text(x, 152, name, 15, gc ? BLUE : INK, true, "middle"));
  }
  const frame = (y1, y2, label) => {
    const w = 28 + 16 * label.length;
    b.push(rect(30, y1, 1540, y2 - y1, "#9aa0a6", "none", 1.5, 10));
    b.push(
      `<path d="M30 ${y1 + 30} H${30 + w - 12} L${30 + w} ${y1 + 18} V${y1} H40 a10 10 0 0 0 -10 10 z" fill="#e8eaed" stroke="#9aa0a6" stroke-width="1.5" />`,
    );
    b.push(text(44, y1 + 21, label, 15, INK, true));
  };
  const msg = (y, from, to, t, ret = false) => {
    const x1 = P[from][0],
      x2 = P[to][0];
    const d = x2 > x1 ? 3 : -3;
    b.push(path(`M${x1 + d} ${y} H${x2 - d}`, ret ? CI : LINE, ret));
    const m = (x1 + x2) / 2;
    const w = textWidth(t) + 12;
    b.push(
      `<rect x="${m - w / 2}" y="${y - 24}" width="${w}" height="18" fill="#ffffff" />`,
    );
    b.push(text(m, y - 9, t, 13, ret ? GREY : INK, false, "middle"));
  };
  const note = (y, p, t) => {
    const x = P[p][0];
    const w = textWidth(t) + 24;
    b.push(rect(x - w / 2, y - 24, w, 32, "#f9ab00", "#fef7e0", 1.5, 6));
    b.push(text(x, y - 3, t, 13, INK, false, "middle"));
  };

  frame(190, 918, "回路の生成・修正");
  let y = (i) => 248 + 46 * i;
  msg(y(0), "user", "web", "要望・基板を入力");
  msg(y(1), "web", "run", "POST /api/session（未開始時）");
  msg(y(2), "run", "web", "署名付きCookieを発行", true);
  msg(y(3), "web", "run", "POST /api/generate");
  note(y(4), "run", "送信元・セッション・入力を検査");
  msg(y(5), "run", "fs", "利用回数を消費（上限超過は429）");
  msg(y(6), "run", "gem", "generateContent（JSONスキーマ指定）");
  msg(y(7), "gem", "run", "回路ネットリスト（JSON）", true);
  note(y(8), "run", "スキーマ検査・接続検査");
  msg(y(9), "run", "gmi", "補助レビューを依頼");
  msg(
    y(10),
    "gmi",
    "run",
    "レビュー結果（失敗時は「未実施」として継続）",
    true,
  );
  msg(y(11), "run", "fs", "プロジェクトを保存");
  msg(y(12), "run", "web", "回路・会話・レビュー", true);
  note(y(13), "web", "3D・回路図・部品表を描画");
  msg(y(14), "web", "user", "組み立て手順を表示", true);

  frame(940, 1430, "部品の購入提案");
  y = (i) => 998 + 46 * i;
  msg(y(0), "user", "web", "購入先を検索");
  msg(y(1), "web", "run", "POST /api/purchase/search");
  msg(y(2), "run", "fs", "利用回数を消費");
  msg(y(3), "run", "dk", "商品検索（在庫・価格）");
  msg(y(4), "dk", "run", "商品候補", true);
  msg(y(5), "run", "web", "候補を逐次送信（NDJSON）", true);
  msg(
    y(6),
    "run",
    "gem",
    "販売店の探索（Google検索）と商品ページの照合（URLコンテキスト）",
  );
  msg(y(7), "gem", "run", "推奨候補と理由", true);
  msg(y(8), "run", "web", "推奨結果", true);
  msg(y(9), "web", "user", "購入候補を表示", true);
  return doc(1600, H, "breadberry 処理シーケンス図", b);
}

const diagrams = { architecture, components, sequence };
const font = (weight) =>
  `@font-face{font-family:"Noto Sans JP";font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(
    join(
      root,
      `node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-${weight}-normal.woff2`,
    ),
  ).toString("base64")}) format("woff2");}`;
const style = `<style>${font(400)}${font(700)}body{margin:0}</style>`;

const browser = await chromium.launch();
for (const [name, build] of Object.entries(diagrams)) {
  const svg = build();
  writeFileSync(join(docs, `${name}.svg`), svg);
  const [, width, height] = svg.match(/width="(\d+)" height="(\d+)"/);
  const page = await browser.newPage({
    viewport: { width: +width, height: +height },
    deviceScaleFactor: 2,
  });
  await page.setContent(style + svg);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(docs, `${name}.png`) });
  await page.close();
  console.log(`docs/${name}.svg, docs/${name}.png`);
}
await browser.close();
