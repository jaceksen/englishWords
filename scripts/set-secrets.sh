#!/usr/bin/env bash
# Uploads secrets from .env to Google Secret Manager for Cloud Functions.
set -euo pipefail
cd "$(dirname "$0")/.."

key=$(grep -E '^ANTHROPIC_API_KEY=' .env | cut -d= -f2- | tr -d '[:space:]')
if [[ -z "$key" ]]; then
  echo "ANTHROPIC_API_KEY is empty in .env" >&2
  exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
printf '%s' "$key" > "$tmp"
firebase functions:secrets:set ANTHROPIC_API_KEY --data-file "$tmp" --project legalizacjaonline --force
