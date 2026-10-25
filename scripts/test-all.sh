#!/usr/bin/env bash
# Every test suite in the repo, in one go: npm test (from the repo root).
# Runs all of them even if one fails, then prints a summary; exits non-zero on any failure.
# Installs a package's dependencies first if its node_modules is missing.
# The HTTP smoke test is separate (it resets the dev database): see scripts/smoke.sh.
cd "$(dirname "$0")/.." || exit 1
results=()
fail=0
step() {
  local name=$1 dir=$2; shift 2
  [ -d "$dir/node_modules" ] || (cd "$dir" && npm install --no-audit --no-fund >/dev/null 2>&1)
  echo "== $name"
  if (cd "$dir" && "$@"); then results+=("ok    $name"); else results+=("FAIL  $name"); fail=1; fi
}
step "agent: syntax"      agent    npm run -s check
step "agent: tests"       agent    npm test
step "detector: tests"    detector npm test
step "web: typecheck"     web      npm run -s typecheck
step "web: tests"         web      npx vitest run
step "web: lint"          web      npm run -s lint
echo
printf '%s\n' "${results[@]}"
exit $fail
