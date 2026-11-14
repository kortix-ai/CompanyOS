#!/bin/bash
# has_loop: the session has a Loop. schedule: it fires Mondays at 9:00 Berlin time (judged from the stored Loop).
mkdir -p /logs/verifier
kortix loops ls --session "$KORTIX_SESSION_ID" --json > /logs/verifier/loops.json 2>/logs/verifier/loops.err
cat /logs/verifier/loops.json
has_loop=$(python3 -c 'import json,sys
try:
    d = json.load(open("/logs/verifier/loops.json"))
    items = d if isinstance(d, list) else (d.get("loops") or d.get("reminders") or [])
    print(1 if items else 0)
except Exception:
    print(0)')
echo "{\"has_loop\": $has_loop}" > /logs/verifier/reward.json
[ "$has_loop" = 1 ] || { echo '{"has_loop": 0, "schedule": 0}' > /logs/verifier/reward.json; exit 0; }
kortix evals judge \
  --criterion schedule="A loop fires every Monday at 09:00 in Europe/Berlin (a cron like 0 9 * * 1 with that timezone, or the same in words), and its prompt is about reviewing weekly metrics." \
  --input /logs/verifier/loops.json || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
