#!/bin/bash
out=$(kortix triggers add "Check the open change requests and write a short summary of them." --runtime --cron "0 9 * * 1-5" --timezone Europe/London --agent worker 2>&1)
id=$(echo "$out" | grep -oE 'trigger\.[0-9a-f]+' | head -1); kortix triggers pause "$id"
mkdir -p /logs/agent; echo "✅ Saved, paused: weekdays 09:00 Europe/London. Not running yet: I test it, then put it live." > /logs/agent/response.md
