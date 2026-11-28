#!/bin/bash
# The oracle does the work the message asks for: the file on a branch, and a change request for it.
set -e
cd /workspace && kortix workspaces clone
dir=$(dirname "$(find /workspace -maxdepth 3 -name .git -type d | head -1)")
cd "$dir"
git checkout -q -b add-contributing
printf 'Run the tests before you push.\n' > CONTRIBUTING.md
git add CONTRIBUTING.md && git -c user.email=oracle@example.test -c user.name=oracle commit -qm "Add CONTRIBUTING.md"
git push -q origin add-contributing
# A just-pushed branch can take a moment to resolve on the API side: retry.
for i in 1 2 3 4 5 6; do
  kortix cr open --head add-contributing --title "Add CONTRIBUTING.md" > /tmp/cr.out 2>&1 && break
  sleep 10
done
mkdir -p /logs/agent
echo "✅ The pull request that adds CONTRIBUTING.md is open: \"Add CONTRIBUTING.md\"." > /logs/agent/response.md
