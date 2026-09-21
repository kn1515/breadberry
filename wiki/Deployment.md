# Deployment

Docker / Cloud Run / GitHub Actions による breadberry のデプロイ手順です。

## Docker Compose（ローカル）

Docker Compose v2.24 以上を使用します。キーなしでもサンプルが動きます。

```bash
docker compose up --build
```

[http://localhost:8080](http://localhost:8080) を開きます。AI を使うときは `.env.example` を `.env` にコピーして設定してください。Docker 内にホストの ADC は自動で入りません。実 Firestore をローカル Docker から利用する場合：

```bash
export GOOGLE_ADC_FILE="$HOME/.config/gcloud/application_default_credentials.json"
docker compose -f compose.yaml -f compose.gcp.yaml up --build
```

ADC は読み取り専用マウントです。認証情報をイメージに含めません。Cloud Run ではサービスアカウントの ADC を自動使用するため、このマウントは不要です。

## Cloud Run へのデプロイ

課金が有効な Google Cloud プロジェクト、gcloud CLI、デプロイ権限が必要です。以下は自分のプロジェクトで実行してください。

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

すでに存在するリポジトリ／データベースの作成は省略します。Firestore のロケーションは作成後変更できません。

### 2. 実行用サービスアカウント

```bash
gcloud iam service-accounts create breadberry-runtime --project "$GOOGLE_CLOUD_PROJECT"
export RUNTIME_SA="breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$GOOGLE_CLOUD_PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role=roles/datastore.user
```

Cloud Build で使うビルド用サービスアカウントには、対象 Artifact Registry への書き込みとビルドログの書き込み権限が必要です。デプロイするユーザーには Cloud Run のデプロイ権限と `breadberry-runtime` に対する Service Account User 権限が必要です。

### 3. Secret Manager

次の4個のシークレットを Google Cloud Console で作成し、値を登録します。

| シークレット名 | 値 |
| -------------- | -- |
| `breadberry-gemini-key` | Gemini API キー |
| `breadberry-gmi-key` | GMI Cloud API キー |
| `breadberry-session-secret` | `openssl rand -hex 32` で生成する値 |
| `breadberry-access-token` | アプリ利用者に渡す共通アクセスコード |

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

`scripts/deploy.sh` が Cloud Build で Docker をビルドし、Cloud Run へデプロイします。既定値は以下のとおりです。

- 東京リージョン（asia-northeast1）
- 1GiB メモリ、最大3インスタンス、180秒タイムアウト
- **IAM で保護された非公開サービス**

環境変数 `REGION` / `SERVICE` / `SERVICE_ACCOUNT` で変更できます。

#### APP_ORIGIN の扱い

- `APP_ORIGIN` を指定して実行すると、その URL を操作の送信元として許可します（末尾 `/` なし）
- 未指定の場合は Cloud Run に設定済みの値を保持します。他の追加済み環境変数も再デプロイ時に保持します
- 一度 Cloud Run の URL を `APP_ORIGIN` に設定済みなら、以降は `make deploy` だけで再デプロイできます
- `make deploy` は `.env.local` を読み込みません。モデルを変更する場合は `GEMINI_MODEL=gemini-3.8-flash make deploy` のように環境変数で指定してください

## GitHub Actions で PR マージ時にデプロイ

`.github/workflows/deploy.yml` は、`main` 向け PR がマージされたときだけ `make deploy` を実行します。GitHub Actions 用のサービスアカウント鍵は作成せず、GitHub OIDC と Workload Identity Federation（WIF）で短時間の認証情報を発行します。

### 初回セットアップ

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
gcloud iam service-accounts add-iam-policy-binding \
  "breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --member="serviceAccount:${DEPLOY_SA}@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountUser

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

GitHub リポジトリの **Settings > Secrets and variables > Actions > Variables** に次を設定します。Cloud Run 実行用の秘密値は従来どおり Secret Manager を参照するため、GitHub には登録しません。

| 変数 | 値 |
| ---- | -- |
| `GOOGLE_CLOUD_PROJECT` | Google Cloud プロジェクト ID |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `breadberry-github-deploy@YOUR_PROJECT_ID.iam.gserviceaccount.com` |
| `CLOUD_RUN_RUNTIME_SERVICE_ACCOUNT` | `breadberry-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_REGION` | 任意。未指定時は `asia-northeast1` |
| `CLOUD_RUN_SERVICE` | 任意。未指定時は `breadberry` |
| `ARTIFACT_REPOSITORY` | 任意。未指定時は `breadberry` |
| `GEMINI_MODEL` / `GMI_MODEL` / `APP_ORIGIN` | 任意。ローカルの同名環境変数と同じ用途 |

`production` Environment を作成して承認者を設定すると、マージ後のデプロイ前に GitHub 上で承認を必須にできます。

## デプロイ後の動作確認

非公開のまま自分で確認するには、まず localhost を許可してプロキシを起動します：

```bash
gcloud run services update breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --update-env-vars 'APP_ORIGIN=http://localhost:8080'

gcloud run services proxy breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" --port 8080
```

[http://localhost:8080](http://localhost:8080) を開きます。`127.0.0.1` や別のポートは異なる送信元として扱われるため、設定と同じ URL を使ってください。

Cloud Run の URL でアクセスするときは、許可する送信元をその URL に切り替えます：

```bash
export APP_ORIGIN="https://YOUR_SERVICE_URL"
gcloud run services update breadberry --region "$REGION" \
  --project "$GOOGLE_CLOUD_PROJECT" \
  --update-env-vars "APP_ORIGIN=${APP_ORIGIN}"
```

現在の実装で許可する送信元は1つです。localhost と公開 URL の両方を同時には指定できません。

### トラブルシューティング

- **「この送信元からは操作できません。」という 403**：セッション開始などの操作時にブラウザの送信元と `APP_ORIGIN` が一致していません。Cloud Run の IAM 認証による `Error: Forbidden` とは別の設定です
- **`Error: Forbidden`（IAM）**：Cloud Run サービスが非公開（IAM 保護）のまま認証なしでアクセスしています。`gcloud run services proxy` を使うか、Invoker 権限を確認してください

## 一般公開

一般公開する場合は、アクセスコード（`breadberry-access-token`）を設定したうえで Cloud Run の Invoker 権限を運用に合わせて変更してください。公開 URL に合わせて `APP_ORIGIN` を設定します。本格的な複数ユーザー運用には Firebase Authentication 等の認証を追加してください。

Firestore のクライアント直接アクセスを禁止するルールと、生成回数カウンターの 7 日 TTL を適用できます：

```bash
firebase deploy --only firestore --project "$GOOGLE_CLOUD_PROJECT"
```

このルールはデータベース全体のクライアントアクセスを禁止します。既存アプリとデータベースを共用する場合は、ルールを統合してから適用してください。サーバー SDK のアクセスは IAM で管理します。
