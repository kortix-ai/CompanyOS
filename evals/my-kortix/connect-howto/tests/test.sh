#!/bin/bash
# The answer points to the real place (Connectors) or starts the connection, and invents no step.
mkdir -p /logs/verifier
echo '{}' > /logs/verifier/reward.json
kortix evals judge \
  --criterion where="The reply sends the user to Connectors in the workspace settings (Customize), or starts or offers to start the Slack connection for them, for example with a sign-in link." \
  --criterion no_invention="The reply does not invent menus, API keys or steps that a Kortix user would not see." \
  --criterion short="The reply is a few sentences or a short list, not an essay." \
  --input /logs/agent/response.md || { echo "kortix evals judge failed: no reward, so the trial counts as an error, not a 0"; rm -f /logs/verifier/reward.json; exit 1; }
