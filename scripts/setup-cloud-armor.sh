#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/cloud-armor-config.sh"
gc() { gcloud --project "$GOOGLE_CLOUD_PROJECT" "$@"; }
# List failures (including missing IAM/API) abort; they are not treated as absence.
ensure() {
  local collection="$1" name="$2" scope="$3" existing
  shift 3
  existing="$(gc compute "$collection" list "$scope" --filter="name=$name" --format='value(name)')"
  if [[ -z "$existing" ]]; then
    if [[ "$scope" == --regions=* ]]; then scope="--region=${scope#--regions=}"; fi
    gc compute "$collection" create "$name" "$scope" "$@"
  fi
}
ensure addresses "$EDGE_NAME" --global --ip-version=IPV4 --network-tier=PREMIUM
ensure network-endpoint-groups "$EDGE_NAME" "--regions=$REGION" \
  --network-endpoint-type=serverless --cloud-run-service="$SERVICE"
ensure security-policies "$EDGE_NAME" --global --type=CLOUD_ARMOR
# Reapply managed rules on every deploy: preview must never silently persist.
gc beta compute security-policies update "$EDGE_NAME" --global --json-parsing=STANDARD --request-body-inspection-size=64KB
priorities="$(gc compute security-policies describe "$EDGE_NAME" --global --format='value(rules.priority)')"
rule() {
  local priority="$1" verb=create
  shift
  if [[ ";${priorities//$'\n'/;} ;" =~ (^|[\;\ ])${priority}([\;\ ]|$) ]]; then verb=update; fi
  gc compute security-policies rules "$verb" "$priority" --security-policy="$EDGE_NAME" --global --no-preview "$@"
}
rule 1000 --action=deny-403 --expression="evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})"
rule 1010 --action=deny-403 --expression="evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})"
# Only API requests are throttled; static 3D assets do not consume this threshold.
rule 2000 --action=throttle --expression="request.path.startsWith('/api/')" \
  --rate-limit-threshold-count=120 --rate-limit-threshold-interval-sec=60 \
  --conform-action=allow --exceed-action=deny-429 --enforce-on-key=IP
rule 2147483647 --action=allow --src-ip-ranges='*'
ensure backend-services "$EDGE_NAME" --global --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTP
backends="$(gc compute backend-services describe "$EDGE_NAME" --global --format='value(backends.group)')"
if [[ "$backends" != *"/regions/${REGION}/networkEndpointGroups/${EDGE_NAME}"* ]]; then
  gc compute backend-services add-backend "$EDGE_NAME" --global \
    --network-endpoint-group="$EDGE_NAME" --network-endpoint-group-region="$REGION"
fi
# Attach policy before the frontend can accept traffic. No health check/timeout for serverless NEGs.
gc compute backend-services update "$EDGE_NAME" --global --security-policy="$EDGE_NAME" \
  --enable-logging --logging-sample-rate=1
ensure url-maps "$EDGE_NAME" --global --default-service="$EDGE_NAME"
gc compute url-maps set-default-service "$EDGE_NAME" --global --default-service="$EDGE_NAME"
ensure ssl-certificates "$EDGE_NAME" --global --domains="$CLOUD_ARMOR_DOMAIN"
cert_domains="$(gc compute ssl-certificates describe "$EDGE_NAME" --global --format='value(managed.domains)')"
if [[ "$cert_domains" != "$CLOUD_ARMOR_DOMAIN" ]]; then
  echo 'Existing certificate domain differs. Use a new EDGE_NAME for a hostname migration.' >&2
  exit 1
fi
ensure target-https-proxies "$EDGE_NAME" --global --url-map="$EDGE_NAME" --ssl-certificates="$EDGE_NAME"
gc compute target-https-proxies update "$EDGE_NAME" --global --url-map="$EDGE_NAME" --ssl-certificates="$EDGE_NAME"
ensure forwarding-rules "$EDGE_NAME" --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --network-tier=PREMIUM --address="$EDGE_NAME" --target-https-proxy="$EDGE_NAME" --ports=443
# Also secure an existing service when this script is run independently.
gc run services update "$SERVICE" --region="$REGION" \
  --ingress=internal-and-cloud-load-balancing --no-default-url \
  --update-env-vars="APP_ORIGIN=$APP_ORIGIN"
ip="$(gc compute addresses describe "$EDGE_NAME" --global --format='value(address)')"
echo "DNS A record: $CLOUD_ARMOR_DOMAIN -> $ip"
echo "Public URL: $APP_ORIGIN (wait for DNS propagation and certificate ACTIVE)"
