#!/bin/bash
mkdir -p /tmp/repo && cd /tmp/repo && kortix workspaces clone "$KORTIX_PROJECT_ID" ws >/dev/null 2>&1 && cd ws
mkdir -p skills/refund-policy && cat > skills/refund-policy/SKILL.md <<"EOF"
---
name: refund-policy
description: The shop's refund policy. Load it before answering any refund question.
---
- Refunds within 30 days of purchase, with a receipt.
- After 30 days: store credit, no refund.
- No refunds on sale items.
EOF
python3 - <<"PY2"
p = 'kortix.yaml'; s = open(p).read()
s = s.replace('skills:\n', 'skills:\n  refund-policy: skills/refund-policy\n', 1)
open(p, 'w').write(s)
PY2
git add -A && git commit -qm "Add the refund-policy skill" && git push -q origin HEAD:main
cat > /tmp/support.json <<"EOF"
{"behavior":{"prompt":"You draft replies to customers. Follow the refund-policy skill. You never send anything yourself: a person reviews and sends every reply.","description":"Drafts customer replies","mode":"subagent","hidden":true},"skills":["refund-policy"],"tools":["read","write"]}
EOF
kortix agents config support-replies --file /tmp/support.json --json
mkdir -p /logs/agent; echo "✅ Added the refund-policy skill and the support-replies agent: drafts only, no secrets." > /logs/agent/response.md
