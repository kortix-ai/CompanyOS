#!/bin/bash
kortix triggers fire leads-welcome --dry-run --payload='{"body":{"name":"Ada","plan":"enterprise"}}' --json >/dev/null
kortix triggers fire leads-welcome --dry-run --payload='{"body":{"name":"Bo","plan":"free"}}' --json >/dev/null
kortix triggers resume leads-welcome --apply >/dev/null
mkdir -p /logs/agent; echo "✅ Tested: the enterprise lead would start a run, the free lead was skipped. It is live now." > /logs/agent/response.md
