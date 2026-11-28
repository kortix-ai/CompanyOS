#!/bin/bash
# shared: the sign-in started is the shared workspace one (connect with shared, or --owner project), not a personal one.
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
def shared_request():
    """A Notion sign-in this session started for the workspace (owner project), read from the API."""
    base = re.sub(r'/v1/?$', '', agent_env('KORTIX_API_URL').rstrip('/'))
    url = f"{base}/v1/connectors/workspaces/{agent_env('KORTIX_PROJECT_ID')}/sessions/{SESSION}/connect-requests"
    out = sh(f"curl -s -m 30 -H {json.dumps('Authorization: Bearer ' + agent_env('KORTIX_TOKEN'))} {json.dumps(url)}")
    open(f'{V}/connect-requests.json', 'w').write(out)
    try:
        data = json.loads(out)
    except ValueError:
        return False
    found = data if isinstance(data, list) else (data.get('connectors') or data.get('requests') or data.get('items') or [])
    return any('notion' in json.dumps(r).lower() and str(r.get('owner_type')) == 'project' for r in found)
save({'shared': 1 if called(r'"shared":\s*true|"for_trigger":\s*true|--owner(=|\s+)project') or shared_request() else 0})
PY
[ $? = 0 ] || { echo "the grader crashed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
