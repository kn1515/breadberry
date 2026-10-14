#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/cloud-armor-config.sh"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-breadberry}"
REPOSITORY="${REPOSITORY:-breadberry}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com}"
ENV_VARS="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.8-flash},GMI_MODEL=${GMI_MODEL:-Qwen/Qwen3.8-Flash},DIGIKEY_SANDBOX=${DIGIKEY_SANDBOX:-false}"
# Model Armor is opt-in; an unset template is deployed as disabled.
# Cloud Trace is on by default; set CLOUD_TRACE=false to turn it off.
ENV_VARS+=",MODEL_ARMOR_TEMPLATE=${MODEL_ARMOR_TEMPLATE:-},MODEL_ARMOR_LOCATION=${MODEL_ARMOR_LOCATION:-$REGION},MODEL_ARMOR_MODE=${MODEL_ARMOR_MODE:-block},CLOUD_TRACE=${CLOUD_TRACE:-true}"
if [[ -n "${APP_ORIGIN:-}" ]]; then
  ENV_VARS+=",APP_ORIGIN=${APP_ORIGIN}"
fi
# Prerequisites (APIs, repository, IAM, database, secrets) are documented in README.
# Public LB requires unauthenticated IAM; ingress and disabled run.app enforce the edge.
# Register all application secrets without removing unrelated secret bindings.
BUILD_ID="$(gcloud builds submit --project "$GOOGLE_CLOUD_PROJECT" --config cloudbuild.yaml --substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY}" --format='value(id)' --quiet .)"
IMAGE="${REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${REPOSITORY}/breadberry:${BUILD_ID}"
gcloud run deploy "$SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$SERVICE_ACCOUNT" --port 8080 \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 8 --timeout 240 \
  --allow-unauthenticated --ingress=internal-and-cloud-load-balancing --no-default-url \
  --update-env-vars "$ENV_VARS" \
  --remove-secrets APP_ACCESS_TOKEN \
  --update-secrets 'GEMINI_API_KEY=breadberry-gemini-key:latest,GMI_API_KEY=breadberry-gmi-key:latest,SESSION_SECRET=breadberry-session-secret:latest,DIGIKEY_CLIENT_ID=breadberry-digikey-client-id:latest,DIGIKEY_CLIENT_SECRET=breadberry-digikey-client-secret:latest'

"$(dirname "$0")/setup-cloud-armor.sh"
