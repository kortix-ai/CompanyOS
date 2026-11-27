#!/bin/bash
# saved: one webhook automation exists with a filter on the enterprise plan. not_live_untested: it is paused.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def hooks():
    data = kj('triggers ls') or {}
    found = [t for t in rows(data, 'triggers') + rows(data, 'runtime') if str(t.get('type') or (t.get('source') or {}).get('kind') or '').lower() == 'webhook' or 'webhook' in str(t.get('source') or '').lower()]
    open(f'{V}/triggers.json', 'w').write(json.dumps(data, indent=1))
    return found
def live(t):
    return t.get('state') not in ('paused', 'disabled', 'done') and t.get('enabled') is not False and not t.get('auto_paused_at')
def enterprise(t):
    return 'enterprise' in json.dumps(t.get('filter') or (t.get('source') or {}).get('filter') or {}).lower()
found = hooks()
save({'saved': 1 if len(found) == 1 and enterprise(found[0]) else 0, 'not_live_untested': 1 if found and not any(live(t) for t in found) else 0})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
