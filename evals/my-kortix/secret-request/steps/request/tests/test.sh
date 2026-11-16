#!/bin/bash
# requested: a secret link was minted (`secrets request`). link: the reply carries it. no_paste: never asks for the key in chat (judged).
mkdir -p /logs/verifier
judge() { kortix evals judge "$@" || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }; }
python3 - <<'PY'
import sys; sys.path.insert(0, '/tests')
from kx import *
made = called(r'secrets\s+request')
save({'requested': 1 if made else 0, 'link': 1 if re.search(r'https?://\S+', reply()) else 0})
PY
judge \
  --criterion no_paste="The reply gives the person a link to save the key and never asks them to paste or type the key into the chat." \
  --input /logs/agent/response.md
python3 -c 'import sys; sys.path.insert(0, "/tests"); import kx; kx.finalize()'
exit 0
