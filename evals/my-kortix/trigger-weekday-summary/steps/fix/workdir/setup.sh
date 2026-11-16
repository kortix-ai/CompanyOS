#!/bin/bash
# Break the schedule the way a person would: turn it off.
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
    """Fire it now: a session starts."""
    if t['kind'] == 'yaml':
        out = kj(f"triggers fire {t['id']} --wait 120s", timeout=200) or {}
        return out.get('status') in ('fired', 'queued') and bool(out.get('session_id'))
    out = kj(f"triggers run {t['id']}", timeout=200) or {}
    return bool(out.get('session_id') or out.get('run_id') or out.get('ok'))
for t in triggers():
    if weekday_8_berlin(t):
        print(t)
        if t['kind'] == 'yaml': print(sh(f"kortix triggers disable {t['id']} --apply 2>&1"))
        else: print(sh(f"kortix triggers pause {t['id']} 2>&1"))
PY
