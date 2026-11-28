#!/bin/bash
kortix connectors catalog install kortix:notion --json > /tmp/install.json || true
kortix connectors connect notion --owner project > /tmp/connect.txt 2>&1 || true
url=$(grep -o 'https\?://[^ ]*' /tmp/connect.txt | head -1)
mkdir -p /logs/agent; echo "🙋 Sign in to Notion for the whole workspace here: ${url}" > /logs/agent/response.md
