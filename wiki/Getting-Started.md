# Getting Started

breadberry をローカル環境で動かし、回路を生成するまでの手順です。

## 前提条件

- Node.js 24 と npm
- （任意）Java と Firebase CLI — Firestore エミュレーターを使う場合
- （任意）Google AI Studio の API キー、GMI Cloud の API キー — AI 生成を使う場合

## 最小構成で起動

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。APIキーなしでも、温湿度計・LEDブリンク・DS18B20温度計・OLED表示などのサンプル回路を操作できます。サンプルはブラウザに保存され、AI生成を装いません。

## AI生成とFirestore保存を有効化

```bash
cp .env.example .env.local
openssl rand -hex 32   # SESSION_SECRET に設定する乱数を生成
```

`.env.local` に次の値を記入します。**APIキーをブラウザ用の `NEXT_PUBLIC_` 変数に入れないでください。**

| 変数                     | 用途                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `GEMINI_API_KEY`         | Google AI Studioで発行したAPIキー                                 |
| `GEMINI_MODEL`           | 既定 `gemini-3.8-flash`。利用可能な構造化出力対応モデルに変更可能 |
| `GMI_API_KEY`            | GMI CloudのAPIキー。未設定時はレビュー未実施と表示                |
| `GMI_MODEL`              | 既定 `meta-llama/Llama-3.3-70B-Instruct`                          |
| `GMI_BASE_URL`           | 既定 `https://api.gmi-serving.com/v1`。HTTPSのみ                  |
| `GOOGLE_CLOUD_PROJECT`   | Firestoreを作成したGoogle CloudプロジェクトID                     |
| `FIRESTORE_DATABASE_ID`  | 既定 `(default)`                                                  |
| `SESSION_SECRET`         | 32文字以上のランダムな署名キー                                    |
| `APP_ORIGIN`             | リバースプロキシ使用時の実際のアクセス元URL。末尾 `/` なし        |
| `DAILY_GENERATION_LIMIT` | アプリ全体の1日生成上限。既定200                                  |
| `SESSION_DAILY_LIMIT`    | セッションごとの1日生成上限。既定20                               |

ローカルから本物の Firestore を使う場合は、gcloud CLI で ADC（Application Default Credentials）を設定します。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

ADC のユーザーに Firestore の読み書き権限が必要です。環境変数設定後にサーバーを再起動し、画面を再読み込みしてください。セッションは自動開始します。

### Firestore エミュレーター

Java と Firebase CLI がある環境では、別ターミナルで以下を実行できます。

```bash
firebase emulators:start --only firestore --project demo-breadberry
```

`.env.local` に `GOOGLE_CLOUD_PROJECT=demo-breadberry`、`FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` を設定します。Gemini/GMI は引き続き実APIです。通常のユニットテストはAPIをモックするため、料金は発生しません。

## 回路を生成する

1. 画面を開くとセッションが自動開始（アクセスコード不要）
2. 基板（ESP32 / Pico / Raspberry Pi）を選択
3. 入力欄に作りたいものを自然言語で入力（例:「温湿度を測ってOLEDに表示したい」）
4. 必要に応じて「対応するセンサー・部品」から部品を選択
5. 生成を実行すると、部品表・3D組み立てガイド・接続図・コード・工程が表示される

## チャットで回路を修正する

画面右側の「回路設計チャット」に変更内容を入力して「回路を修正」を押します。表示中の回路とそれまでの会話を Gemini に渡し、部品表・3D・回路図・コード・組み立て工程を更新します。

- 「抵抗を470Ωにして」→「LEDの点滅を1秒間隔にして」のように繰り返し送信できます（Ctrl / ⌘ + Enter でも送信可）
- 「新しい回路」を選ぶと、次の送信で表示中の回路・会話を引き継がずに生成します
- 成功した修正ごとに、会話履歴を含むプロジェクトを新しいIDで保存します
- 生成失敗時は回路・履歴・入力を保持し、再試行できます
- 1回の入力は1〜2000文字、1つの会話は最大50往復です。日次生成上限は修正にも適用されます
- スマートフォンではチャットを回路の下に表示します

## データの保存と持ち運び

- 有効なセッションがあれば「セッションを開始」を再度押しても所有者IDを維持します
- Cookie は30日で失効します。ログインアカウント方式ではなく、別端末への引き継ぎ・期限後の復旧は未実装です
- 必要な回路は JSON ダウンロードも併用してください（会話履歴も含まれます）
- Firestore 保存失敗時はブラウザ保存（最新20件）へ切り替わる旨を明示します

## 本番形式でローカル起動

```bash
npm run build
npm start
```

Next.js standalone を起動します。`PORT` は既定3000です。

## 次のステップ

- [[Supported Hardware|Supported-Hardware]] — 使える基板と部品の一覧
- [[Deployment|Deployment]] — Docker / Cloud Run へのデプロイ
