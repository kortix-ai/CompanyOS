#!/bin/bash
id=$(kortix access pending --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([i['invite_id'] for i in d.get('pending',[]) if 'sam.reyes' in i.get('email','')][0])")
kortix access cancel "$id" >/dev/null && kortix access invite sam.reyes@example.test --role manager >/dev/null
mkdir -p /logs/agent; echo "✅ Sam's invitation is now as a manager; the member one is cancelled." > /logs/agent/response.md
