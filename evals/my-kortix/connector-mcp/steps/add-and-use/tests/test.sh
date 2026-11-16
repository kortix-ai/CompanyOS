#!/bin/bash
# added + connected: a connector for the DeepWiki URL exists and is connected. used: a session tool call reached it. answer: React is a JavaScript UI library (judged).
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
found = []
for c in rows(kj('connectors ls'), 'connectors'):
    detail = kj(f"connectors show {c.get('slug')}") or {}
    if 'deepwiki' in json.dumps([c, detail]).lower(): found.append(c)
open(f'{V}/connectors.json', 'w').write(json.dumps(found, indent=1))
used = [c for c in tool_calls() if re.search(r'deepwiki', c['name'] + c['input'], re.I) and not re.search(r'connectors (add|catalog)', c['input'])]
save({'added': 1 if found else 0, 'connected': 1 if any(c.get('state') == 'connected' for c in found) else 0, 'used': 1 if used else 0})
PY
judge \
  --criterion answer="The reply says that facebook/react is React, a JavaScript library for building user interfaces." \
  --input /logs/agent/response.md
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
