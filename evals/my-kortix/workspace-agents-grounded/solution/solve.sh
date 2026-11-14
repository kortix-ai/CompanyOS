#!/bin/bash
mkdir -p /logs/agent
kortix agents ls --json | python3 -c '
import json, sys
d = json.load(sys.stdin)
rows = [r for r in (d if isinstance(d, list) else d.get("agents", [])) if r.get("name") and r.get("name") != "mykortix"]
print(f"This workspace has {len(rows)} agents besides me:")
for r in rows:
    desc = (r.get("description") or "no description set").strip()
    print(f"- **{r[\"name\"]}**: {desc}")
' > /logs/agent/response.md
