#!/usr/bin/env bash
# Run from the workstation with an SSH alias for the Ubuntu lab VPS.
set -euo pipefail
host=${1:-postspark-vps}
here=$(cd -- "$(dirname -- "$0")" && pwd)
ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=yes)
ssh "${ssh_opts[@]}" "$host" 'bash -s' < "$here/install-engines.sh"
raster=/opt/postspark/mare-lab/engines/node22.23.4-canvas1.0.5
if ! ssh "${ssh_opts[@]}" "$host" "test -x '$raster/node'"; then
  "$here/pack-runtime.sh" | ssh "${ssh_opts[@]}" "$host" '
    set -eu
    dest=/opt/postspark/mare-lab/engines/node22.23.4-canvas1.0.5
    stage=$(mktemp -d "$dest.XXXXXXXX")
    tar --no-same-owner -xzf - -C "$stage"
    chmod 755 "$stage"
    chmod -R go-w "$stage"
    mv -T "$stage" "$dest"'

fi
speech=/opt/postspark/mare-lab/engines/speech-v1
if ! ssh "${ssh_opts[@]}" "$host" "test -x '$speech/ffmpeg' && test -s '$speech/models/whisper-base/model.bin' && test -s '$speech/models/selfie.tflite'"; then
  bash "$here/pack-speech-runtime.sh" | ssh "${ssh_opts[@]}" "$host" '
    set -eu
    dest=/opt/postspark/mare-lab/engines/speech-v1
    stage=$(mktemp -d "$dest.XXXXXXXX")
    trap '\''rm -rf -- "$stage"'\'' EXIT
    tar --no-same-owner --no-same-permissions -xzf - -C "$stage"
    "$stage/ffmpeg" -version >/dev/null
    PYTHONPATH="$stage/lib" python3 -c "from faster_whisper import WhisperModel; from ai_edge_litert.interpreter import Interpreter"
    chmod 755 "$stage"
    chmod -R go-w "$stage"
    mv -T "$stage" "$dest"'
fi
tar -C "$here/.." --exclude='__pycache__' -czf - dist processor |
  ssh "${ssh_opts[@]}" "$host" '
    set -eu
    base=/opt/postspark/mare-lab
    install -d -m 755 "$base/releases"
    stage=$(mktemp -d "$base/releases/lab.XXXXXXXX")
    tar --no-same-owner --no-same-permissions -xzf - -C "$stage"
    chmod 755 "$stage"
    chmod -R go-w "$stage"
    ln -s "$stage" "$stage.next"
    mv -Tf "$stage.next" "$base/current"
    install -m 644 "$stage/processor/mare-studio-lab.service" /etc/systemd/system/mare-studio-lab.service
    systemctl daemon-reload
    systemctl enable mare-studio-lab.service
    systemctl restart mare-studio-lab.service
    systemctl is-active mare-studio-lab.service'
