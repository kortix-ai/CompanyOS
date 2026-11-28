#!/bin/bash
kortix triggers add "Write the Monday client report." --runtime --cron "0 9 * * 1" --timezone Europe/Berlin --agent worker >/dev/null 2>&1
kortix triggers add "Write the Friday wrap-up." --runtime --cron "0 16 * * 5" --timezone Europe/Berlin --agent worker >/dev/null 2>&1
