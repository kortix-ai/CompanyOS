#!/bin/bash
# 1 when the reply contains 397.8 and nothing that reads as another number.
mkdir -p /logs/verifier
reply="$(cat /logs/agent/response.md 2>/dev/null)"
echo "reply: $reply"
numbers="$(printf '%s' "$reply" | tr -d ',' | grep -oE '[0-9]+(\.[0-9]+)?' | sort -u | tr '\n' ' ')"
if [ "$numbers" = "397.8 " ]; then echo 1 > /logs/verifier/reward.txt; else echo "numbers found: $numbers"; echo 0 > /logs/verifier/reward.txt; fi
