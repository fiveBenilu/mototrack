#!/usr/bin/env bash
# Installiert den MotoTrack-systemd-Dienst. Mit sudo ausführen:
#   sudo bash deploy/install-service.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

install -m 600 "$REPO_DIR/deploy/mototrack.env" /etc/mototrack.env
install -m 644 "$REPO_DIR/deploy/mototrack.service" /etc/systemd/system/mototrack.service

systemctl daemon-reload
systemctl enable mototrack.service
systemctl restart mototrack.service

echo "MotoTrack-Dienst installiert und gestartet."
systemctl --no-pager status mototrack.service | head -n 12
