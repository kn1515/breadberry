#!/usr/bin/env bash
# Shared preflight, sourced before any build or infrastructure mutation.
: "${GOOGLE_CLOUD_PROJECT:?Set GOOGLE_CLOUD_PROJECT}"
: "${CLOUD_ARMOR_DOMAIN:?Set CLOUD_ARMOR_DOMAIN to the public HTTPS hostname}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-breadberry}"
EDGE_NAME="${EDGE_NAME:-${SERVICE}-edge}"
if [[ ! "$CLOUD_ARMOR_DOMAIN" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; then
  echo 'CLOUD_ARMOR_DOMAIN must be a DNS hostname without scheme, port or path.' >&2
  exit 1
fi
if [[ "${ALLOW_UNAUTHENTICATED:-true}" != "true" ]]; then
  echo 'The public load balancer requires ALLOW_UNAUTHENTICATED=true; ingress provides edge isolation.' >&2
  exit 1
fi
if [[ -n "${APP_ORIGIN:-}" && "$APP_ORIGIN" != "https://${CLOUD_ARMOR_DOMAIN}" ]]; then
  echo 'APP_ORIGIN must match https://CLOUD_ARMOR_DOMAIN.' >&2
  exit 1
fi
APP_ORIGIN="https://${CLOUD_ARMOR_DOMAIN}"
export GOOGLE_CLOUD_PROJECT REGION SERVICE EDGE_NAME CLOUD_ARMOR_DOMAIN APP_ORIGIN
