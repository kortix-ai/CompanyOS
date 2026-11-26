#!/bin/bash
# no_trigger: nothing scheduled before the yes (it runs unattended: ask once). asked: one question.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def digests():
    data = kj('triggers ls') or {}
    found = [t for t in rows(data, 'triggers') + rows(data, 'runtime') if t.get('target', {}).get('kind') != 'session' and re.search(r'(^|\s)9\s+\*\s+\*\s+(1-5|MON-FRI)', str(t.get('cron') or (t.get('source') or {}).get('cron') or ''), re.I)]
    open(f'{V}/triggers.json', 'w').write(json.dumps(found, indent=1))
    return found
def live(t):
    return t.get('state') not in ('paused', 'disabled', 'done') and t.get('enabled') is not False and not t.get('auto_paused_at')
def ran(t):
    return any(t.get(k) for k in ('last_fired_at', 'last_status', 'last_run_at', 'last_event_at'))
def london(t):
    return 'london' in str(t.get('timezone') or (t.get('source') or {}).get('timezone') or '').lower()
save({'no_trigger': 0 if digests() else 1, 'asked': 1 if asked_person() else 0})
PY
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
