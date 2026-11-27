#!/bin/bash
kortix triggers add leads-welcome --type=webhook --secret-env=LEADS_SECRET --agent=worker --prompt="Write a short welcome note for {{ body.name }}." --filter=body.plan=enterprise --disabled --apply >/dev/null
mkdir -p /logs/agent; echo "✅ Saved, paused: enterprise leads only. Not running yet: I test it first." > /logs/agent/response.md
