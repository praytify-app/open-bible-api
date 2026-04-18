#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3100/api/v1}"
HEALTH_URL="${HEALTH_URL:-${BASE_URL%/api/v1}/api/v1/health}"
AUTH_TOKEN="${BIBLE_API_BEARER_TOKEN:-}"

curl_json() {
  local url="$1"

  if [[ -n "$AUTH_TOKEN" ]]; then
    curl -fsS -H "Authorization: Bearer ${AUTH_TOKEN}" "$url"
  else
    curl -fsS "$url"
  fi
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local label="$3"

  if [[ "$output" != *"$expected"* ]]; then
    printf 'FAIL: %s\nExpected to find: %s\nOutput:\n%s\n' "$label" "$expected" "$output" >&2
    exit 1
  fi

  printf 'PASS: %s\n' "$label"
}

printf 'Health check: %s\n' "$HEALTH_URL"
health_output="$(curl -fsS "$HEALTH_URL")"
assert_contains "$health_output" "ok" "health endpoint"

printf '\nChecking BSB search\n'
bsb_output="$(curl_json "${BASE_URL}/versions?language=eng&search=BSB")"
assert_contains "$bsb_output" "\"abbreviation\":\"BSB\"" "versions search returns BSB"

printf '\nChecking OEB search\n'
oeb_output="$(curl_json "${BASE_URL}/versions?language=eng&search=OEB")"
assert_contains "$oeb_output" "\"abbreviation\":\"OEB\"" "versions search returns OEB"
assert_contains "$oeb_output" "\"abbreviation\":\"OEB-CW\"" "versions search returns OEB-CW"

printf '\nChecking WEBU verse lookup\n'
webu_output="$(curl_json "${BASE_URL}/verses?ref=John%203:16&version=WEBU")"
assert_contains "$webu_output" "\"version\":\"WEBU\"" "verse lookup returns WEBU"

printf '\nChecking OEB-CW books lookup\n'
books_output="$(curl_json "${BASE_URL}/versions/OEB-CW/books")"
assert_contains "$books_output" "\"bookCode\":\"GEN\"" "books lookup resolves OEB-CW"

printf '\nAll canonical English abbreviation smoke tests passed.\n'
