#!/bin/bash
# The person fills in the link: the secret gets its value.
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def secret_name():
    """The name My Kortix asked the person to fill in: from its `secrets request NAME` call."""
    for c in tool_calls():
        m = re.search(r'secrets\s+request\s+([A-Z][A-Z0-9_]*)', c['input'])
        if m: return m.group(1)
    return 'ACME_API_KEY'

def secret_value():
    """What the person typed into the link, derived from the trial: the agent never saw how."""
    import hashlib
    return hashlib.sha256(f"{os.environ.get('KORTIX_EVAL_TRIAL_ID', '')}:acme-bench".encode()).hexdigest()[:32]
name = secret_name()
print(name, sh(f"printf %s {secret_value()} | kortix secrets set {name}=- 2>&1"))
PY
