#!/usr/bin/env bash
# One-time human step: give CI the Chrome Web Store service account.
#
#   apps/chrome-extension/scripts/store-credentials.sh <service-account-key.json> <publisher-id> [--replace]
#
# Before: in Google Cloud, enable the "Chrome Web Store API", create a service
# account (no roles) and download a JSON key for it. In the Chrome Web Store
# Developer Dashboard, add the service account email under Account → Service
# accounts, and copy the publisher ID from Publisher → Settings.
#
# - Stores both values in AWS Secrets Manager kortix-ci-env (us-east-2) as
#   CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY and CHROME_WEB_STORE_PUBLISHER_ID.
#   The only CI reader is .github/workflows/chrome-store.yml (through aws-env).
# - Then runs scripts/store-release.ts --dry-run with them: it proves the key
#   works and the Dashboard grants it the item, and uploads nothing.
# Needs: aws (write on kortix-ci-env), jq, bun. Prints no secret. Delete the
# downloaded key file afterwards: Secrets Manager holds the only copy CI needs.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
region=us-east-2; blob=kortix-ci-env
key_file="${1:-}"; publisher="${2:-}"; replace=0
[ "${3:-}" = "--replace" ] && replace=1
[ -f "$key_file" ] && [ -n "$publisher" ] || { sed -n '4p' "$0" | sed 's/^# *//' >&2; exit 2; }
for c in aws jq bun; do command -v "$c" > /dev/null || { echo "$c is required" >&2; exit 1; }; done

key="$(jq -ce 'select(.type == "service_account" and (.client_email | length) > 0 and (.private_key | length) > 0)' "$key_file")" \
  || { echo "$key_file is not a service account JSON key" >&2; exit 1; }
email="$(jq -r .client_email <<< "$key")"

current="$(aws secretsmanager get-secret-value --region "$region" --secret-id "$blob" --query SecretString --output text)"
if [ "$(jq -r 'has("CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY")' <<< "$current")" = "true" ] && [ "$replace" = 0 ]; then
  echo "CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY already exists in $blob. Pass --replace to rotate it." >&2
  exit 1
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
jq --argjson k "$key" --arg p "$publisher" \
  '. + {CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY: ($k | tojson), CHROME_WEB_STORE_PUBLISHER_ID: $p}' <<< "$current" > "$tmp/blob.json"
aws secretsmanager put-secret-value --region "$region" --secret-id "$blob" --secret-string "file://$tmp/blob.json" > /dev/null
echo "Stored $email and publisher $publisher in $blob ($region)."

echo "Dry run against the store:"
CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY="$key" CHROME_WEB_STORE_PUBLISHER_ID="$publisher" \
  bun "$here/store-release.ts" --dry-run
