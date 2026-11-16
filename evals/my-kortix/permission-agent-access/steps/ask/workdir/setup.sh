#!/bin/bash
# A reporter agent with no secrets, and the workspace's warehouse token.
cat > /tmp/agent.json <<'JSON'
{"behavior": {"description": "Writes the weekly stock report.", "prompt": "You write the weekly stock report from the warehouse system."}, "secrets": "none"}
JSON
kortix agents config reporter --file /tmp/agent.json
printf %s "wh-$(date +%s%N | sha256sum | head -c 24)" | kortix secrets set WAREHOUSE_TOKEN=-
