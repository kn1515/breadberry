#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-breadberry}"
REPOSITORY="${REPOSITORY:-breadberry}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-breadberry-runtime@${GOOGLE_CLOUD_PROJECT}.iam.gserviceaccount.com}"
ENV_VARS="GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT},GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.8-flash},GMI_MODEL=${GMI_MODEL:-meta-llama/Llama-3.3-70B-Instruct}"
if [[ -n "${APP_ORIGIN:-}" ]]; then
  ENV_VARS+=",APP_ORIGIN=${APP_ORIGIN}"
fi
# Prerequisites (APIs, repository, IAM, database, secrets) are documented in README.
# Services remain private by default; use gcloud run services proxy for local access.
BUILD_ID="$(gcloud builds submit --project "$GOOGLE_CLOUD_PROJECT" --config cloudbuild.yaml --substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY}" --format='value(id)' --quiet .)"
IMAGE="${REGION}-docker.pkg.dev/${GOOGLE_CLOUD_PROJECT}/${REPOSITORY}/breadberry:${BUILD_ID}"
gcloud run deploy "$SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$REGION" \
  --image "$IMAGE" --service-account "$SERVICE_ACCOUNT" --port 8080 \
  --memory 1Gi --cpu 1 --min-instances 0 --max-instances 3 --concurrency 8 --timeout 180 \
  --no-allow-unauthenticated \
  --update-env-vars "$ENV_VARS" \
  --set-secrets 'GEMINI_API_KEY=breadberry-gemini-key:latest,GMI_API_KEY=breadberry-gmi-key:latest,SESSION_SECRET=breadberry-session-secret:latest,APP_ACCESS_TOKEN=breadberry-access-token:latest'
