#!/bin/bash
# startable: support-replies is a primary agent and not hidden. model: it runs on kortix/glm-5.3-flash. kept_prompt: its instructions are unchanged.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def support():
    cfg = kj('agents config support-replies') or {}
    open(f'{V}/support-replies.json', 'w').write(json.dumps(cfg, indent=1))
    block = cfg.get('block') or {}
    return block, (block.get('behavior') or {})
block, behavior = support()
save({'startable': 1 if behavior.get('mode') in ('primary', 'all') and not behavior.get('hidden') else 0,
      'model': 1 if 'glm-5.3-flash' in str(behavior.get('model') or '') else 0,
      'kept_prompt': 1 if 'Never send anything' in str(behavior.get('prompt') or '') else 0})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
