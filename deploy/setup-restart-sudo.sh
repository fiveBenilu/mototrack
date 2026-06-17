#!/usr/bin/env bash
#
# Installs a narrowly-scoped sudoers rule so that the user may restart ONLY the
# mototrack systemd service without a password. Everything else still requires
# a password. The rule is validated with `visudo` before it is installed, so a
# typo can never lock you out of sudo.
#
# Usage:  sudo ./deploy/setup-restart-sudo.sh
#
set -euo pipefail

RULE_USER="bennetgriese"
SYSTEMCTL="/usr/bin/systemctl"
SERVICE="mototrack.service"
DROPIN="/etc/sudoers.d/mototrack-restart"

# Must run as root (the script writes to /etc/sudoers.d).
if [[ "${EUID}" -ne 0 ]]; then
  echo "Bitte mit sudo ausführen:  sudo $0" >&2
  exit 1
fi

# Sanity checks.
if [[ ! -x "${SYSTEMCTL}" ]]; then
  echo "FEHLER: ${SYSTEMCTL} nicht gefunden." >&2
  exit 1
fi
if ! id -u "${RULE_USER}" >/dev/null 2>&1; then
  echo "FEHLER: Benutzer '${RULE_USER}' existiert nicht." >&2
  exit 1
fi

# Build the rule in a temp file and validate it BEFORE installing.
TMP="$(mktemp)"
trap 'rm -f "${TMP}"' EXIT
printf '%s ALL=(root) NOPASSWD: %s restart %s\n' \
  "${RULE_USER}" "${SYSTEMCTL}" "${SERVICE}" > "${TMP}"

echo "Validiere sudoers-Regel ..."
visudo -cf "${TMP}"

echo "Installiere nach ${DROPIN} ..."
install -m 0440 -o root -g root "${TMP}" "${DROPIN}"

echo
echo "Fertig. Installierte Regel:"
echo "  $(cat "${DROPIN}")"
echo
echo "Test:  sudo -n ${SYSTEMCTL} restart ${SERVICE}"
