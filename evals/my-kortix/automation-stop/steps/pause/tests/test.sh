#!/bin/bash
# paused: the Monday report exists and is paused. friday_live: the Friday wrap-up is still live.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def schedules():
    data = kj('triggers ls') or {}
    found = rows(data, 'triggers') + rows(data, 'runtime')
    open(f'{V}/triggers.json', 'w').write(json.dumps(data, indent=1))
    def pick(word):
        return [t for t in found if word in json.dumps(t).lower()]
    return pick('monday client report'), pick('friday wrap-up')
def live(t):
    return t.get('state') not in ('paused', 'disabled', 'done') and t.get('enabled') is not False and not t.get('auto_paused_at')
monday, friday = schedules()
save({'paused': 1 if monday and not any(live(t) for t in monday) else 0, 'friday_live': 1 if friday and all(live(t) for t in friday) else 0})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
