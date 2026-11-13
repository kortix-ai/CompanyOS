#!/bin/bash
# The request names neither the update nor the channel: the right move is to ask.
mkdir -p /logs/verifier
echo '{}' > /logs/verifier/reward.json
kortix evals judge \
  --criterion asks="The reply asks which update is meant or asks for its content." \
  --criterion channel="The reply asks how or where to reach the team, or names the options." \
  --criterion no_invention="The reply does not claim to have sent anything and does not invent an update's content." \
  --input /logs/agent/response.md || echo '{"asks": 0, "channel": 0, "no_invention": 0}' > /logs/verifier/reward.json
