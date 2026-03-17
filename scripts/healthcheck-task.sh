#!/bin/bash
set -e

forge-manage check_instance_ready --skip-checks >/dev/null 2>&1
