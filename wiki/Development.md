# Development

開発環境の構築、テスト、プロジェクト構成について説明します。

## プロジェクト構成

```
breadberry/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API Routes
│   │   │   ├── generate/     #   POST: 回路生成（Gemini + GMI + Firestore）
│   │   │   ├── health/       #   GET: ヘルスチェック
│   │   │   ├── projects/     #   GET: プロジェクト一覧 / [id] で個別取得
│   │   │   └── session/      #   POST: セッション開始
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── studio.tsx        # ワークスペースと各操作
│   │   ├── board-scene.tsx   # 部品・基板・ジャンパ線の3D描画とアニメーション
│   │   ├── circuit-chat.tsx  # 回路設計チャット UI
│   │   └── schematic.tsx     # ネットリストの接続図
│   └── lib/
│       ├── circuit.ts        # 共通スキーマ、ピン表、配置、部品表、接続検査
│       ├── ai.ts             # Gemini 生成と GMI 補助レビュー
│       ├── conversation.ts   # 会話コンテキストの型・制約
│       ├── demo.ts           # APIキー不要のサンプル回路
│       └── server.ts         # セッション、Firestore、利用回数制限
├── tests/unit/               # ユニットテスト（node:test + tsx）
├── scripts/
│   ├── deploy.sh             # Cloud Build + Cloud Run デプロイ
│   ├── prepare-standalone.mjs
│   └── start.mjs
├── Dockerfile
├── compose.yaml / compose.gcp.yaml
├── cloudbuild.yaml
├── firestore.rules / firestore.indexes.json
└── .github/workflows/
    ├── deploy.yml            # main 向け PR マージ時のデプロイ
    └── playwright.yml        # E2E テスト
```

## 開発サーバー

```bash
npm ci
npm run dev
```

ホットリロード付きで [http://localhost:3000](http://localhost:3000) が起動します（`--hostname 0.0.0.0`）。

## テストと検証

```bash
npm run typecheck   # TypeScript の型検査（tsc --noEmit）
npm test            # ユニットテスト（node --test + tsx）
npm run build       # 本番ビルド + standalone 準備
npx playwright install --with-deps chromium
npm run test:e2e    # Playwright E2E テスト
```

### ユニットテスト（`tests/unit/`）

基板別のサンプル、穴の一意性、部品表の数量、危険な接続の拒否、モックによる Gemini/GMI リクエストを検証します。実 API はモックされるため料金は発生しません。

- `circuit.test.ts` — スキーマ・配置・接続検査
- `ai.test.ts` — Gemini/GMI リクエスト（モック）
- `catalog.test.ts` — 部品カタログ
- `conversation.test.ts` — 会話コンテキスト

### E2E テスト（Playwright）

PC とモバイルで以下を検証します。

- 3D 起動、工程移動、再生、タブ切替
- エクスポート、保存と再表示
- エラー表示、API の未認証拒否、横はみ出し

GitHub Actions でも実行します。APIキー・Google Cloud プロジェクトがない環境では、実 API・実 Firestore・Cloud Run へのデプロイの確認は別途必要です。

## コーディング規約

- TypeScript（strict）、フォーマットは Prettier
- AI 応答は必ず Zod の型検査とネット検査を通す
- API キーはサーバーサイドでのみ使用し、`NEXT_PUBLIC_` 変数に入れない
- 秘密値はコミットしない（`.env.local` は `.gitignore` 済み）

## 部品を追加するには

部品カタログは `src/lib/circuit.ts` の `catalog` で定義されています。新しい部品を追加する場合：

1. `catalog` に部品定義（kind、端子、外形）を追加
2. I2C / アナログ部品の場合は `i2cAddresses` / `isAnalog` を更新
3. 3D 描画（`board-scene.tsx`）に形状を追加
4. 接続検査ルールとユニットテストを追加

## 参考資料

- [Gemini 構造化出力](https://ai.google.dev/gemini-api/docs/structured-output) / [generateContent API](https://ai.google.dev/api/generate-content)
- [GMI Cloud Quick Start](https://docs.gmicloud.ai/quickstart)
- [Cloud Run へのコンテナデプロイ](https://cloud.google.com/run/docs/deploying)
- [ESP32 GPIO 仕様](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)
- [Pico 基板仕様](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html)
- [Raspberry Pi GPIO](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio)
- [Fritzing Learning](https://fritzing.org/learning/)
