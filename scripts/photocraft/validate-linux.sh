#!/usr/bin/env bash
# Administrative smoke/benchmark runner. No daemon, API or PostSpark configuration.
set -Eeuo pipefail
umask 077
mode=${1:-smoke}
[[ $# -le 1 && ( $mode == smoke || $mode == benchmark ) ]] || {
  printf 'Usage: sudo bash validate-linux.sh [smoke|benchmark]\n' >&2
  exit 2
}
[[ $EUID == 0 ]] || { printf 'Run as root to create the bounded transient systemd unit.\n' >&2; exit 1; }
root=/opt/postspark/photocraft
state=/var/lib/postspark-photocraft
binary=$root/current/photocraft-cli
[[ -x $binary ]] || { printf 'Install PhotoCraft first.\n' >&2; exit 1; }
getent passwd photocraft >/dev/null
exec 9>"$root/.validation.lock"
flock -n 9 || { printf 'Another PhotoCraft validation is active.\n' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%S)-$$
evidence=$root/validation/$stamp-$mode
install -d -m 0700 "$evidence"
case $mode in
  smoke) arguments=("$root/tooling/verify-headless.py" --bin "$binary") ;;
  benchmark) arguments=("$root/tooling/benchmark-headless.py" --bin "$binary" --output "$state/benchmark-$stamp.json" --repeats 2) ;;
esac
systemd-run --quiet --wait --pipe --collect \
  --unit="postspark-photocraft-$mode-$stamp" \
  --property=User=photocraft --property=Group=photocraft \
  --property="WorkingDirectory=$state" --property="Environment=TMPDIR=$state/tmp" \
  --property=UMask=0077 --property=MemoryMax=4G --property=MemorySwapMax=0 \
  --property=CPUQuota=200% --property=TasksMax=128 --property=RuntimeMaxSec=900 \
  --property=TimeoutStopSec=5 --property=NoNewPrivileges=yes \
  --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes \
  --property="ReadWritePaths=$state" --property=RestrictAddressFamilies=AF_UNIX \
  /usr/bin/python3 "${arguments[@]}" 2>&1 | tee "$evidence/output.log"
if [[ $mode == benchmark ]]; then
  install -m 0600 "$state/benchmark-$stamp.json" "$evidence/benchmark.json"
fi
sha256sum "$binary" "$root/tooling/verify-headless.py" "$root/tooling/benchmark-headless.py" > "$evidence/tooling.sha256"
printf 'PASS: evidence retained in %s\n' "$evidence"
