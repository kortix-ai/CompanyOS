#!/bin/bash
cat > /tmp/support.json <<"EOF"
{"behavior": {"description": "Drafts replies to customer support emails", "prompt": "You draft short, friendly replies to customer support emails. Never send anything.", "mode": "subagent", "hidden": true}}
EOF
kortix agents config support-replies --file /tmp/support.json --json >/dev/null 2>&1
