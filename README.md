# breadberry

**想像を、つなごう。** アイデアから回路設計・部品表・3D組み立てガイドまでをつなぐ、日本語の電子工作ワークスペースです。

Next.js / TypeScript / Tailwind CSS / Three.js（React Three Fiber）/ Gemini API / GMI Cloud / Cloud Firestore。Fritzingの部品・回路・インスペクターという構成を参考にした、オリジナルのダッシュボードです。

![breadberry ワークスペース](docs/preview.jpg)

## できること

- 自然言語の要望と基板を入力し、Geminiの構造化JSON出力で回路・部品・配線・ファームウェアを生成
- GMI Cloudのモデルが電圧、配線、ピン番号、コードの整合性について補助レビュー
- 部品配置とジャンパ線をひとつずつ3Dで描画。再生、一時停止、工程移動、速度変更、回転、ズーム、真上表示、全画面
- 穴番号と端子名を記載した工程ガイド、回路接続図、コード表示
- 部品表CSV、回路JSON、Python/C++コードのダウンロード
- Firestoreへの自動保存とプロジェクトの再表示
- キーなしで使える温湿度計／LEDブリンクのサンプル。サンプルはブラウザ保存で、AI生成を装いません
- PC、タブレット、スマートフォン対応。指定フォントはローカル配信

3Dの形状をAIに自由に出力させるのではなく、**Geminiの回路ネットリストからあらかじめ定義した部品形状を決定的に配置**します。部品表・穴番号・3D・接続図・工程は同じデータを参照します。

## セットアップ

Node.js 24 と npm が必要です。

```bash
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開くと、そのままサンプルを操作できます。

AI生成とFirestore保存を有効にする場合：

```bash
cp .env.example .env.local
openssl rand -hex 32
```

出力した乱数を `SESSION_SECRET` に設定し、次の値を `.env.local` に記入します。**APIキーをブラウザ用の `NEXT_PUBLIC_` 変数に入れないでください。**

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
| `APP_ACCESS_TOKEN`       | 任意の共通アクセスコード。インターネット公開時は必須運用          |
| `APP_ORIGIN`             | リバースプロキシ使用時の実際のアクセス元URL。末尾 `/` なし        |
| `DAILY_GENERATION_LIMIT` | アプリ全体の1日生成上限。既定200                                  |
| `SESSION_DAILY_LIMIT`    | セッションごとの1日生成上限。既定20                               |

ローカルから本物のFirestoreを使う場合は、gcloud CLIでADCを設定します。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

ADCのユーザーにFirestoreの読み書き権限が必要です。環境変数設定後にサーバーを再起動し、画面右上の「接続設定」→「セッションを開始」を押してください。

### Firestoreエミュレーター

JavaとFirebase CLIがある環境では、別ターミナルで以下を実行できます。

```bash
firebase emulators:start --only firestore --project demo-breadberry
```

`.env.local` に `GOOGLE_CLOUD_PROJECT=demo-breadberry`、`FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` を設定します。Gemini/GMIは引き続き実APIです。通常のユニットテストはAPIをモックするため、料金は発生しません。

### 本番形式でローカル起動

```bash
npm run build
npm start
```

Next.js standaloneを起動します。`PORT` は既定3000です。

## Docker

Docker Compose v2.24以上を使用します。キーなしでもサンプルが動きます。

```bash
docker compose up --build
```

[http://localhost:8080](http://localhost:8080) を開きます。AIを使うときは `.env.example` を `.env` にコピーして設定してください。Docker内にホストのADCは自動で入りません。実FirestoreをローカルDockerから利用する場合：

```bash
export GOOGLE_ADC_FILE="$HOME/.config/gcloud/application_default_credentials.json"
docker compose -f compose.yaml -f compose.gcp.yaml up --build
```

ADCは読み取り専用マウントです。認証情報をイメージに含めません。Cloud RunではサービスアカウントのADCを自動使用するため、このマウントは不要です。

## Cloud Runにデプロイ

課金が有効なGoogle Cloudプロジェクト、gcloud CLI、デプロイ権限が必要です。以下は自分のプロジェクトで実行してください。

### 1. API・データベース・イメージ保管先

```bash
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export REGION=asia-northeast1

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com \
  --project "$GOOGLE_CLOUD_PROJECT"

gcloud artifacts repositories create breadberry --repository-format=docker \
  --location "$REGION" --project "$GOOGLE_CLOUD_PROJECT"

gcloud firestore databases create --database='(default)' --type=firestore-native \
  --location "$REGION" --project "$GOOGLE_CLOUD_PROJECT"
```

すでに存在するリポジトリ／データベースの作成は省略します。Firestoreのロケーションは作成後変更できません。既存の構成がある場合はそちらを利用してください。

### 2. 実行用サービスアカウント

```bash
gcloud iam service-accounts create breadberry-runtime --project "$GOOGLE_CLOUD_PROJECT"
export RUNTIME_SA="breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/datastore.user
```

Cloud Buildで使うビルド用サービスアカウントには、対象Artifact Registryへの書き込みとビルドログの書き込み権限が必要です。実行アカウントは組織設定により異なります。デプロイするユーザーにはCloud Runのデプロイ権限と `breadberry-runtime` に対するService Account User権限が必要です。

### 3. Secret Manager

次の4個のシークレットをGoogle Cloud Consoleで作成し、値を登録します。

- `breadberry-gemini-key`：Gemini APIキー
- `breadberry-gmi-key`：GMI Cloud APIキー
- `breadberry-session-secret`：`openssl rand -hex 32` で生成する値
- `breadberry-access-token`：アプリ利用者に渡す共通アクセスコード

各シークレットに実行アカウントの読み取り権限を付けます。

```bash
for SECRET in breadberry-gemini-key breadberry-gmi-key breadberry-session-secret breadberry-access-token; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project "$GOOGLE_CLOUD_PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor
done
```

### 4. ビルド・デプロイ

```bash
make deploy
```

`scripts/deploy.sh` がCloud BuildでDockerをビルドし、Cloud Runへデプロイします。東京リージョン、1GiBメモリ、最大3インスタンス、180秒タイムアウト、**IAMで保護された非公開サービス**が既定です。環境変数 `REGION` / `SERVICE` / `SERVICE_ACCOUNT` で変更できます。

`APP_ORIGIN` を指定して実行すると、そのURLを操作の送信元として許可します（末尾 `/` なし）。未指定の場合はCloud Runに設定済みの値を保持します。他の追加済み環境変数も再デプロイ時に保持します。

`make deploy` は `.env.local` を読み込みません。モデルを変更する場合は `GEMINI_MODEL=gemini-3.8-flash make deploy` のように環境変数で指定してください。Gemini 2.5 Flashはモデル一覧に表示されても、新規ユーザーの生成リクエストが404で拒否される場合があります。

非公開のまま自分で確認するには、まずlocalhostを許可してプロキシを起動します：

```bash
gcloud run services update breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --update-env-vars 'APP_ORIGIN=http://localhost:8080'

gcloud run services proxy breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" --port 8080
```

[http://localhost:8080](http://localhost:8080) を開きます。`127.0.0.1` や別のポートは異なる送信元として扱われるため、設定と同じURLを使ってください。

Cloud RunのURLでアクセスするときは、許可する送信元をそのURLに切り替えます：

```bash
export APP_ORIGIN="https://YOUR_SERVICE_URL"
gcloud run services update breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --update-env-vars "APP_ORIGIN=${APP_ORIGIN}"
```

現在の実装で許可する送信元は1つです。localhostと公開URLの両方を同時には指定できません。「この送信元からは操作できません。」という403は、セッション開始などの操作時にブラウザの送信元と許可URLが一致しない場合にアプリが返します。Cloud RunのIAM認証による `Error: Forbidden` とは別の設定です。

一般公開する場合は、アクセスコードを設定したうえでCloud RunのInvoker権限を運用に合わせて変更してください。公開URLに合わせて `APP_ORIGIN` を設定します。本格的な複数ユーザー運用にはFirebase Authentication等の認証を追加してください。

Firestoreのクライアント直接アクセスを禁止するルールと、生成回数カウンターの7日TTLを適用できます。

```bash
firebase deploy --only firestore --project "$GOOGLE_CLOUD_PROJECT"
```

このルールはデータベース全体のクライアントアクセスを禁止します。既存アプリとデータベースを共用する場合は、ルールを統合してから適用してください。サーバーSDKのアクセスはIAMで管理します。

## 対応範囲と設計

| 対象               | 対応内容                                                           |
| ------------------ | ------------------------------------------------------------------ |
| ESP32              | ESP32-WROOMの30ピンDevKit V1を想定。S3/C3や38ピン基板とは異なる    |
| Raspberry Pi Pico  | RP2040のPico。MicroPython                                          |
| Raspberry Pi 4 / 5 | 40ピンGPIOヘッダー。BCM番号と物理番号を区別。Linux上のPython       |
| 部品               | LED、抵抗、4ピンDHT22、2ピン押しボタン、4ピンBH1750モジュール、CdS |
| CdS                | ESP32 ADC1 / Pico ADCの分圧回路。Pi 4/5はADC非搭載のため対象外     |
| 規模               | 1枚の30列ブレッドボード、最大6部品・24ジャンパ線・3.3V             |

Pi 4/5はマイコンではなくLinux SBCです。ESP32/Picoとは生成コードの実行環境を分けています。DHT22サンプルは、Pico/ESP32ではMicroPythonの `dht`、Piでは `gpiozero` / `adafruit-circuitpython-dht` / `libgpiod` が必要です。Pi上のライブラリとOSの組み合わせによってDHT22のタイミング読み取りが不安定になる場合があります。実機で確認してください。

- 部品の各脚を独立した行に置きます。同じ行の `a–e` は導通、`f–j` は別ネットです。部品脚を `b`、ジャンパ線を `e/d/c/a` の空き穴に割り当てます。
- 基板はブレッドボードの外に置きます。基板端子へのジャンパ線は各1本まで、部品端子のネットは4本までです。
- 抵抗の脚は必要に応じて曲げて指定穴へ挿します。3Dモデルは説明用で、機械CADや実寸モデルではありません。
- AI応答はZodの型検査とネット検査を通します。未知ピン、NC接続、重複ID、未接続、端子短絡、3.3V–GND短絡、GPIOへの電源直結、LED抵抗欠如、DHT22プルアップ欠如などを拒否します。
- GMIは補助レビューです。失敗時は「未実施」として設計を保持します。電気的な動作シミュレーターや安全認証ではありません。
- 部品外形の干渉、全電流・熱設計、タイミング、生成ファームウェアの実機動作は検証しません。高電圧、モーター、リレー、未登録部品、大規模回路は対象外です。
- ジャンパ線は実物の端子に合わせてオス–オス／オス–メスを選んでください。USBケーブル等は基板付属品・作業環境として別途必要です。

## データとアクセス

- 保存先：`users/{signed-session-id}/projects/{uuid}`
- 利用回数：`quotas/global-YYYY-MM-DD` / `quotas/{session-id}-YYYY-MM-DD`
- HMAC署名付きHttpOnly Cookieで所有者を分離。Cookieは30日で失効します。ログインアカウント方式ではなく、別端末への引き継ぎ・期限後の復旧は未実装です。必要な回路はJSONもダウンロードしてください。
- 有効なセッションがあれば「セッションを開始」を再度押しても所有者IDを維持します。Cookieを削除・失効した場合は新しい所有者IDになります。
- 生成要求は全体・個別の上限をFirestoreトランザクションで消費します。失敗した要求も利用回数に含まれます。全体上限により、セッションを作り直しても無制限には生成できません。
- 生成後のFirestore保存失敗時はブラウザ保存へ切り替えて明示します。成功したと偽って表示しません。
- プロンプトと回路情報はGemini/GMIに送信されます。APIキーはサーバーからのみ使用します。

## テスト

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

ユニットテスト：基板別のサンプル、穴の一意性、部品表の数量、危険な接続の拒否、モックによるGemini/GMIリクエスト。
Playwright：PCとモバイルで3D起動、工程移動、再生、タブ切替、エクスポート、保存と再表示、エラー表示、APIの未認証拒否、横はみ出し。
GitHub Actionsでも実行します。APIキー・Google Cloudプロジェクトがない環境では、実API・実Firestore・Cloud Runへのデプロイの確認は別途必要です。

## 主なファイル

- `src/components/studio.tsx`：ワークスペースと各操作
- `src/components/board-scene.tsx`：部品・基板・ジャンパ線の3D描画とアニメーション
- `src/components/schematic.tsx`：ネットリストの接続図
- `src/lib/circuit.ts`：共通スキーマ、ピン表、配置、部品表、接続検査
- `src/lib/ai.ts`：Gemini生成とGMI補助レビュー
- `src/lib/server.ts`：セッション、Firestore、利用回数制限
- `src/app/api/`：生成・保存データ取得・接続状態・ヘルスチェック
- `Dockerfile` / `scripts/deploy.sh`：Docker・Cloud Run起動

## 参照資料

- [Gemini 構造化出力](https://ai.google.dev/gemini-api/docs/structured-output) / [generateContent API](https://ai.google.dev/api/generate-content)
- [GMI Cloud Quick Start](https://docs.gmicloud.ai/quickstart)
- [Cloud Runへのコンテナデプロイ](https://cloud.google.com/run/docs/deploying)
- [ESP32 GPIO仕様](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)
- [Pico基板仕様](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html)
- [Raspberry Pi GPIO](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio)
- [Fritzing Learning](https://fritzing.org/learning/)
