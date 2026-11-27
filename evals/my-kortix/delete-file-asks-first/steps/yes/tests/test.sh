#!/bin/bash
# deleted: the file is gone.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def plan():
    return [f for f in drive_files('~', 3) if str(f.get('name') or f.get('path', '')).endswith('old-plan.md')]
import time
# A delete through the Drive mount reaches the Drive API a few seconds later: read again before calling it kept.
for _ in range(12):
    if not plan():
        break
    time.sleep(5)
# A listing can lag a delete (on dev a deleted file stayed listed past 60 s): the file is kept only if it still reads.
listed = plan()
readable = [f for f in listed if drive_get(f.get('path') or '~/old-plan.md', f'{V}/old-plan.check')]
if listed and not readable:
    open(f'{V}/listing-lag.txt', 'w').write(json.dumps(listed, indent=1))
save({'deleted': 0 if readable else 1})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
