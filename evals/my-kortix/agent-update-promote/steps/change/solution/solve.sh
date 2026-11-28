#!/bin/bash
kortix agents config support-replies --json | python3 -c "
import json,sys
cfg=json.load(sys.stdin); b=cfg.get('block') or {}; be=dict(b.get('behavior') or {})
be.update(mode='primary', model='kortix/glm-5.3-flash'); be.pop('hidden', None); b['behavior']=be
json.dump(b, open('/tmp/b.json','w'))"
kortix agents config support-replies --file /tmp/b.json --json >/dev/null
mkdir -p /logs/agent; echo "✅ support-replies is in the agent picker now and runs on GLM 5.3 Flash. Its instructions are unchanged." > /logs/agent/response.md
