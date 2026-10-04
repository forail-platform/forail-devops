#!/bin/bash
# End-to-end check of backup.sh and restore.sh against a running stack.
#
#   docker compose up -d && bash scripts/test-backup-restore.sh
#
# Creates marker data -- an organization and a credential with a secret --
# backs up, adds a second marker, restores, and checks that the first marker
# is back, the second is gone, the secret still decrypts, and the stack
# accepts new writes (restored sequences). Leaves the pre-restore database
# behind under its kept name; drop it afterwards if you like.
#
# Destructive: run it against a throwaway stack, never production.
set -euo pipefail
cd "$(dirname "$0")/.."

dc() { docker compose "$@"; }
manage() { dc exec -T forail-task forail-manage shell -c "$1" 2>/dev/null | tail -1; }
fail() { echo "FAIL: $*" >&2; exit 1; }

stamp=$(date +%s)
before="bkp-before-${stamp}"
after="bkp-after-${stamp}"
secret="s3cret-${stamp}"

echo "==> Seeding ${before}"
manage "
from forail.main.models import Organization, Credential, CredentialType
o = Organization.objects.create(name='${before}')
ct = CredentialType.objects.get(namespace='ssh', managed=True)
Credential.objects.create(name='${before}', organization=o, credential_type=ct, inputs={'username': 'u', 'password': '${secret}'})
print('ok')" | grep -qx ok || fail "seeding"

echo "==> Backup"
dc exec -T forail-task bash /etc/forail/backup.sh

echo "==> Writing ${after} after the backup"
manage "from forail.main.models import Organization; Organization.objects.create(name='${after}'); print('ok')" | grep -qx ok || fail "second marker"

echo "==> Restore refuses while the stack is running"
if dc run --rm --no-deps forail-task bash /etc/forail/restore.sh --yes >/dev/null 2>&1; then
    fail "restore ran with forail-web/forail-task still connected"
fi

echo "==> Restore"
dc stop forail-web forail-task
dc run --rm --no-deps forail-task bash /etc/forail/restore.sh --yes
dc up -d --wait forail-web forail-task

echo "==> Verifying"
result=$(manage "
from forail.main.models import Organization, Credential
print(Organization.objects.filter(name='${before}').exists(),
      Organization.objects.filter(name='${after}').exists(),
      Credential.objects.get(name='${before}').get_input('password') == '${secret}',
      bool(Organization.objects.create(name='bkp-new-${stamp}').pk))")
[ "$result" = "True False True True" ] || fail "expected 'True False True True' (before restored, after gone, secret decrypts, new writes work), got '${result}'"

echo "PASS: backup and restore round-trip"
