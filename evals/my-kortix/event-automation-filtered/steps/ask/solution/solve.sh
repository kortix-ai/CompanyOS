#!/bin/bash
mkdir -p /logs/agent; cat > /logs/agent/response.md <<"EOF"
🙋 That adds a webhook automation: each signed lead on the enterprise plan starts a worker session that writes a welcome note; other plans are skipped. Each run uses credits. It stays paused until I test it. Set it up?
EOF
