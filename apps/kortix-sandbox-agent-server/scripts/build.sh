#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist

if [ -n "${BUN_COMPILE_TARGET:-}" ]; then
  target="$BUN_COMPILE_TARGET"
else
  # Default to bun-linux-x64. Daytona's standard runners are x86_64 and the
  # snapshot builder COPYs this binary verbatim into the per-project image —
  # using the host architecture (e.g. arm64 on Apple Silicon dev machines)
  # ships an ELF the sandbox runner can't execute, the daemon never binds
  # port 8000, and every proxied request 502s. Override with
  # BUN_COMPILE_TARGET if you genuinely need a different arch (e.g. local
  # docker on Apple Silicon).
  target="bun-linux-x64"
fi

case "$target" in
  bun-linux-x64|bun-linux-arm64) ;;
  *)
    echo "Unsupported Bun compile target: $target" >&2
    exit 1
    ;;
esac

compile_with_retry() {
  local attempt=1
  local max_attempts=4
  local delay=5
  # The module list of the bundle, next to the binary: `pnpm worktree start` (scripts/worktree/lib/services.ts,
  # agentArtifactCurrent) skips this build when the binary is newer than every module in it. Only on a Bun
  # that has the flag; without the file the worktree always rebuilds.
  local meta_args=()
  if bun build --help 2>/dev/null | grep -q -- '--metafile'; then meta_args=(--metafile="$next.meta.json"); fi

  while true; do
    # pi's two workers are extra entrypoints: in a compiled binary pi starts them as
    # `./src/extensions/codemode/worker.ts` and `./src/utils/image-resize-worker.ts`, resolved
    # against `--root` (default: the entrypoints' common folder, `src/`, which would not match).
    # `--bytecode` ships the parsed modules, so a box does not parse ~2,500 modules on every daemon
    # start: exec to the first line of `main()` measured 485 ms cold before, 134-334 ms after, on a
    # Platinum box (2026-11-03). It needs `--format=esm`: the default CJS bytecode fails at runtime
    # on `import.meta` ("import.meta is only valid inside modules").
    if bun build --compile --bytecode --format=esm --root=. --target="$target" --tsconfig-override ./tsconfig.json ${meta_args[@]+"${meta_args[@]}"} --outfile="$next" src/main.ts src/extensions/codemode/worker.ts src/utils/image-resize-worker.ts; then
      return 0
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "bun build --compile failed after ${max_attempts} attempts" >&2
      return 1
    fi

    echo "bun build --compile failed on attempt ${attempt}/${max_attempts}; retrying in ${delay}s..." >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# Typecheck BEFORE the bundler runs. `bun build --compile` is a bundler — it
# does NOT typecheck, so a name referenced but never declared (e.g. a variable
# dropped during a merge while its use survived) compiles cleanly into a binary
# that throws ReferenceError at runtime. That exact class once shipped a daemon
# that crashed during restored-snapshot startup (2026-06-19) → port
# 8000 never rebound → every proxied request 502'd → sandboxes stuck at
# "Starting the agent" forever. Gate the compile on a clean tsc so it can never
# recur.
# The typecheck runs beside the compile (6 vCPU Kortix session, 2026-11-27: 9.7-9.8 s one after the other, 6.3-6.8 s
# side by side) and still gates it: the compile writes to $next, which replaces dist/kortix-agent only once both
# have passed, so a failed typecheck leaves the previous binary exactly as a typecheck before the compile did.
next=dist/.kortix-agent.next
rm -f "$next" "$next.meta.json"
echo "Typechecking (tsc --noEmit) beside the compile…"
bun run typecheck &
typecheck_pid=$!
compile_status=0
compile_with_retry || compile_status=$?
typecheck_status=0
wait "$typecheck_pid" || typecheck_status=$?
if [ "$typecheck_status" -ne 0 ] || [ "$compile_status" -ne 0 ]; then
  rm -f "$next" "$next.meta.json"
  [ "$typecheck_status" -eq 0 ] || echo "typecheck failed: no binary built" >&2
  exit 1
fi
if [ -f "$next.meta.json" ]; then mv -f "$next.meta.json" dist/kortix-agent.meta.json; fi
mv -f "$next" dist/kortix-agent
chmod +x dist/kortix-agent

# Invalidate the snapshot builder's source-staleness memo (dist/kortix-agent.srchash,
# see apps/api/src/snapshots/build-context.ts `agentBinaryStale`). This freshly
# compiled binary IS current, so the guard must re-memoize the source hash from
# it rather than trust a stale record from a previous build.
rm -f dist/kortix-agent.srchash

# The product name is `kortixd`. `dist/kortixd` is the primary artifact — what
# install.sh downloads and what `kortixd install/update` manage on a normal
# machine. `dist/kortix-agent` is KEPT as a compatibility name: it is the
# load-bearing on-disk contract for already-deployed boxes and the snapshot
# bake (apps/sandbox/Dockerfile COPYs dist/kortix-agent → /usr/local/bin/
# kortix-agent, entrypoint.sh treats that path as the immutable floor, and the
# API serves it as the runtime-assets `/agent` artifact). Renaming that path is
# a fleet migration, not a build change, so both names ship from one compile.
cp -f dist/kortix-agent dist/kortixd
chmod +x dist/kortixd

size="$(stat -f%z dist/kortix-agent 2>/dev/null || stat -c%s dist/kortix-agent)"
echo "Built dist/kortixd (+ compat dist/kortix-agent) for ${target} (${size} bytes)"
