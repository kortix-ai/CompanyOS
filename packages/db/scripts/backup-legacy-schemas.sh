#!/usr/bin/env bash
# Back up the Suna-era schemas (`public` and `basejump`) to a private S3 bucket before
# packages/db/migrations-pending/drop_legacy_suna_schemas.sql.pending drops them.
#
#   backup-legacy-schemas.sh bucket <bucket> <region> <expire_days|never>
#       Create the bucket: private (Block Public Access), versioned, SSE-KMS with a bucket
#       key, TLS only, tagged, and a lifecycle rule that deletes the backup <expire_days>
#       after upload ("never": no expiry). Run once per environment.
#
#   DATABASE_URL=<postgres url> backup-legacy-schemas.sh dump <bucket> <region> [rate]
#       Dump three custom-format archives (public.messages, public.documents, and the rest
#       of public + basejump), each streamed through `pv -L <rate>` (default 40m = 40 MB/s,
#       about a third of prod's 125 MiB/s disk throughput) and zstd to
#       s3://<bucket>/<yyyymmdd>/<part>.dump.zst. Then it lists each archive's table of
#       contents back from S3 and checks that every table has a TABLE DATA entry.
#
# Why three archives: pg_dump holds one snapshot for its whole run, and a snapshot that old
# keeps VACUUM from cleaning every hot table in the database. One archive per big table keeps
# the longest snapshot to the time public.messages takes (~45 min at 40 MB/s on prod).
#
# Needs: pg_dump/pg_restore of the server's major version or newer, pv, zstd, aws (CLI v2).
# Runs anywhere that reaches the database and S3; nothing is written to local disk.
# Restore: `aws s3 cp s3://<bucket>/<day>/<part>.dump.zst - | zstd -dc | pg_restore -d <url>`,
# rest.dump first (it holds the schemas and types), then messages and documents.
set -euo pipefail

die() { echo "backup-legacy-schemas: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed"; }

cmd="${1:-}"; bucket="${2:-}"; region="${3:-}"
[ -n "$cmd" ] && [ -n "$bucket" ] && [ -n "$region" ] || die "usage: $0 bucket|dump <bucket> <region> [expire_days|never|rate]"
need aws

case "$cmd" in
  bucket)
    expire="${4:-}"
    [ -n "$expire" ] || die "bucket needs <expire_days|never>"
    if [ "$region" = "us-east-1" ]; then
      aws s3api create-bucket --bucket "$bucket" --region "$region"
    else
      aws s3api create-bucket --bucket "$bucket" --region "$region" --create-bucket-configuration "LocationConstraint=$region"
    fi
    aws s3api put-public-access-block --bucket "$bucket" --region "$region" \
      --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws s3api put-bucket-ownership-controls --bucket "$bucket" --region "$region" \
      --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
    aws s3api put-bucket-versioning --bucket "$bucket" --region "$region" --versioning-configuration Status=Enabled
    aws s3api put-bucket-encryption --bucket "$bucket" --region "$region" --server-side-encryption-configuration \
      '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'
    aws s3api put-bucket-policy --bucket "$bucket" --region "$region" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"DenyInsecureTransport\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::$bucket\",\"arn:aws:s3:::$bucket/*\"],\"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
    aws s3api put-bucket-tagging --bucket "$bucket" --region "$region" --tagging \
      'TagSet=[{Key=ManagedBy,Value=manual},{Key=Project,Value=kortix},{Key=Service,Value=legacy-suna-backup},{Key=DataClass,Value=customer-content}]'
    if [ "$expire" = "never" ]; then
      rules='{"Rules":[{"ID":"abort-incomplete-uploads","Status":"Enabled","Filter":{},"AbortIncompleteMultipartUpload":{"DaysAfterInitiation":2}}]}'
    else
      [[ "$expire" =~ ^[0-9]+$ ]] || die "expire_days must be a number or never"
      rules="{\"Rules\":[{\"ID\":\"expire-backup\",\"Status\":\"Enabled\",\"Filter\":{},\"Expiration\":{\"Days\":$expire},\"NoncurrentVersionExpiration\":{\"NoncurrentDays\":1},\"AbortIncompleteMultipartUpload\":{\"DaysAfterInitiation\":2}},{\"ID\":\"expired-delete-markers\",\"Status\":\"Enabled\",\"Filter\":{},\"Expiration\":{\"ExpiredObjectDeleteMarker\":true}}]}"
    fi
    aws s3api put-bucket-lifecycle-configuration --bucket "$bucket" --region "$region" --lifecycle-configuration "$rules"
    echo "bucket s3://$bucket ready (region $region, expiry: $expire)"
    ;;

  dump)
    rate="${4:-40m}"
    [ -n "${DATABASE_URL:-}" ] || die "set DATABASE_URL"
    need pg_dump; need pg_restore; need pv; need zstd; need psql
    day="$(date -u +%Y%m%d)"
    # pg_dump keeps a transaction open; the postgres role ends idle transactions after 20 s on prod.
    export PGOPTIONS="-c statement_timeout=0 -c idle_in_transaction_session_timeout=0 -c lock_timeout=30s"
    tables_in() { psql "$DATABASE_URL" -Atc "select count(*) from pg_class c where c.relkind in ('r','p') and not c.relispartition and c.relnamespace in ('public'::regnamespace, 'basejump'::regnamespace) $1"; }

    dump_part() {
      local part="$1" expected="$2"; shift 2
      local key="s3://$bucket/$day/$part.dump.zst"
      echo "[$part] dumping to $key at $rate"
      # -Z0: pg_dump does not compress, so pv limits the bytes the server reads; zstd compresses after.
      pg_dump --format=custom --compress=0 --no-owner --no-privileges --lock-wait-timeout=30s "$@" "$DATABASE_URL" \
        | pv -L "$rate" -i 30 -f \
        | zstd -q -T0 -10 \
        | aws s3 cp - "$key" --region "$region" --expected-size 500000000000 --sse aws:kms
      echo "[$part] uploaded: $(aws s3api head-object --bucket "$bucket" --key "$day/$part.dump.zst" --region "$region" --query ContentLength --output text) bytes"
      local listed
      # pg_restore exits once it has read the table of contents; aws then stops on the closed pipe.
      listed="$( (aws s3 cp "$key" - --region "$region" 2>/dev/null || true) | (zstd -dcq 2>/dev/null || true) | pg_restore --list | grep -c ' TABLE DATA ' || true)"
      [ "$listed" = "$expected" ] || die "[$part] archive lists $listed TABLE DATA entries, expected $expected"
      echo "[$part] table of contents: $listed of $expected tables"
    }

    dump_part messages 1 --table=public.messages
    dump_part documents 1 --table=public.documents
    rest="$(tables_in "and c.oid not in ('public.messages'::regclass, 'public.documents'::regclass)")"
    dump_part rest "$rest" --schema=public --schema=basejump --exclude-table-data=public.messages --exclude-table-data=public.documents
    echo "done: s3://$bucket/$day/{messages,documents,rest}.dump.zst"
    ;;

  *) die "unknown command $cmd (bucket|dump)" ;;
esac
