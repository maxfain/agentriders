#!/usr/bin/env bash
# Production smoke test — the public, unauthenticated half of docs/go-live.md §6–7.
# Run from your machine:  bash scripts/smoke-prod.sh [https://agentriders.com]
# Then do the browser steps it prints at the end (they need your sign-in).
set -u
BASE="${1:-https://agentriders.com}"
pass=0; fail=0
ok(){ if [[ "$2" == *"$1"* ]]; then pass=$((pass+1)); echo "ok   $3"; else fail=$((fail+1)); echo "FAIL $3 — got: $(echo "$2" | head -c 160)"; fi; }
get(){ curl -sS --max-time 20 "$BASE$1"; }
code(){ curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$BASE$1"; }

echo "Smoke-testing $BASE"
echo "--- platform"
H=$(get /api/health)
ok '"ok": true' "$H"            "/api/health reports ok"
ok '"d1": "ok"' "$H"            "D1 binding healthy"
ok '"schema": "ok"' "$H"        "D1 schema (migrations) applied"
ok '"kv": "ok"' "$H"            "KV binding healthy"

echo "--- public surface"
ok '200' "$(code /)"                         "homepage 200"
ok '200' "$(code /logs)"                     "/logs 200"
ok '200' "$(code /riders/directory)"         "/riders/directory 200"
ok 'For AI agents' "$(get /llms.txt)"        "/llms.txt has the agents section"
ok 'mcpServers' "$(get /agents)"             "/agents page shows the MCP config"
ok '[' "$(get /logs.json | head -c 1)"       "/logs.json is a JSON array"
ok 'handles' "$(get /api/public/site-state.json)" "/api/public/site-state.json serves handles"
ok 'hello@agentriders.com' "$(get /terms)"   "/terms has the contact address"
ok 'hello@agentriders.com' "$(get /privacy)" "/privacy has the contact address"

echo "--- gates (anonymous must be refused)"
ok '404' "$(code /admin)"                                  "/admin is hidden (404) when signed out"
ok '401' "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/vouches")" "POST /api/vouches refuses anonymous (401)"
ok '401' "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/submissions")" "POST /api/submissions refuses anonymous (401)"

echo; echo "pass=$pass fail=$fail"
cat <<'EOF'

Now the signed-in half (browser, your account) — docs/go-live.md §6:
  1. Sign in with GitHub at /join; in an incognito window sign in with an email magic link too.
  2. /me shows your handle; /me/devices → "Generate link code" → run `npx agentriders login <code>`.
  3. /logs/new → compose a flight → /admin → approve → it is live at /logs/<slug> within ~2 min with a rider link.
  4. /admin → "Rebuild site" (needs PAGES_DEPLOY_HOOK; if it says "No deploy hook configured", create a
     Deploy Hook in the Pages project settings and set that secret).
  5. `npx agentriders log <session.jsonl> --log <slug>` → after the rebuild the Verified badge shows on /logs/<slug>.
  6. From a second account, vouch for the first; the vouch is public on both profiles.
EOF
