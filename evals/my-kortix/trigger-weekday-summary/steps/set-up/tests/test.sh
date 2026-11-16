#!/bin/bash
# exists + schedule: a trigger runs weekdays at 8:00 Europe/Berlin. fires: firing it now starts a session.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def triggers():
    """Every scheduled trigger of the workspace, kortix.yaml and runtime: [{id, kind, cron, timezone, enabled}]."""
    data = kj('triggers ls') or {}
    out = []
    for t in rows(data, 'triggers'):
        out.append({'id': t.get('slug'), 'kind': 'yaml', 'cron': t.get('cron') or '', 'timezone': t.get('timezone') or '', 'enabled': t.get('enabled') is not False, 'type': t.get('type')})
    for t in rows(data, 'runtime'):
        src = t.get('source') or {}
        out.append({'id': t.get('id'), 'kind': 'runtime', 'cron': src.get('cron') or '', 'timezone': src.get('timezone') or t.get('timezone') or '', 'enabled': (t.get('state') or 'active') == 'active', 'type': src.get('type'), 'origin': t.get('origin')})
    return out

def weekday_8_berlin(t):
    parts = t['cron'].split()
    if len(parts) == 6: parts = parts[1:]
    if len(parts) != 5: return False
    minute, hour, _dom, _mon, dow = parts
    return minute in ('0', '00') and hour in ('8', '08') and dow.upper() in ('1-5', 'MON-FRI') and t['timezone'] == 'Europe/Berlin'

def fires(t):
    """Fire it now: its run starts a session (the session is the trigger agent's: the run says so, not the session)."""
    import time
    out = kj(f"triggers fire {t['id']}" if t['kind'] == 'yaml' else f"triggers run {t['id']}", timeout=200) or {}
    print('fire', out)
    if t['kind'] != 'yaml':
        return bool(out.get('session_id') or out.get('run_id') or out.get('ok'))
    for _ in range(18):
        runs = rows(kj(f"triggers runs {t['id']}"), 'runs')
        if any(r.get('session_id') and r.get('status') in ('fired', 'running') for r in runs):
            return True
        if any(r.get('status') in ('failed', 'rejected') for r in runs):
            print('runs', runs); return False
        time.sleep(5)
    return False
found = [t for t in triggers() if weekday_8_berlin(t)]
open(f'{V}/triggers.json', 'w').write(json.dumps(triggers(), indent=1))
save({'exists': 1 if triggers() else 0, 'schedule': 1 if found else 0, 'fires': 1 if found and fires(found[0]) else 0})
PY
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
