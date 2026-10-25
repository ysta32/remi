#!/usr/bin/env bash
# Contract smoke test (echo-docs/echo-docs/docs/contracts.md §4–6) against a running dev server.
# Usage (from web/):  BASE=http://localhost:3000 AGENT_API_TOKEN=... bash ../scripts/smoke.sh
# Needs the server started with DEV_TOOLS=1 and the same AGENT_API_TOKEN. WARNING: calls /api/dev/reset.
# Requires bash, curl and node. Exits non-zero on the first unexpected status.
set -euo pipefail

BASE=${BASE:-http://localhost:3000}
TOKEN=${AGENT_API_TOKEN:?set AGENT_API_TOKEN to the token the server uses}
TMP=$(mktemp -d)
# On Windows Git Bash, curl/node may be native binaries that can't read /tmp-style paths.
command -v cygpath >/dev/null 2>&1 && TMP=$(cygpath -m "$TMP")
trap 'rm -rf "$TMP"' EXIT
BODY="$TMP/body"
PASS=0

# 1x1 PNG fixture and a fake HEIC header.
echo 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > "$TMP/pixel.png"
printf '\x00\x00\x00\x18ftypheic\x00\x00\x00\x00' > "$TMP/photo.heic"

# req <expected-status> <method> <path> [extra curl args...]; response body in $BODY.
req() {
  local expected=$1 method=$2 path=$3
  shift 3
  local status
  status=$(curl -sS -o "$BODY" -w '%{http_code}' -X "$method" "$@" "$BASE$path") || {
    echo "FAIL $method $path: curl error (is the server running at $BASE?)" >&2
    exit 1
  }
  if [[ ! " $expected " == *" $status "* ]]; then
    echo "FAIL $method $path: expected $expected, got $status" >&2
    head -c 600 "$BODY" >&2 || true
    echo >&2
    exit 1
  fi
  PASS=$((PASS + 1))
  echo "ok   $status $method $path"
  LAST_STATUS=$status
}

# jget <js-expression on `b`>: evaluate against the last JSON body.
jget() {
  node -e 'const fs=require("fs");const b=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const v=('"$1"');process.stdout.write(v===undefined||v===null?"":String(v));' "$BODY"
}

check() {
  local desc=$1 cond=$2
  if [[ $(jget "$cond") != "true" ]]; then
    echo "FAIL check: $desc" >&2
    head -c 600 "$BODY" >&2 || true
    echo >&2
    exit 1
  fi
  PASS=$((PASS + 1))
  echo "ok   check: $desc"
}

JSON=(-H 'content-type: application/json')
AUTH=(-H "authorization: Bearer $TOKEN")

echo "== dev"
req 200 POST /api/dev/reset
req "200 501" POST /api/dev/seed "${JSON[@]}" -d '{"scenario":"drift"}'
[[ $LAST_STATUS == 200 ]] && check "seed returns elderId" 'typeof b.elderId === "string"'
req 400 POST /api/dev/seed "${JSON[@]}" -d '{"scenario":"nope"}'
req 200 POST /api/dev/reset
req 200 GET /api/dev/status
check "status lists calls" 'Array.isArray(b.calls)'

echo "== family"
req 200 GET /api/elders
check "no elders after reset" 'b.length === 0'
req 400 POST /api/elders "${JSON[@]}" -d '{"displayName":""}'
req 400 POST /api/elders "${JSON[@]}" -d 'not json'
req 201 POST /api/elders "${JSON[@]}" -d '{"displayName":"Harold Bennett","preferredName":"Hal","language":"en","primaryContactName":"Linda","members":[{"name":"Sam","relation":"grandson"}]}'
ELDER=$(jget b.id)
req 200 GET "/api/elders/$ELDER"
check "profile has members and consent" 'b.members.length === 1 && b.consent.elderConfirmed === false'
req 404 GET /api/elders/does-not-exist
req 200 PATCH "/api/elders/$ELDER" "${JSON[@]}" -d '{"about":"Retired machinist who loves big band music."}'
check "patch applied" 'b.about.startsWith("Retired")'
req 400 PATCH "/api/elders/$ELDER" "${JSON[@]}" -d '{"language":"fr"}'

req 201 POST "/api/elders/$ELDER/photos" -F "file=@$TMP/pixel.png;type=image/png" -F 'caption=Lake trip, 1978' -F 'people=Hal, Linda'
PHOTO=$(jget b.id)
check "photo imageUrl" "b.imageUrl === '/api/photos/$PHOTO/file'"
req 415 POST "/api/elders/$ELDER/photos" -F "file=@$TMP/photo.heic;type=image/heic" -F 'caption=heic'
req 400 POST "/api/elders/$ELDER/photos" -F "file=@$TMP/pixel.png;type=image/png"
req 404 POST /api/elders/does-not-exist/photos -F "file=@$TMP/pixel.png;type=image/png" -F 'caption=x'
req 200 GET "/api/photos/$PHOTO/file"
cmp -s "$BODY" "$TMP/pixel.png" || { echo "FAIL photo bytes differ" >&2; exit 1; }
CT=$(curl -sS -o /dev/null -w '%{content_type}' "$BASE/api/photos/$PHOTO/file")
[[ $CT == image/png* ]] || { echo "FAIL photo content-type: $CT" >&2; exit 1; }
echo "ok   content-type $CT"

req 201 POST "/api/elders/$ELDER/questions" "${JSON[@]}" -d '{"text":"What was your first car?","askedBy":"Sam"}'
QUESTION=$(jget b.id)
req 201 POST "/api/elders/$ELDER/questions" "${JSON[@]}" -d '{"text":"Temporary question","askedBy":"Linda"}'
TEMPQ=$(jget b.id)
req 204 DELETE "/api/questions/$TEMPQ"
req 404 DELETE "/api/questions/$TEMPQ"
req 400 POST "/api/elders/$ELDER/questions" "${JSON[@]}" -d '{"text":""}'

req 200 PUT "/api/elders/$ELDER/consent" "${JSON[@]}" -d '{"summaries":true,"funFacts":true,"speechTrends":true,"mood":true}'
check "consent proposed but not effective" 'b.proposed.mood === true && b.effective.mood === false && b.elderConfirmed === false'
req 400 PUT "/api/elders/$ELDER/consent" "${JSON[@]}" -d '{"summaries":"yes"}'

echo "== agent"
req 401 GET "/api/agent/context?elderId=$ELDER"
req 401 GET "/api/agent/context?elderId=$ELDER" -H 'authorization: Bearer wrong'
req 400 GET /api/agent/context "${AUTH[@]}"
req 404 GET /api/agent/context?elderId=does-not-exist "${AUTH[@]}"
START_NS=$(date +%s%N)
req 200 GET "/api/agent/context?elderId=$ELDER" "${AUTH[@]}"
ELAPSED_MS=$(( ($(date +%s%N) - START_NS) / 1000000 ))
echo "     context took ${ELAPSED_MS} ms"
check "context first call" 'b.isFirstCall === true && b.lastCall === null && b.photos.length === 1'
check "context question + absolute imageUrl" "b.familyQuestion.id === '$QUESTION' && /^https?:\/\/.+\/api\/agent\/photos\/$PHOTO\$/.test(b.photos[0].imageUrl)"
THEME=$(jget b.theme.id)

req 401 GET "/api/agent/photos/$PHOTO"
req 200 GET "/api/agent/photos/$PHOTO" "${AUTH[@]}"
req 404 GET /api/agent/photos/does-not-exist "${AUTH[@]}"

req 401 POST /api/agent/calls "${JSON[@]}" -d '{}'
req 400 POST /api/agent/calls "${AUTH[@]}" "${JSON[@]}" -d '{"elderId":"x"}'
req 404 POST /api/agent/calls "${AUTH[@]}" "${JSON[@]}" -d '{"elderId":"does-not-exist","startedAt":"2026-10-25T14:02:11Z","language":"en"}'
req 201 POST /api/agent/calls "${AUTH[@]}" "${JSON[@]}" -d "{\"elderId\":\"$ELDER\",\"startedAt\":\"2026-10-25T14:02:11Z\",\"language\":\"en\",\"bridgeIdentity\":\"chert-bridge-smoke\",\"themeId\":\"$THEME\"}"
CALL=$(jget b.callId)

EV="/api/agent/calls/$CALL/events"
req 401 POST "$EV" "${JSON[@]}" -d '{}'
req 204 POST "$EV" "${AUTH[@]}" "${JSON[@]}" -d "{\"type\":\"photo_shown\",\"atMs\":15000,\"payload\":{\"photoId\":\"$PHOTO\"}}"
req 204 POST "$EV" "${AUTH[@]}" "${JSON[@]}" -d "{\"type\":\"question_asked\",\"atMs\":30000,\"payload\":{\"questionId\":\"$QUESTION\"}}"
req 204 POST "$EV" "${AUTH[@]}" "${JSON[@]}" -d '{"type":"consent","atMs":5000,"payload":{"summaries":true,"funFacts":true,"speechTrends":true,"mood":true}}'
req 204 POST "$EV" "${AUTH[@]}" "${JSON[@]}" -d '{"type":"safety","atMs":45000,"payload":{"category":"other","note":"smoke test only"}}'
req 400 POST "$EV" "${AUTH[@]}" "${JSON[@]}" -d '{"type":"bogus","atMs":1,"payload":{}}'
req 404 POST /api/agent/calls/does-not-exist/events "${AUTH[@]}" "${JSON[@]}" -d "{\"type\":\"photo_shown\",\"atMs\":1,\"payload\":{\"photoId\":\"$PHOTO\"}}"

COMPLETE='{"endedAt":"2026-10-25T14:09:40Z","endReason":"caller_hangup","utterances":[{"speaker":"caller","text":"Hello?","startMs":1200,"endMs":1700},{"speaker":"agent","text":"Hi Hal! Good to hear you again.","startMs":2300,"endMs":4100}],"audioPath":null}'
req 401 POST "/api/agent/calls/$CALL/complete" "${JSON[@]}" -d "$COMPLETE"
req 400 POST "/api/agent/calls/$CALL/complete" "${AUTH[@]}" "${JSON[@]}" -d '{"endedAt":"nope"}'
req 404 POST /api/agent/calls/does-not-exist/complete "${AUTH[@]}" "${JSON[@]}" -d "$COMPLETE"
req 202 POST "/api/agent/calls/$CALL/complete" "${AUTH[@]}" "${JSON[@]}" -d "$COMPLETE"
check "complete says processing" 'b.status === "processing"'

echo "== timeline"
for _ in $(seq 1 60); do
  req 200 GET "/api/elders/$ELDER/timeline" >/dev/null
  [[ $(jget b.processing) == "false" ]] && break
  sleep 1
done
req 200 GET "/api/elders/$ELDER/timeline"
check "timeline done processing" 'b.processing === false'
check "timeline call card" "b.calls.length === 1 && b.calls[0].id === '$CALL' && b.calls[0].durationS === 449"
check "call ended (done or failed)" '["done","failed"].includes(b.calls[0].status)'
check "photo shown + question on card" "b.calls[0].photosShown[0].id === '$PHOTO' && b.calls[0].familyQuestion.askedBy === 'Sam'"
check "consent confirmed" 'b.consent.elderConfirmed === true && b.consent.effective.speechTrends === true'
check "markers series present (8 speech + 2 voice)" "b.markers.length === 10 && ['pitch_var','pitch_range'].every((k) => b.markers.some((m) => m.key === k && m.group === 'voice'))"
if grep -q 'utterances\|Good to hear you again' "$BODY"; then echo "FAIL timeline leaks transcript" >&2; exit 1; fi
echo "ok   timeline has no transcript"
req 404 GET /api/elders/does-not-exist/timeline

req 200 GET "/api/agent/context?elderId=$ELDER" "${AUTH[@]}"
check "second context is not first call" 'b.isFirstCall === false && b.familyQuestion === null'
check "theme rotated" "b.theme.id !== '$THEME'"

req 404 POST /api/nudges/does-not-exist/dismiss

echo "== dev (call)"
req 200 GET /api/dev/status
check "status shows the call with timings key" "b.calls[0].id === '$CALL' && 'timings' in b.calls[0]"
req 202 POST "/api/dev/calls/$CALL/process"
req 404 POST /api/dev/calls/does-not-exist/process

echo "== cleanup"
req 204 DELETE "/api/photos/$PHOTO"
req 404 GET "/api/photos/$PHOTO/file"
req 200 POST /api/dev/reset

echo "smoke OK ($PASS checks)"
