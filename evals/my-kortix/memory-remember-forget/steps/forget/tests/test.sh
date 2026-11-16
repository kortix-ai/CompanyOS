#!/bin/bash
# forgot: no page mentions the bakery any more. kept: the bullet-list preference is still there.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def memory_text():
    """Every page My Kortix keeps about this person, as text."""
    text = ''
    for f in drive_files('~/Memory/mykortix', depth=1):
        path = f.get('path') or f"~/Memory/mykortix/{f.get('name')}"
        text += f"\n---\n{path}\n" + sh(f"kortix drive cat {json.dumps(path)} 2>/dev/null")
    open(f'{V}/memory.txt', 'w').write(text)
    return text
text = memory_text().lower()
save({'forgot': 0 if 'bakery' in text else 1, 'kept': 1 if 'bullet' in text else 0})
PY
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
