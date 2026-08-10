#!/usr/bin/env bash
set -euo pipefail

readonly keychain_account="codex-automation"
readonly keychain_service="raceside-ops-snapshot"
readonly snapshot_url="${RACESIDE_OPS_SNAPSHOT_URL:-https://raceside.online/api/admin/ops-snapshot}"

token="$(security find-generic-password -a "${keychain_account}" -s "${keychain_service}" -w)"
trap 'unset token' EXIT

printf 'header = "Authorization: Bearer %s"\n' "${token}" | \
  curl --config - \
    --fail-with-body \
    --silent \
    --show-error \
    --connect-timeout 10 \
    --max-time 30 \
    "${snapshot_url}"
