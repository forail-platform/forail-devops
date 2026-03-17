#!/bin/bash
set -e

forge-manage check_db --skip-checks >/dev/null 2>&1
curl -sf http://127.0.0.1:8013/api/v2/ping/ >/dev/null 2>&1
