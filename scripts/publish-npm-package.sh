#!/usr/bin/env bash
# Publish the npm package in the current working directory, in lockstep with the
# platform release version ($VERSION). Builds dist/, stages the published
# manifest (dist-pointing entrypoints + pinned workspace deps + version lock),
# dry-packs it, and publishes idempotently.
#
# Auth is Trusted Publishing (OIDC) when the job grants id-token, else the
# NPM_TOKEN automation token (NODE_AUTH_TOKEN). Production release jobs set
# REQUIRE_NPM_AUTH=1 and fail closed when neither credential is available.
# Local/manual runs keep the no-auth skip behavior. Re-running the same release
# is a no-op (it skips a version already on npm rather than hard-failing on E409).
#
# Run from the package directory with VERSION (and optionally NODE_AUTH_TOKEN) in
# the environment:
#
#   VERSION=1.2.3 bash ../../scripts/publish-npm-package.sh
#
set -euo pipefail

: "${VERSION:?VERSION env is required}"

# Publish only if SOME auth path is available: OIDC (id-token granted →
# ACTIONS_ID_TOKEN_REQUEST_URL set) or a fallback automation token.
if [ -z "${NODE_AUTH_TOKEN:-}" ] && [ -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ]; then
  if [ "${REQUIRE_NPM_AUTH:-0}" = "1" ]; then
    echo "::error::No npm auth (no OIDC and no NPM_TOKEN); required publication cannot continue."
    exit 1
  fi
  echo "::warning::No npm auth (no OIDC, no NPM_TOKEN) — skipping publish."
  exit 0
fi

# Trusted Publishing (OIDC) requires npm >= 11.5.1; node 22 ships npm 10. Do
# not mutate the runner's npm installation until the auth preflight passes.
# Pin to the 11.x line, NOT npm@latest: npm@12 requires node >= 22.22.2, but
# `actions/setup-node@v7` with `node-version: 22` resolves to 22.22.0, so
# `npm@latest` fails `EBADENGINE` before it can publish. This broke the
# v0.13.6 deploy-prod npm publishes (2026-08-26). 11.x satisfies the OIDC
# floor and runs on 22.22.0. Revisit when setup-node@22 ships >= 22.22.2.
npm install -g 'npm@^11.5.1'
echo "npm $(npm --version)"

name="$(node -p "require('./package.json').name")"

echo "Building ${name}@${VERSION}"
# Prefer build:bundles when the package declares one (today: @kortix/sdk,
# which also emits the tsup browser bundles — dist/kortix.esm.min.js and
# dist/kortix.global.js — that publishConfig.browser/unpkg/jsdelivr point at.
# stage-npm-publish.mjs promotes those fields and then verifies they exist in
# dist/, so they must be built before it runs, not just before `npm publish`
# (whose prepublishOnly lifecycle script fires too late for that check).
# Packages with no CDN bundle (@kortix/llm-catalog) have
# no build:bundles script and fall back to the plain build unchanged.
if node -e "process.exit(require('./package.json').scripts?.['build:bundles'] ? 0 : 1)"; then
  bun run build:bundles
else
  bun run build
fi

# Stage the manifest npm actually publishes (dist entrypoints, pinned workspace
# deps, version lock) from the package's own publishConfig, and verify dist/.
VERSION="$VERSION" node ../../scripts/stage-npm-publish.mjs

# Pack once: the tarball checked here is the tarball published, byte for byte.
pack_dir="$(mktemp -d)"
trap 'rm -rf "$pack_dir"' EXIT
pack_json="$(npm pack --json --pack-destination "$pack_dir")"
tarball="$pack_dir/$(node -e 'const p = JSON.parse(process.argv[1]); process.stdout.write(p[0].filename)' "$pack_json")"
staged_shasum="$(node -e 'const p = JSON.parse(process.argv[1]); process.stdout.write(p[0].shasum)' "$pack_json")"
echo "Staged ${name}@${VERSION}: $(basename "$tarball") sha1 ${staged_shasum}"

# Idempotent: a re-run of the same release must not hard-fail on E409. A
# rebuilt dist/ is not guaranteed byte-identical, so a different shasum on a
# re-run is reported, not fatal; the first publish is the one checked below.
if npm view "${name}@${VERSION}" version >/dev/null 2>&1; then
  published="$(npm view "${name}@${VERSION}" dist.shasum 2>/dev/null || true)"
  if [ "$published" != "$staged_shasum" ]; then
    echo "::warning::${name}@${VERSION} is already on npm with sha1 ${published}; this run staged ${staged_shasum}. Skipping (idempotent re-run)."
  else
    echo "${name}@${VERSION} already on npm with the staged bytes — skipping (idempotent re-run)."
  fi
  exit 0
fi

# With TP configured + OIDC available, npm publishes via OIDC (+provenance) and
# ignores the token; otherwise it falls back to NODE_AUTH_TOKEN.
npm publish "$tarball"

# The registry must hold exactly the staged bytes. Its metadata can lag a few
# seconds behind the publish, so read it until it answers (at most ~60 s).
published=""
for _ in $(seq 1 12); do
  published="$(npm view "${name}@${VERSION}" dist.shasum 2>/dev/null || true)"
  [ -n "$published" ] && break
  sleep 5
done
if [ "$published" != "$staged_shasum" ]; then
  echo "::error::${name}@${VERSION}: the registry serves sha1 '${published}', the staged tarball is ${staged_shasum}."
  exit 1
fi
echo "Published ${name}@${VERSION} ✅ (registry sha1 matches the staged tarball)"
