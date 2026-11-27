#!/bin/bash
# consistent: the reply matches the state the grader read (judged against state.json).
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def writer():
    return (kj('agents config content-writer') or {}).get('block') or {}
def ana():
    return [i for i in rows(kj('access pending'), 'pending') if 'ana@example.test' in json.dumps(i).lower()]
def report():
    data = kj('triggers ls') or {}
    found = [t for t in rows(data, 'triggers') + rows(data, 'runtime') if (t.get('target') or {}).get('kind') != 'session' and re.search(r'(^|\s)9\s+\*\s+\*\s+(1|MON)\b', str(t.get('cron') or (t.get('source') or {}).get('cron') or ''), re.I)]
    open(f'{V}/state.json', 'w').write(json.dumps({'writer': writer(), 'ana': ana(), 'report': found}, indent=1))
    return found
def live(t):
    return t.get('state') not in ('paused', 'disabled', 'done') and t.get('enabled') is not False and not t.get('auto_paused_at')
def ran(t):
    return any(t.get(k) for k in ('last_fired_at', 'last_status', 'last_run_at', 'last_event_at'))
none = lambda v: v in (None, 'none', [], '')
report()
st = json.load(open(f'{V}/state.json'))
open(f'{V}/judge-input.md', 'w').write(reply() + '\n\n---\nWorkspace state (read by the grader):\n' + json.dumps(st, indent=1)[:6000])
save({})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
judge \
  --criterion consistent="Compare the reply (above the line) with the workspace state below it. The reply says the content-writer agent exists; says whether the Monday report is live or paused, matching the state; says Ana has an open invitation she has not accepted yet; and claims nothing the state does not show." \
  --input /logs/verifier/judge-input.md
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
