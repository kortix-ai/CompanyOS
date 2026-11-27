#!/bin/bash
# ran: it ran at least once (its test). live: the trigger is active; or, when the test exposed something that blocks the schedule (a scheduled run cannot write to a private Drive folder), held_for_blocker: it stays paused and the reply names the blocker and asks for the fix (judged).
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def digests():
    data = kj('triggers ls') or {}
    found = [t for t in rows(data, 'triggers') + rows(data, 'runtime') if (t.get('target') or {}).get('kind') != 'session' and re.search(r'(^|\s)9\s+\*\s+\*\s+(1-5|MON-FRI)', str(t.get('cron') or (t.get('source') or {}).get('cron') or ''), re.I)]
    open(f'{V}/triggers.json', 'w').write(json.dumps({'matched': found, 'all': data, 'loops': kj('loops ls')}, indent=1))
    return found
def live(t):
    return t.get('state') not in ('paused', 'disabled', 'done') and t.get('enabled') is not False and not t.get('auto_paused_at')
def ran(t):
    return any(t.get(k) for k in ('last_fired_at', 'last_status', 'last_run_at', 'last_event_at'))
def london(t):
    return 'london' in str(t.get('timezone') or (t.get('source') or {}).get('timezone') or '').lower()
found = digests()
if found and all(live(t) for t in found):
    save({'live': 1, 'ran': 1 if any(ran(t) for t in found) else 0})
else:
    save({'ran': 1 if any(ran(t) for t in found) else 0, 'paused': 1 if found and not any(live(t) for t in found) else 0})
    open(f'{V}/held.flag', 'w').write('paused after the test')
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
if [ -f /logs/verifier/held.flag ]; then
  judge \
    --criterion held_for_blocker="The reply says the test ran, names a concrete thing that keeps the schedule from working unattended (for example a scheduled run cannot write to a private Drive folder), keeps it paused, and asks the person for what it needs. It does not call the schedule live." \
    --input /logs/agent/response.md
fi
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
