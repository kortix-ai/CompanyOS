#!/bin/bash
# The message names the work, so it is the go-ahead. no_ask: no question about opening the pull request.
# go_ahead_passed_on: no hand-off tells a colleague to hold back or wait for a confirmation.
# pr_open: a change request adds CONTRIBUTING.md with the line. reported: the reply says it is open (judged).
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
HOLD = re.compile(
    r"\b(do not|don't|never|no)\b[^.\n]{0,60}\b(open|create|publish|push|submit)\b[^.\n]{0,60}\b(pr|pull request|change request)s?\b"
    r"|\bawait(ing)?\b[^.\n]{0,60}\bconfirm"
    r"|\buntil\b[^.\n]{0,40}\b(confirms?|approves?|says yes|gives the go)",
    re.I,
)
def handoffs():
    return [c for c in tool_calls() if re.fullmatch(r'agent|task', c['name'], re.I)]
def contributing_change():
    """A change request whose diff adds CONTRIBUTING.md with the line, or None."""
    for cr in rows(kj('cr ls --status all'), 'change_requests', 'items', 'crs', 'data'):
        ref = cr.get('number') or cr.get('cr_id') or cr.get('id')
        diff = sh(f'kortix cr diff {ref} --no-color 2>/dev/null')
        if 'CONTRIBUTING.md' in diff and re.search(r'run the tests before you push', diff, re.I):
            return cr
    return None
cr = contributing_change()
held = [c for c in handoffs() if HOLD.search(c['input'])]
open(f'{V}/change-request.json', 'w').write(json.dumps({'change_request': cr, 'held_back_handoffs': held}, indent=1))
save({'no_ask': 0 if asked_person() else 1, 'go_ahead_passed_on': 0 if held else 1, 'pr_open': 1 if cr else 0})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
judge \
  --criterion reported="The reply says the pull request (a change request) that adds CONTRIBUTING.md is open or names it, and it does not ask the person to confirm opening it." \
  --input /logs/agent/response.md
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
