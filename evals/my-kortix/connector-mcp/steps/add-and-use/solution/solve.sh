#!/bin/bash
set -e
kortix connectors add deepwiki --provider mcp --url https://mcp.deepwiki.com/mcp --transport http --apply
kortix connectors call deepwiki read_wiki_structure '{"repoName": "facebook/react"}' > /tmp/wiki.txt
mkdir -p /logs/agent
{ echo "✅ DeepWiki is connected. The top-level sections for facebook/react:"; grep -E '^\s*-\s+[0-9]+\s' /tmp/wiki.txt; } > /logs/agent/response.md
