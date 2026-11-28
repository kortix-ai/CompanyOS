#!/bin/bash
id=$(kortix triggers ls --json | python3 -c "import json,sys; d=json.load(sys.stdin); print([t['id'] for t in d.get('runtime',[]) if 'monday client report' in json.dumps(t).lower()][0])")
kortix triggers pause "$id" >/dev/null
mkdir -p /logs/agent; echo "⏸️ Paused the Monday client report. The Friday wrap-up still runs." > /logs/agent/response.md
