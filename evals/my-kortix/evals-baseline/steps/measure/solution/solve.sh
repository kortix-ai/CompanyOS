#!/bin/bash
set -e
cd /workspace && kortix workspaces clone > /tmp/clone.txt 2>&1
dir=$(find /workspace -maxdepth 2 -name kortix.yaml | head -1 | xargs dirname)
cd "$dir"
for q in late-order damaged-cake changed-mind; do
  mkdir -p "evals/refunds/$q/tests"
  printf 'A customer writes: my order (%s) went wrong, can I get a refund? Reply to them.\n' "$q" > "evals/refunds/$q/instruction.md"
  printf 'schema_version = "1.4"\n[agent]\ntimeout_sec = 300.0\n' > "evals/refunds/$q/task.toml"
  printf '#!/bin/bash\nmkdir -p /logs/verifier\ngrep -qi "refund" /logs/agent/response.md && echo 1 > /logs/verifier/reward.txt || echo 0 > /logs/verifier/reward.txt\n' > "evals/refunds/$q/tests/test.sh"
done
git add evals && git -c user.email=oracle@example.test -c user.name=oracle commit -qm "Refund evals for support-replies"
git push -q origin HEAD
branch=$(git rev-parse --abbrev-ref HEAD)
kortix evals run --path evals/refunds --agent support-replies --ref "$branch" --json > /tmp/job.json
mkdir -p /logs/agent; echo "⏳ The baseline runs: support-replies on 3 refund tasks." > /logs/agent/response.md
