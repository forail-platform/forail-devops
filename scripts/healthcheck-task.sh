#!/bin/bash
set -e

forail-manage check_instance_ready --skip-checks >/dev/null 2>&1
