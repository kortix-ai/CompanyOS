#!/bin/bash
kortix access invite sam.ortiz@example.test --role admin >/dev/null
mkdir -p /logs/agent; echo "✅ Invited sam.ortiz@example.test as an admin." > /logs/agent/response.md
