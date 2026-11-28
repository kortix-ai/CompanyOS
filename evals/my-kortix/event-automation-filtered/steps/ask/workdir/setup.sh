#!/bin/bash
kortix secrets set LEADS_SECRET=$(openssl rand -hex 16) --scope connector >/dev/null 2>&1
