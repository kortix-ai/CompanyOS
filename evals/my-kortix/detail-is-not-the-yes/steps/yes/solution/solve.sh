#!/bin/bash
kortix access invite sam.ortiz@example.test --role member >/dev/null
mkdir -p /logs/agent; echo "✅ Invited sam.ortiz@example.test as a member." > /logs/agent/response.md
