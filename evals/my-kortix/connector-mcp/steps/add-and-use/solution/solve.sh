#!/bin/bash
set -e
kortix connectors add deepwiki --provider mcp --url https://mcp.deepwiki.com/mcp --transport http --apply
kortix connectors call deepwiki read_wiki_structure '{"repoName": "facebook/react"}' > /tmp/wiki.txt
mkdir -p /logs/agent; echo "✅ DeepWiki is connected. facebook/react is React, the JavaScript library for building user interfaces." > /logs/agent/response.md
