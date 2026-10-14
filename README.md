# breadberry

**想像を、つなごう。** アイデアから回路設計・部品表・3D組み立てガイドまでをつなぐ、日本語の電子工作ワークスペースです。

Next.js / TypeScript / Tailwind CSS / Three.js（React Three Fiber）/ Gemini API / GMI Cloud / Cloud Firestore。Fritzingの部品・回路・インスペクターという構成を参考にした、オリジナルのダッシュボードです。

**公開デモ：** [https://breadberry.ponnlog.com/](https://breadberry.ponnlog.com/)（Cloud Armor経由・認証不要）。従来のrun.app URLは無効です。[公開入口の設定](docs/cloud-armor.md)

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

## ハッカソン向けエージェント機能

- 生成した回路が接続検査に失敗すると、検査エラーをGeminiへ返して自動再生成します。補助レビューが `FIX:` で具体的な不備を報告した場合も再生成します。最大試行回数は `AGENT_MAX_ATTEMPTS`（既定3、最大3）です。修復不可能な設計は保存しません。
- 各試行の生成・検査・レビュー・再試行・完了を、Cloud Loggingで収集できる構造化JSONとして標準出力へ記録します。レスポンスにも `agentEvents` と `traceId` を含め、画面の「エージェントが行ったこと」から確認できます。秘密鍵・生のプロンプトはログに記録しません。
- 生成APIの利用回数は既存のFirestoreトランザクションによりアプリ全体・署名済みセッション別に日次制限します。再試行は各生成要求内で最大3回に制限されます。匿名セッションは本人認証と同等ではありません。
- 購入候補の外部URLは既存の `storeProductUrl` でHTTPS・販売店ドメイン・商品詳細パスを制限します。GMIレビュアーの接続先は `AI_PROVIDER_ALLOWED_HOSTS`（既定 `api.gmi-serving.com`）に列挙したホストのみ許可します。外部のURL Context機能に渡すURLは、販売店URL検証を通過したものだけです。

## LEDの色別3Dモデル

緑・赤・青・黄・白・オレンジ・紫・ピンクの8種類のglTFモデルを用意しています。Editorの「LEDの色別3Dモデル」でプレビューを選び、「パーツを追加」で配置できます。配置後は「LEDの色」で変更でき、部品一覧・接続図にも同じ色が反映されます。

モデルは `public/models/led/led-{color}.gltf` に保存しています。レンズ・台座・長短の脚を含む自己完結したファイルで、モデルの再生成は `node --import tsx scripts/generate-led-models.ts` で行えます。

![8色のLEDモデルの3Dプレビュー](docs/led-models.png)

## チャットで回路を修正する

画面右側の「回路設計チャット」に変更内容を入力して「回路を修正」を押します。表示中の回路と、それまでの会話をGeminiに渡し、部品表・3D・回路図・コード・組み立て工程を更新します。サンプルや以前の保存データからも修正を始められます。

- 「抵抗を470Ωにして」→「LEDの点滅を1秒間隔にして」のように繰り返し送信できます。Ctrl / ⌘ + Enterでも送信できます。
- 「新しい回路」を選ぶと、次の送信で表示中の回路・会話を引き継がずに生成します。
- 成功した修正ごとに、会話履歴を含むプロジェクトを新しいIDで保存します。「プロジェクト」から開くと、その時点の回路と履歴を復元します。古いプロジェクトの履歴は空として扱います。
- 生成失敗時は回路・履歴・入力を保持し、再試行できます。生成中の二重送信や回路の切り替えを防止します。
- Firestore保存失敗時はブラウザ保存へ切り替えます。ブラウザ保存は従来どおり最新20件までです。JSONエクスポートにも会話履歴を含みます。
- 1回の入力は1〜2000文字、1つの会話は最大50往復です。既存の日次生成上限は修正にも適用されます。スマートフォンではチャットを回路の下に表示します。

`POST /api/generate` は従来の `{ prompt, board }` に加え、任意の `context: { circuit, messages }` を受け取ります。`messages` は `{ role: "user" | "assistant", content: string }` の配列です。入力サイズ・会話・修正元の回路を検査し、生成結果も従来の接続検査を通してから保存します。応答の `messages` に今回の依頼と生成された回路の説明を追加します。

## システム構成

### システム構成図

![breadberry システム構成図](docs/architecture.png)

ブラウザからの要求はCloud Run上のNext.jsが受け、回路設計エージェントがGemini APIで回路を生成します。接続検査とGMI Cloudの補助レビューで不備が見つかると、指摘を付けて再生成し（最大3回）、合格した設計をCloud Firestoreへ保存します。入力と生成結果はModel Armorで検査し、各工程はCloud TraceとCloud Loggingに記録します。部品の購入提案ではDigiKey APIとGeminiのGoogle検索・URLコンテキストを使います。APIキーと署名キーはSecret Managerから渡します。

### コンポーネント図

![breadberry コンポーネント図](docs/components.png)

ブラウザのReactコンポーネント、Cloud Run上のAPIルートとサーバーライブラリ、両者が共有する回路ドメインのロジックに分かれます。サーバーライブラリの上段は回路生成の制御（`agent.ts`）・安全性検査（`model-armor.ts`）・可観測性（`tracing.ts`）、下段は外部サービスの呼び出しと共通基盤です。部品表・3D・接続図・工程は、共有ドメインの同じ回路ネットリストから導出します。

### 処理シーケンス図

![breadberry 処理シーケンス図](docs/sequence.png)

回路の生成・修正と、部品の購入提案の流れです。生成中は、エージェントの進行をNDJSONでブラウザへ逐次送信します。補助レビューを取得できなかった場合は「未実施」として設計を保持し、処理を続けます。Model Armorに接続できない場合も、検査を省略して処理を続けます。

図は `scripts/generate-diagrams.mjs` で生成しています。内容を変更したらスクリプトを編集し、`npm run diagrams` で `docs/` のSVGとPNGを再生成します（PNGの描画にPlaywrightのChromiumを使うため、初回は `npx playwright install chromium` が必要です）。アイコンは `docs/icons/` にあります。詳細は [Architecture](wiki/Architecture.md) を参照してください。

## 品質・運用・拡張性

| 観点 | 実装 |
| --- | --- |
| テスト | ユニットテスト17ファイル・146件（`tests/unit/`）と、PlaywrightのE2Eテスト8ファイル（`tests/`）。GitHub Actionsでpushとプルリクエストのたびに型検査・ユニットテスト・ビルド・E2Eを実行 |
| デプロイ | `main` へのPRマージでCloud Runへ自動デプロイ。GitHub OIDCとWorkload Identity Federationで短時間の認証情報を発行し、サービスアカウント鍵を作成しない |
| 秘密情報 | APIキーと署名キーはSecret ManagerからCloud Runの実行時環境変数へ渡す。リポジトリ・イメージ・ビルド時の環境変数には含めない |
| AIの安全対策 | Model Armorで、利用者の入力（プロンプトインジェクション・ジェイルブレイク）とGeminiの生成結果を検査し、検出時は拒否。Model Armorに接続できない場合は検査を省略して処理を続け、型検査と接続検査は常に実行 |
| 可観測性 | OpenTelemetryで、安全性検査・Gemini呼び出し（トークン数を含む）・接続検査・補助レビューを1件の生成要求ごとにCloud Traceへ記録。検査の検出・失敗はCloud LoggingへJSONで記録し、トレースと相互に辿れる |
| 利用量の制御 | 生成・部品検索の回数を、全体とセッションごとの日次上限で制限。Firestoreトランザクションで計数するため、複数インスタンスでも上限を超えない |
| 費用の抑制 | Cloud Runは最小0・最大3インスタンスで、アクセスがない間はインスタンスを起動しない。生成モデルは既定でGemini Flash（`GEMINI_MODEL` で変更可） |

**拡張性：** 部品は `src/lib/circuit.ts` の `catalog` に1件追加すれば、Geminiへ渡すカタログと出力スキーマ、型検査と共通の接続検査、配置、部品表、接続図、3D（汎用形状）が対応します。これらが同じカタログと回路ネットリストを参照するためです。部品固有の3D形状と検査ルールは必要に応じて追加します。手順は [Development](wiki/Development.md) を参照してください。

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
| `GMI_MODEL`              | 既定 `Qwen/Qwen3.8-Flash`                                        |
| `GMI_BASE_URL`           | 既定 `https://api.gmi-serving.com/v1`。HTTPSのみ                  |
| `GOOGLE_CLOUD_PROJECT`   | Firestoreを作成したGoogle CloudプロジェクトID                     |
| `FIRESTORE_DATABASE_ID`  | 既定 `(default)`                                                  |
| `SESSION_SECRET`         | 32文字以上のランダムな署名キー                                    |
| `APP_ORIGIN`             | リバースプロキシ使用時の実際のアクセス元URL。末尾 `/` なし        |
| `DAILY_GENERATION_LIMIT` | アプリ全体の1日生成上限。既定200                                  |
| `SESSION_DAILY_LIMIT`    | セッションごとの1日生成上限。既定20                               |
| `MODEL_ARMOR_TEMPLATE` | 任意。Model ArmorのテンプレートID。設定すると入力と生成結果を検査する |
| `MODEL_ARMOR_LOCATION` | 任意。テンプレートのリージョン。既定 `asia-northeast1` |
| `MODEL_ARMOR_MODE` | 任意。`block`（既定）は検出時に拒否、`inspect` は記録のみ |
| `CLOUD_TRACE` | 任意。`true` で生成の各工程をCloud Traceへ送信する。Cloud Runへのデプロイでは既定で `true` |
| `AGENT_MAX_ATTEMPTS` | 自己修復の最大試行回数。既定3、最大3 |
| `AI_PROVIDER_ALLOWED_HOSTS` | 補助レビュアーの許可ホスト（カンマ区切り）。既定 api.gmi-serving.com |

### ローカルでGeminiを使う

`.env.local` に `GEMINI_API_KEY` と `SESSION_SECRET` を設定してローカルサーバーを起動すると、Gemini APIをサーバー側から呼び出します。APIキーはブラウザへ送信されません。ローカル・Cloud Runともにアクセスコードの入力は不要で、セッションは自動開始します。旧設定の `APP_ACCESS_TOKEN` が残っていてもアクセスコードは要求しません。

ローカルから本物のFirestoreを使う場合は、gcloud CLIでADCを設定します。

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

ADCのユーザーにFirestoreの読み書き権限が必要です。環境変数設定後にサーバーを再起動し、画面を再読み込みしてください。セッションは自動開始します。

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

公開入口は **HTTPSロードバランサー + Cloud Armor + serverless NEG** です。Cloud ArmorのSQLi/XSS検査とAPIレート制限はデプロイ時に常に有効、Cloud Runの直接公開URLは無効になります。初回はDNSと証明書の準備が必要です。[Cloud Armor導入手順](docs/cloud-armor.md)のCompute API・追加IAM・ドメイン設定を先に確認してください。

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

Cloud Buildで使うビルド用サービスアカウントには、対象Artifact Registryへの書き込みとビルドログの書き込み権限が必要です。実行アカウントは組織設定により異なります。デプロイするユーザーにはCloud Runのデプロイ権限、対象Artifact Registryリポジトリへの `roles/artifactregistry.reader`、`breadberry-runtime` に対するService Account User権限が必要です。

### 3. Secret Manager

デプロイ前に、次の5個のシークレットをGoogle Cloud Consoleで作成し、値を登録します。

- `breadberry-gemini-key`：Gemini APIキー
- `breadberry-gmi-key`：GMI Cloud APIキー
- `breadberry-session-secret`：`openssl rand -hex 32` で生成する値
- `breadberry-digikey-client-id`：DigiKey Production AppのClient ID
- `breadberry-digikey-client-secret`：DigiKey Production AppのClient Secret

各シークレットに実行アカウントの読み取り権限を付けます。

```bash
for SECRET in breadberry-gemini-key breadberry-gmi-key breadberry-session-secret breadberry-digikey-client-id breadberry-digikey-client-secret; do
  gcloud secrets add-iam-policy-binding "$SECRET" --project "$GOOGLE_CLOUD_PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor
done
```

### Model ArmorとCloud Trace

Model Armorは未設定なら無効で、従来どおり動作します。Cloud Traceはデプロイ時に既定で有効です。

**Model Armor：** テンプレートを作成し、実行アカウントに利用権限を付けます。

```bash
gcloud services enable modelarmor.googleapis.com --project "$GOOGLE_CLOUD_PROJECT"
gcloud config set api_endpoint_overrides/modelarmor "https://modelarmor.asia-northeast1.rep.googleapis.com/"
gcloud model-armor templates create breadberry --project "$GOOGLE_CLOUD_PROJECT" --location asia-northeast1 \
  --pi-and-jailbreak-filter-settings-enforcement=enabled \
  --pi-and-jailbreak-filter-settings-confidence-level=medium-and-above
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/modelarmor.user
```

東京リージョンは悪意のあるURLのフィルターに対応していないため、指定しません。

`MODEL_ARMOR_TEMPLATE=breadberry make deploy` で有効になります。誤検出を確認する間は `MODEL_ARMOR_MODE=inspect` を指定すると、検出を記録するだけで拒否しません。

**Cloud Trace：** 実行アカウントにトレースの書き込み権限を付けます。APIキーは不要です。

```bash
gcloud services enable telemetry.googleapis.com cloudtrace.googleapis.com --project "$GOOGLE_CLOUD_PROJECT"
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/telemetry.tracesWriter
```

生成のたびに、Cloud ConsoleのTrace エクスプローラーに `Circuit design request` のトレースが記録されます。権限がない場合も生成は続行し、`cloud_trace_export_failed` の警告だけをログに出します。`CLOUD_TRACE=false make deploy` で無効にできます。

GitHub Actionsでデプロイする場合は、リポジトリ変数 `MODEL_ARMOR_TEMPLATE` / `MODEL_ARMOR_LOCATION` / `MODEL_ARMOR_MODE` / `CLOUD_TRACE` に同じ値を設定します。未設定のModel Armorは無効、Cloud Traceは有効としてデプロイします。

### 4. ビルド・デプロイ

```bash
export CLOUD_ARMOR_DOMAIN=breadberry.example.com
make deploy
```

`scripts/deploy.sh` がCloud BuildでDockerをビルドし、Cloud Runへデプロイします。東京リージョン、1GiBメモリ、最大3インスタンス、240秒タイムアウト、**認証なしでアクセスできる公開サービス**が既定です。環境変数 `REGION` / `SERVICE` / `SERVICE_ACCOUNT` で変更できます。公開LBでは `ALLOW_UNAUTHENTICATED=true` が必要です。入口はingress制限とCloud Armorで保護します。

`APP_ORIGIN` を指定して実行すると、そのURLを操作の送信元として許可します（末尾 `/` なし）。未指定の場合は `https://${CLOUD_ARMOR_DOMAIN}` を設定し、異なる値は拒否します。他の追加済み環境変数も再デプロイ時に保持します。

`scripts/deploy.sh` はDigiKeyを含む上記5個のシークレットを `--update-secrets` でCloud Runの実行時環境変数に自動登録します。各シークレットの参照は `latest` に更新し、それ以外の追加シークレット参照は保持します。DigiKeyの2個もデプロイ前に作成・権限付与が必要です。`DIGIKEY_SANDBOX` は既定で `false` を登録します。旧 `APP_ACCESS_TOKEN` のシークレット参照はデプロイ時に解除します。Secret Managerのシークレット自体は削除しません。Cloud RunのIAMアクセス制御（公開・非公開）は `ALLOW_UNAUTHENTICATED` の指定に従って毎回設定します。

`CLOUD_ARMOR_DOMAIN` を設定すれば、`APP_ORIGIN` は公開HTTPSドメインに自動設定されます。毎回 `gcloud run services update --update-env-vars APP_ORIGIN=...` を実行する必要はありません。URLを変更する場合や、localhost用の設定から戻す場合にだけ更新してください。

`make deploy` は `.env.local` を読み込みません。モデルを変更する場合は `GEMINI_MODEL=gemini-3.8-flash make deploy` のように環境変数で指定してください。Gemini 2.5 Flashはモデル一覧に表示されても、新規ユーザーの生成リクエストが404で拒否される場合があります。

### GitHub ActionsでPRマージ時にデプロイ

`.github/workflows/deploy.yml` は、`main` 向けPRがマージされたときだけ `make deploy` を実行します。GitHub Actions用のサービスアカウント鍵は作成せず、GitHub OIDCとWorkload Identity Federation（WIF）で短時間の認証情報を発行します。

初回だけ、デプロイ用サービスアカウントとWIFプロバイダを設定します。`YOUR_PROJECT_ID` と `YOUR_GITHUB_OWNER` はそれぞれ置き換えてください。

```bash
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export GITHUB_OWNER=YOUR_GITHUB_OWNER
export GITHUB_REPOSITORY=breadberry
export DEPLOY_SA=breadberry-github-deploy

gcloud iam service-accounts create "$DEPLOY_SA" --project "$GOOGLE_CLOUD_PROJECT"
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.editor
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.admin
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY:-breadberry}" \
  --project "$GOOGLE_CLOUD_PROJECT" --location "${REGION:-asia-northeast1}" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/artifactregistry.reader --condition=None
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/serviceusage.serviceUsageConsumer
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/storage.bucketViewer
gcloud storage buckets add-iam-policy-binding "gs://${GOOGLE_CLOUD_PROJECT}_cloudbuild" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/storage.legacyBucketWriter
gcloud storage buckets add-iam-policy-binding "gs://${GOOGLE_CLOUD_PROJECT}_cloudbuild" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/storage.objectAdmin
gcloud iam service-accounts add-iam-policy-binding \
  "breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

# Cloud Build の実行アカウントを使用する権限（Cloud Run 実行用とは別）
BUILD_SA="$(gcloud builds get-default-service-account --project "$GOOGLE_CLOUD_PROJECT")"
gcloud iam service-accounts add-iam-policy-binding "$BUILD_SA" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser --condition=None

gcloud iam workload-identity-pools create github --location=global \
  --display-name="GitHub Actions" --project "$GOOGLE_CLOUD_PROJECT"
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --display-name="GitHub Actions" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${GITHUB_OWNER}/${GITHUB_REPOSITORY}'" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --project "$GOOGLE_CLOUD_PROJECT"

export PROJECT_NUMBER="$(gcloud projects describe "$GOOGLE_CLOUD_PROJECT" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding \
  "${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPOSITORY}"
```

`gcloud builds submit` は、既定のソース保存バケットが対象プロジェクトに属することをバケット一覧で確認します。そのため、バケット単位の書き込み権限に加えて、プロジェクト単位で `storage.buckets.list` を含む `roles/storage.bucketViewer` が必要です。`The user is forbidden from accessing the bucket` が出る場合は、`serviceusage.serviceUsageConsumer` だけでなく、このロールもデプロイ用サービスアカウントに付いているか確認してください。ロールの権限は [Cloud Storage の公式ドキュメント](https://docs.cloud.google.com/storage/docs/access-control/iam-roles) を参照してください。

ビルド後の `gcloud run deploy` で `artifactregistry.repositories.downloadArtifacts` が拒否される場合は、エラーに表示されたデプロイ用サービスアカウントに、対象リポジトリの `roles/artifactregistry.reader` が付いているか確認してください。Cloud Build実行アカウントの書き込み権限とは別に必要です。上記の `gcloud artifacts repositories add-iam-policy-binding` を、対象リポジトリのIAMポリシーを変更できる管理者として実行し、GitHub Actionsの失敗したジョブを再実行してください。`REGION` / `REPOSITORY` は、GitHub Actionsの `GCP_REGION` / `ARTIFACT_REPOSITORY` と同じ値にします。詳細は [Cloud Runのデプロイに必要なロール](https://docs.cloud.google.com/run/docs/deploying#required_roles) を参照してください。

`caller does not have permission to act as service account` が出る場合は、デプロイ用アカウントに **Cloud Build 実行アカウントに対する** `roles/iam.serviceAccountUser` が不足しています。`roles/cloudbuild.builds.editor` や Cloud Run 実行用アカウントへの権限付与だけでは足りません。上記の `BUILD_SA` の取得と権限付与を、対象サービスアカウントの IAM ポリシーを変更できる管理者として実行し、GitHub Actions の失敗したジョブを再実行してください。プロジェクト全体への Service Account User 付与は不要です。

`scripts/deploy.sh` は Cloud Build の既定アカウントを使用します。既定値はプロジェクト設定によって異なるため、メールアドレスを推測せず `gcloud builds get-default-service-account` で確認します。旧 Cloud Build アカウント（`PROJECT_NUMBER@cloudbuild.gserviceaccount.com`）の場合は、このアカウントへの IAM バインディングを追加できず、上記の Cloud Build 用権限付与は不要です。詳細は [Cloud Build の既定サービスアカウント変更](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates) を参照してください。

GitHubリポジトリの **Settings > Secrets and variables > Actions > Variables** に次を設定します。Cloud Run実行用の秘密値は従来どおりSecret Managerを参照するため、GitHubには登録しません。

| 変数                                        | 値                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT`                      | Google CloudプロジェクトID                                                               |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`            | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT`                | `breadberry-github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com`                       |
| `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT`         | `breadberry-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com`                             |
| `CLOUD_ARMOR_DOMAIN` | 必須。公開HTTPSホスト名（例 `breadberry.example.com`） |
| `EDGE_NAME` | 任意。専用LB・Cloud Armorリソース名（既定 `${SERVICE}-edge`） |
| `GCP_REGION`                                | 任意。未指定時は `asia-northeast1`                                                       |
| `CLOUD_RUN_SERVICE`                         | 任意。未指定時は `breadberry`                                                            |
| `ARTIFACT_REPOSITORY`                       | 任意。未指定時は `breadberry`                                                            |
| `GEMINI_MODEL` / `GMI_MODEL` / `APP_ORIGIN` | 任意。ローカルの同名環境変数と同じ用途                                                   |

`production` Environmentを作成して承認者を設定すると、マージ後のデプロイ前にGitHub上で承認を必須にできます。Cloud Build実行用サービスアカウントには、従来どおりArtifact Registryへの書き込み権限が必要です。

公開デモは [https://breadberry.ponnlog.com/](https://breadberry.ponnlog.com/) です。独自ドメインを変更した場合は、`CLOUD_ARMOR_DOMAIN` に対応するURLを開いてください。`APP_ORIGIN` はこのURLに自動設定されます。旧run.app URLは利用できません。DNS・証明書・WAFの動作確認は[導入手順](docs/cloud-armor.md#導入後の確認)を参照してください。

現在の実装で許可する送信元は1つです。localhostと公開URLの両方を同時には指定できません。「この送信元からは操作できません。」という403は、セッション開始などの操作時にブラウザの送信元と許可URLが一致しない場合にアプリが返します。Cloud RunのIAM認証による `Error: Forbidden` とは別の設定です。

公開サービスでは誰でもアクセスできるため、生成回数の全体上限・個別上限で利用量を制限しています。本格的な複数ユーザー運用にはFirebase Authentication等の認証を追加してください。

Firestoreのクライアント直接アクセスを禁止するルールと、生成回数カウンターの7日TTLを適用できます。

```bash
firebase deploy --only firestore --project "$GOOGLE_CLOUD_PROJECT"
```

このルールはデータベース全体のクライアントアクセスを禁止します。既存アプリとデータベースを共用する場合は、ルールを統合してから適用してください。サーバーSDKのアクセスはIAMで管理します。

## 対応範囲と設計

| 対象               | 対応内容                                                              |
| ------------------ | --------------------------------------------------------------------- |
| ESP32              | ESP32-WROOMの30ピンDevKit V1を想定。S3/C3や38ピン基板とは異なる    |
| Raspberry Pi Pico  | RP2040のPico。MicroPython                                            |
| Raspberry Pi 4 / 5 | 40ピンGPIOヘッダー。BCM番号と物理番号を区別。Linux上のPython       |
| 部品               | LED、抵抗、DHT22、押しボタン、BH1750、CdS、下表の追加9種類、74HCロジックIC 8種類・コンデンサ・4連DIPスイッチ（計25種類） |
| アナログ部品       | CdS・NTC・可変抵抗はESP32 ADC1 / Pico ADCを使用。Pi 4/5はADC非搭載のため対象外 |
| 規模               | 30列ブレッドボードを最大6枚、最大48部品・240ジャンパ線・3.3V。配置を省略した小規模回路（6部品まで）は1枚に自動配置 |

### 追加したセンサー・部品

入力欄の「対応するセンサー・部品」から部品名を選べます。選択した基板で使えないADC部品は無効になります。「サンプル」にはAPIキー不要のDS18B20温度計とOLED表示を追加しました。

| kind | 部品 | 接続と条件 |
| --- | --- | --- |
| `bme280` | 温湿度・気圧 | 3.3V I2C変換基板、アドレス0x76 |
| `bmp280` | 温度・気圧 | 3.3V I2C変換基板、アドレス0x76。湿度測定なし |
| `sht31` | 温湿度 | 3.3V I2C変換基板、アドレス0x44 |
| `ssd1306` | OLED表示 | 128×64、3.3V I2C、0x3C、リセット回路内蔵の4端子版 |
| `ds18b20` | 温度 | TO-92、外部3.3V給電、DQに4.7kΩプルアップ |
| `potentiometer` | 可変抵抗 | 10kΩ、両端を3.3V/GND、摺動端子をADCへ |
| `ntc` | サーミスタ | 25℃で10kΩ、10kΩ固定抵抗と分圧。B定数は実物に合わせる |
| `reed` | 磁気スイッチ | 常開・2端子の無電圧接点、内部プルアップGPIOとGND |
| `tilt` | 傾斜スイッチ | ボール式・2端子の無電圧接点、内部プルアップGPIOとGND |

I2C部品は**3.3V対応・プルアップ内蔵・上表のアドレスに設定したモジュール**を対象とします。図のVCC/GND/SCL/SDAは接続用の端子名であり、製品の物理的なピン順を保証しません。実物の印字で対応を確認し、端子順が異なる場合はジャンパ線で引き出してください。裸のIC、SPI版、追加の制御端子が必要な基板は対象外です。アドレスを変更した基板には現時点で対応しません。

同じI2CバスのSDA/SCLは部品端子の空き穴を経由して分岐します。BME280＋OLEDは使用可能です。BME280＋BMP280など同一アドレスの組み合わせは同一バスで拒否します。ESP32/Picoは任意の双方向GPIOをSoftI2Cで使用、PiはI2C1（SDA=GPIO2、SCL=GPIO3）です。

DS18B20サンプルはMicroPythonの`onewire` / `ds18x20`、PiではLinuxの`w1-gpio` / `w1-therm`を使います。OLEDサンプルはMicroPython用`ssd1306.py`、PiではAdafruit Blinkaと`adafruit-circuitpython-ssd1306`が必要です。設定手順は各サンプルの注意事項に表示します。実機上のセンサー値やOLED画面を3D内でシミュレーションする機能はありません。

Pi 4/5はマイコンではなくLinux SBCです。ESP32/Picoとは生成コードの実行環境を分けています。DHT22サンプルは、Pico/ESP32ではMicroPythonの `dht`、Piでは `gpiozero` / `adafruit-circuitpython-dht` / `libgpiod` が必要です。Pi上のライブラリとOSの組み合わせによってDHT22のタイミング読み取りが不安定になる場合があります。実機で確認してください。

- 部品の各脚を独立した行に置きます。同じ行の `a–e` は導通、`f–j` は別ネットです。部品脚を `b`、ジャンパ線を `e/d/c/a` の空き穴に割り当てます。
- 基板はブレッドボードの外に置きます。基板端子へのジャンパ線は各1本まで、部品端子のネットは4本までです。
- 抵抗の脚は必要に応じて曲げて指定穴へ挿します。3Dモデルは説明用で、機械CADや実寸モデルではありません。
- AI応答はZodの型検査とネット検査を通します。未知ピン、NC接続、重複ID、未接続、端子短絡、3.3V–GND短絡、GPIOへの電源直結、LED抵抗欠如、DHT22/DS18B20プルアップ欠如、ADC以外へのアナログ接続、I2Cアドレス重複などを拒否します。
- GMIは補助レビューです。失敗時は「未実施」として設計を保持します。電気的な動作シミュレーターや安全認証ではありません。
- 既定の `Qwen/Qwen3.8-Flash` は推論を有効にしたまま `thinking_budget: 512` で制限し、補助レビューには20秒の期限を設けます。別モデルにはこの指定を送りません。基板と使用部品の仕様も渡し、推測による誤指摘を減らします。最大3回の生成・レビューに備え、生成APIとCloud Runの期限は240秒です。取得失敗は成功扱いにせず、サーバーログの `gmi_review_failed` にモデル名・失敗段階・所要時間・HTTPステータスを記録します。APIキーや応答本文は記録しません。
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
- Model Armorを有効にすると、プロンプトと生成結果の文章（題名・説明・注意事項・コード）をModel Armorへ送信します。
- Cloud Traceを有効にすると、プロンプト、会話、回路、Geminiの応答、検査結果を同じGoogle CloudプロジェクトのCloud Traceに保存します（各2万文字まで）。APIキーとセッションIDは保存しません。

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
- `src/components/schematic.tsx`：CAD風の回路図（抵抗・LED・コンデンサ・スイッチなどの記号、直角配線、端子名、配線選択、拡大縮小、SVG出力）
- `src/lib/circuit.ts`：共通スキーマ、ピン表、配置、部品表、接続検査
- `src/lib/agent.ts`：生成・検査・レビューを繰り返す回路設計エージェント
- `src/lib/ai.ts`：Gemini生成とGMI補助レビュー
- `src/lib/server.ts`：セッション、Firestore、利用回数制限
- `src/lib/model-armor.ts`：Model Armorによる入力・生成結果の検査
- `src/lib/tracing.ts`：Cloud Traceへのトレース（OpenTelemetry）と構造化ログ
- `src/app/api/`：生成・保存データ取得・接続状態・ヘルスチェック
- `Dockerfile` / `scripts/deploy.sh`：Docker・Cloud Run起動

## Wiki

詳細なドキュメントは `wiki/` ディレクトリにあります。GitHub の Wiki タブにそのまま転載できます。

- [Home](wiki/Home.md)：概要と機能
- [Getting Started](wiki/Getting-Started.md)：セットアップと使い方
- [Supported Hardware](wiki/Supported-Hardware.md)：対応基板・部品・制約
- [Architecture](wiki/Architecture.md)：システム構成・API・データ構造
- [Deployment](wiki/Deployment.md)：Docker / Cloud Run / GitHub Actions
- [Development](wiki/Development.md)：開発・テスト・プロジェクト構成

## 参照資料

- [Gemini 構造化出力](https://ai.google.dev/gemini-api/docs/structured-output) / [generateContent API](https://ai.google.dev/api/generate-content)
- [GMI Cloud Quick Start](https://docs.gmicloud.ai/quickstart)
- [Cloud Runへのコンテナデプロイ](https://cloud.google.com/run/docs/deploying)
- [ESP32 GPIO仕様](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html)
- [Pico基板仕様](https://www.raspberrypi.com/documentation/microcontrollers/pico-series.html)
- [Raspberry Pi GPIO](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio)
- [Fritzing Learning](https://fritzing.org/learning/)

### 追加部品の参照資料

- [DS18B20データシート（Analog Devices）](https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf)：電源、端子、1-Wireプルアップ。
- [BME280の配線](https://learn.adafruit.com/adafruit-bme280-humidity-barometric-pressure-temperature-sensor-breakout/pinouts)、[BMP280の配線](https://learn.adafruit.com/adafruit-bmp280-barometric-pressure-plus-temperature-sensor-breakout/pinouts)、[SHT31の配線](https://learn.adafruit.com/adafruit-sht31-d-temperature-and-humidity-sensor-breakout/pinouts)：電源・I2C信号の参考。Adafruit基板の外形・端子配列を3Dモデルで再現するものではありません。
- [MicroPythonの1-Wire](https://docs.micropython.org/en/latest/esp8266/tutorial/onewire.html)、[SSD1306ドライバ](https://docs.micropython.org/en/latest/esp8266/tutorial/ssd1306.html)：サンプルコードのAPI・ドライバ。


## Viewer / Editor とレイアウトチェック

ワークスペース上部の **Viewer · 閲覧** / **Editor · 編集** で切り替えます。

- Viewer: 3D表示、回路図、コード、組み立てアニメーションを確認できます。
- Editor: カタログの全25種類から部品を追加し、3Dモデルそのものをクリックして選択し、ドラッグして移動できます。ドラッグ中は部品と配線が追従し、離した位置で確定します。空いている穴のクリック、または「配置する穴」の選択でも移動できます。配置は穴にスナップし、先頭ピンを基準にします。「向きを反転」でピンの並びを反転できます。「真上から編集」で視点を切り替え、背景ドラッグで回転、スクロールでズームします。部品をドラッグしている間は視点を固定します。Esc・画面外へのドロップで移動をキャンセルできます。電源レールとマイコン本体は配置対象外です。
- 値・仕様の変更、部品の削除、配線の追加・削除、元に戻す／やり直すに対応します。部品削除時には接続された配線も削除します。
- 「レイアウトチェック」で同じ穴の使用、モデル本体の重なり、範囲外、異なるネットの導通列共有、ジャンパ用の空き穴不足を表示します。チェック後は編集に合わせて結果が更新されます。a–eとf–jの同じ番号の穴は、それぞれ内部で導通するものとして扱います。
- 配置は3D、配線の挿し穴、組み立て手順、JSONにも反映されます。手動配置データがない従来の回路は以前の配置を維持します。
- 手動編集・自動回路検査・AI生成は最大48部品・240配線・6枚のブレッドボードに対応します。途中状態も保存できます。
- 「保存」は接続済みならFirestoreへ、未接続またはクラウド保存失敗時はブラウザへ保存します。配置・未接続部品・会話履歴を含めてプロジェクト一覧から再開できます。最初の手動編集では元のプロジェクトとは別のIDになります。

レイアウトチェックは表示モデルと導通列に基づく簡易検査です。実部品の寸法、公差、定格や回路の動作を保証しません。手動編集ではファームウェアを自動更新せず、以前の補助レビューは無効化します。AIへの修正依頼には編集途中の回路も渡せますが、生成結果には従来の電気的検査を適用します。


## 複数ブレッドボードと1bit CPU

Editorの「ブレッドボードを追加」で最大6枚を設置できます。「配置先のブレッドボード」で部品を移動するか、3Dモデルを別のボードへドラッグしてください。ボード間の配線・組み立て工程・回路JSON・保存と再読込・購入リストの必要枚数が同じデータを参照します。空の追加ボードは削除できます。BB1と、部品または配線のあるボードは削除できません。追加・移動・削除は元に戻す／やり直すにも対応します。

74HC00（NAND）、74HC08（AND）、74HC32（OR）、74HC86（XOR）、74HC04（NOT）、74HC14（シュミットトリガ）、74HC74（Dフリップフロップ）、74HC153（4入力マルチプレクサ）のPDIPモデルを追加しています。両側の脚、切り欠き、1番ピン、型番を表示し、中央の溝を跨ぐE/F列の配置と180度反転に対応します。コンデンサと4連DIPスイッチも追加しています。

「サンプル」→「1bit CPU」で、**4枚・部品21個・配線91本の手動命令入力式CPU**を開けます。AIキーや生成APIは不要です。選択中のESP32／Pico／Raspberry Piは3.3VとGNDの給電だけに使い、論理演算と1bitアキュムレータの保持はICが行います。PC・ROM・RAM・分岐・自動命令実行は含みません。

- SW1の1番は入力D、2番はOP0、3番はOP1（OFF=0、ON=1）。4番はRESET（ONでA=0、実行時はOFF）。電源投入時は必ずRESETします。
- SW2は手動クロック。100kΩ／10kΩ／1µFと74HC14でチャタリングを抑え、押下時の立ち上がりで74HC74を更新します。入力・命令は事前に設定し、ボタンを200ms以上押し、離して300ms以上待って次を実行します。
- 各ICに100nFの電源バイパス、DIP入力に10kΩのプル抵抗、赤LEDに2.2kΩの電流制限抵抗を含めています。未使用CMOS入力を固定し、未使用出力を開放しています。

| OP1 | OP0 | 命令 | 次のA |
| --- | --- | --- | --- |
| 0 | 0 | LOAD | D |
| 0 | 1 | AND | A AND D |
| 1 | 0 | XOR | A XOR D |
| 1 | 1 | NOT | NOT A |

RESET → LOAD 1 → AND 0 → XOR 1 → NOTを順に実行するとAは0 → 1 → 0 → 1 → 0になります。赤LEDはA=1で点灯します。これは配線ガイドであり、ブラウザで実回路の電気的シミュレーションは行いません。実機検証は未実施です。

回路JSONには任意の `breadboards: [{id: "BB1"}, {id: "BB2"}]` と `parts[].placement.breadboard` を追加しています。省略された旧データはBB1上の従来配置を維持します。2枚目以降の穴は `BB2:E15` のように表示します。各ボードの電源レールは `rail.BB1.VCC` / `rail.BB1.GND` の配線端点として選べます。ボードの追加だけではレールに電源が入らないため、3.3V／GNDから配線し、ボード間も橋渡ししてください。途中で分断された実物のレールは導通確認と橋渡しが必要です。

接続検査はICの電源、入力の接続、出力同士・電源との直結、RESET／PRESETの同時LOW、DIPスイッチの閉成時短絡を検査します。配置検査ではボードごとに穴と導通列を分離し、同じ番号の穴を別ボードでも使用できます。部品の実寸・定格・動作の確認は実物の資料で行ってください。

ピン順の参照: Texas Instruments [74HC08](https://www.ti.com/lit/ds/symlink/sn74hc08.pdf)、[74HC86](https://www.ti.com/lit/ds/symlink/sn74hc86.pdf)、[74HC153](https://www.ti.com/lit/ds/symlink/sn74hc153.pdf)、[74HC74](https://www.ti.com/lit/ds/symlink/sn74hc74.pdf)、[74HC14](https://www.ti.com/lit/ds/symlink/sn74hc14.pdf)。

## 部品の購入提案（DigiKey・国内ショップ・Amazon）

部品パネルの「購入する」で、現在の部品表（マイコン・ブレッドボード・素子・ジャンパ線）に対応する「おすすめ購入リスト」を先頭に表示します。DigiKey・秋月電子通商・千石電商・共立エレショップ・マルツ・Amazon.co.jpを候補に、Geminiが適合性・必要数量を確認し、価格も考慮した1商品を部品ごとに即座に表示します。全サイトの比較は待ちません。まず取得済みのDigiKey候補を判定し、適切ならその時点で終了します。過剰仕様・数量・価格などで適切な候補がなければ、Geminiが有力と判断したショップから1商品を探して確認します。確認に失敗した場合のみ別候補を試し、最大2商品の探索で終了します。全ショップの最安値を保証する選定ではありません。

国内ショップ・Amazonの候補はGeminiのGoogle Searchで実在の商品ページを1つ探し、URL Contextでその1ページを取得して在庫・入数・仕様を確認します。商品URLはショップの許可リストと商品詳細ページのパスで検証し、取得成功のメタデータがあるページだけを採用します。売り切れ・予約・取り寄せ・在庫不明・ページ取得失敗・入数不明・必要数を確保できない候補は推奨から除外します。検索スニペットだけで在庫ありとは判定しません。Amazonも販売元・選択された商品バリエーション・入数・在庫が確認できる場合のみ採用します。

おすすめには商品ページへの直接リンク、店舗、注文数、1注文あたりの入数、商品代金、理由、在庫の根拠と確認日時を表示します。注文数は `max(最低注文数, ceil(必要数 / 入数))` です。予備を勝手に追加せず、必要数の3倍と10個の大きい方を超える数量や、余分な基板・ブレッドボードを含むセットは除外します。在庫・価格は取得時点の情報で、購入直前の変更まで保証するものではありません。商品ページで仕様や送料も再確認してください。

検索中は部品ごとに「順番待ち」「ショップ検索」「在庫・仕様確認」の進捗を表示し、取得済みのDigiKey候補はAIの完了前から選択できます。検索は中止でき、完了済みの商品を残したまま未完了の部品だけ再試行できます。同時検索は3部品まで、1部品はサーバー55秒・ブラウザー60秒、一覧全体は90秒で一旦終了します。利用枠の確認は5秒、接続状態の確認は10秒でタイムアウトし、通信が応答しなくても待ち続けません。タイムアウトしても取得済み候補を残します。

「検索条件・DigiKeyの商品を変更」を開くと再検索・手動選択ができます。DigiKeyも在庫不足の商品は候補一覧から除外します。国内ショップ・Amazonの商品は各商品ページで購入し、DigiKeyのカートやその合計金額には含めません。

選択後の「購入する · DigiKeyのカートへ」は、DigiKey公式のFastAddに品番と数量をPOSTし、別タブでカートを開きます。既存カートは維持し、同じ品番は数量を合算します。注文確定・決済はDigiKey側で行います。FastAddは公式資料に記載された `www.digikey.com` のエンドポイントを使用するため、DigiKey側で配送先・地域・通貨も確認してください。商品検索は日本サイト・日本語・JPY指定です。

### 管理者の設定

1. [DigiKey Developer Portal](https://developer.digikey.com/)でアプリを登録し、Product Information V4を有効にします。本番環境ではProduction Appのクライアント情報を使用します。
2. `DIGIKEY_CLIENT_ID` と `DIGIKEY_CLIENT_SECRET` をサーバーの環境変数に設定します。`NEXT_PUBLIC_` を付けず、リポジトリにも保存しないでください。Docker Composeは既存の `.env`、Cloud RunではSecret Managerから実行時に渡します。ショップ横断の選定には `GEMINI_API_KEY` と、構造化出力・Google Search・URL Contextを併用できるGeminiモデル（既定のGemini 3系）が必要です。DigiKeyが未設定でも国内ショップ・Amazonの選定は利用できます。AIが利用できない場合もDigiKeyの検索結果は手動で選択できます。
3. 既存の `SESSION_SECRET`、`GOOGLE_CLOUD_PROJECT`、Firestore権限を設定します。セッションはアクセスコードなしで自動開始します。
4. DigiKey APIの検索上限は全体800回/日・セッション100回/日で、`DIGIKEY_DAILY_LIMIT` / `DIGIKEY_SESSION_DAILY_LIMIT` で変更できます。Geminiによるショップ検索・商品確認は別枠で、`PURCHASE_AI_DAILY_LIMIT` / `PURCHASE_AI_SESSION_DAILY_LIMIT`（既定800回/日・100回/日）を使用します。DigiKeyのローカル上限やAPIの429に達しても、DigiKeyを除いて他ショップの検索を続けます。Gemini側の枠も上限に達した場合はその旨を表示します。各枠は回路生成の上限とも独立し、Firestoreの `digikey-*` / `purchase-ai-*` ドキュメントでCloud Runの複数インスタンス間でも計数します。既存のDigiKeyカウンターはリセットしません。購入提案はGeminiの各呼び出し（DigiKey候補のみなら1回、国内候補は探索と確認で2回、再探索を含め最大5回/部品）をショップ検索・商品確認の枠で計数します。

`DIGIKEY_SANDBOX=true` でSandboxの認証・商品検索を使用します。Sandboxの商品は検索条件と一致しない場合があるため、カート送信は無効です。本番運用時は `false` にしてください。

### Cloud RunでDigiKeyの認証情報を設定する

この変更を初めてデプロイする前に、以下のシークレット作成と権限付与を済ませます。GitHub ActionsのSecretsやビルド時の環境変数に認証情報を登録する必要はありません。`make deploy` は `.env.local` / `.env` に書いたDigiKeyの値をCloud Runへ転送しません。

1. 同じGoogle CloudプロジェクトのSecret Managerで次の2個を作成し、DigiKeyのProduction Appの値を保存します。

   | シークレット名 | 保存する値 | Cloud Runの環境変数名 |
   | --- | --- | --- |
   | `breadberry-digikey-client-id` | Client ID | `DIGIKEY_CLIENT_ID` |
   | `breadberry-digikey-client-secret` | Client Secret | `DIGIKEY_CLIENT_SECRET` |

2. Cloud Runの実行サービスアカウントに、それぞれのシークレットを読む権限を付与します。`GOOGLE_CLOUD_PROJECT` と、独自のアカウントを使う場合は `SERVICE_ACCOUNT` を、デプロイ時と同じ値に設定してください。

   ```bash
   RUNTIME_SA="${SERVICE_ACCOUNT:-breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com}"
   for SECRET in breadberry-digikey-client-id breadberry-digikey-client-secret; do
     gcloud secrets add-iam-policy-binding "$SECRET" --project "$GOOGLE_CLOUD_PROJECT" \
       --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor
   done
   ```

3. `make deploy` を実行するか、PRを `main` にマージしてGitHub Actionsでデプロイします。`.github/workflows/deploy.yml` → `make deploy` → `scripts/deploy.sh` の順で実行され、上表のシークレット参照（`:latest`）と `DIGIKEY_SANDBOX=false` がCloud Runへ自動登録されます。Cloud Runコンソールでの手動割り当ては不要です。`cloudbuild.yaml` はDockerイメージのビルドを担当し、DigiKeyの認証情報は渡しません。

キーを更新したときは、同じ名前のシークレットに新しいバージョンを登録して再デプロイします。既存APIキーと同じく `latest` を参照するため、手動で固定したバージョンも次のデプロイ時には `latest` に更新されます。Sandboxを使う検証環境を手動デプロイする場合は `DIGIKEY_SANDBOX=true make deploy` を指定してください。

ローカル開発には `.env.local`（Docker Composeでは `.env`）に `DIGIKEY_CLIENT_ID` / `DIGIKEY_CLIENT_SECRET` を設定します。設定後にサーバーを再起動し、購入一覧で検索できることを確認します。

参考: [Cloud Runのシークレット設定](https://docs.cloud.google.com/run/docs/configuring/services/secrets)、[gcloud run deployのシークレット更新オプション](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy)。

認証トークンはサーバー内で期限まで再利用し、401では一度だけ再取得します。検索結果はインスタンス内で5分（最大200検索）保持します。包装別の最低購入数量・在庫・購入上限・段階単価を使用し、Digi-Reel手数料のある包装は除外します。価格・在庫は取得時点の参考値で、最終値はDigiKey側で確認してください。未設定・未接続・検索上限・タイムアウト・検索結果なしは画面に表示します。

- [Product Information V4](https://developer.digikey.com/products/product-information-v4/productsearch/keywordsearch)
- [OAuth 2-legged flow](https://developer.digikey.com/documentation)
- [FastAdd公式仕様（POST）](https://forum.digikey.com/t/digikey-fastadd-bulk-add-parts-into-a-digikey-cart-via-third-party-tooling-and-urls/61356)

検証: `npm run typecheck && npm test && npm run build`、`npx playwright test tests/purchase.spec.ts`。自動テストは商品APIとカート送信をモックし、実カートを変更しません。実機確認は本番キーで接続後、少数の候補を選び、別タブのDigiKeyカートで型番・数量を確認してください。

## ライセンス

breadberry本体は [ISC License](LICENSE) で公開しています。

以下のオープンソースソフトウェアを利用しています。各ソフトウェアの著作権は、それぞれの著作権者に帰属します。ライセンス全文は `node_modules/<パッケージ名>/` 内のライセンスファイル、または各配布元で確認できます。

### 実行時に使用するもの

| ソフトウェア | 用途 | ライセンス |
| --- | --- | --- |
| [Next.js](https://github.com/vercel/next.js) | Webフレームワーク | MIT |
| [React](https://github.com/facebook/react) / React DOM | UI | MIT |
| [three.js](https://github.com/mrdoob/three.js) | 3D描画 | MIT |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | three.jsのReactレンダラー | MIT |
| [drei](https://github.com/pmndrs/drei) | React Three Fiberの補助部品 | MIT |
| [Zod](https://github.com/colinhacks/zod) | スキーマ検査 | MIT |
| [Lucide](https://github.com/lucide-icons/lucide)（lucide-react） | アイコン | ISC |
| [@google-cloud/firestore](https://github.com/googleapis/nodejs-firestore) | Firestoreクライアント | Apache-2.0 |
| [google-auth-library](https://github.com/googleapis/google-auth-library-nodejs) | Model ArmorとCloud Traceの認証 | Apache-2.0 |
| [OpenTelemetry JS](https://github.com/open-telemetry/opentelemetry-js)（@opentelemetry/api・core・resources・sdk-trace-base・exporter-trace-otlp-proto） | 生成工程のトレース | Apache-2.0 |
| [Fontsource](https://github.com/fontsource/font-files) で配布される Inter / Noto Sans JP / Oswald / Playfair Display | フォント | SIL Open Font License 1.1 |

### 開発・ビルド・テストに使用するもの

| ソフトウェア | 用途 | ライセンス |
| --- | --- | --- |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)（@tailwindcss/postcss を含む） | スタイル | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | 型検査 | Apache-2.0 |
| [Playwright](https://github.com/microsoft/playwright) | E2Eテスト | Apache-2.0 |
| [tsx](https://github.com/privatenumber/tsx) | TypeScriptの実行 | MIT |
| [Prettier](https://github.com/prettier/prettier) | コード整形 | MIT |
| [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)（@types/node, @types/react, @types/react-dom, @types/three） | 型定義 | MIT |

上記は `package.json` に直接記載している依存です。間接的な依存を含む一覧は `npx license-checker --summary` などで確認できます。

`public/models/led/` の3Dモデルは `scripts/generate-led-models.ts` で生成した本プロジェクトのオリジナルです。Fritzingは画面構成の参考にしたもので、Fritzingのコード・部品データ・画像は含みません。

Gemini API、GMI Cloud、DigiKey API、Google Cloudの各サービスは、それぞれの利用規約に従って利用しています。

`docs/` の構成図には、Google Cloudが配布する[公式アイコン](https://cloud.google.com/icons)（Cloud Run、Cloud Firestore、Secret Manager、Cloud Build、Artifact Registry）と、[Simple Icons](https://github.com/simple-icons/simple-icons)（CC0-1.0）のアイコンを使用しています。各サービス・製品の名称とロゴは、それぞれの権利者の商標です。

### CAD風の回路図表示

「回路図」タブでは、明るいグリッド付きの図面に回路記号と端子名を表示します。
抵抗・LED・コンデンサ・常開スイッチ・CdS・NTCは専用記号、それ以外のセンサーやロジックICは端子付きのブロックで表示します。
接続は回路データから直角配線として描画され、クリックまたはキーボードで配線を選ぶと接続先と説明を確認できます。
拡大・縮小・全体表示とSVG保存に対応し、保存した図面はブラウザやベクター編集ソフトで開けます。
交差する線は接続を意味しません。同じ端子名を接続の基準にしてください。記号の端子配置は実物のピン配置とは異なります。
この表示は接続確認用で、電気的な動作シミュレーションやPCB製造データの出力は行いません。

### USB接続からの自動ビルド・実行

「コード」の右隣の「自動ビルド」で、MicroPython導入済みESP32／Picoに接続し、転送・コンパイル・保存・実行できます。失敗時はAIがエラーログとコードを解析し、修正案から再実行できます。PC版Chrome／Edge等とHTTPSが必要です。初回のMicroPython導入、外部ドライバー導入、C++、Raspberry Pi OSは対象外です。[操作・対応条件](docs/web-serial.md)を参照してください。
