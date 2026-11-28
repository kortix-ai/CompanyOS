#!/bin/bash
cat > /tmp/sd.json <<"EOF"
{"behavior": {"description": "Drafts replies to customer emails", "prompt": "Write replies to customer emails as Gmail drafts. Never send.", "mode": "subagent", "hidden": true}, "connectors": ["gmail"]}
EOF
kortix agents config support-drafts --file /tmp/sd.json --json >/dev/null
kortix connectors policy gmail set "send_*" ask >/dev/null
mkdir -p /logs/agent; echo "✅ support-drafts is set up with Gmail. A Gmail rule now holds every send for your approval, so it can draft but nothing goes out without your yes." > /logs/agent/response.md
