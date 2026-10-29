#!/bin/sh
# Run as root on the worker host. Source archives contain no environment files.
set -eu
postspark_action=${1:-}
postspark_release=${2:-}
postspark_root=/opt/postspark-worker
case "$postspark_release" in
  aws-????????????????) ;;
  *) echo 'Expected an immutable aws-<16 hex characters> release' >&2; exit 2 ;;
esac
printf '%s' "$postspark_release" | grep -Eq '^aws-[a-f0-9]{16}$'
postspark_directory="$postspark_root/releases/$postspark_release"

case "$postspark_action" in
  build)
    postspark_checksum=${3:?Expected the source archive SHA-256}
    printf '%s' "$postspark_checksum" | grep -Eq '^[a-f0-9]{64}$'
    printf '%s  %s\n' "$postspark_checksum" /tmp/postspark-worker-source.tar.gz | sha256sum -c -
    install -d -m 0750 "$postspark_directory"
    tar -xzf /tmp/postspark-worker-source.tar.gz -C "$postspark_directory"
    cd "$postspark_directory"
    if ! docker build --pull -f Dockerfile.worker -t "postspark-worker:$postspark_release" . > /var/log/postspark-worker-build.log 2>&1; then
      tail -n 60 /var/log/postspark-worker-build.log
      exit 1
    fi
    docker run --rm --network none --init --memory 1536m --memory-swap 2g --shm-size 256m --pids-limit 256 \
      --cap-drop ALL --security-opt no-new-privileges:true \
      "postspark-worker:$postspark_release" node --import tsx ops/aws/renderer-probe.ts \
      > "$postspark_directory/renderer-probe.json"
    cat "$postspark_directory/renderer-probe.json"
    ;;
  activate)
    test -s "$postspark_directory/renderer-probe.json"
    test -s "$postspark_root/shared/worker.env"
    if test -f "$postspark_root/current.env"; then
      cp "$postspark_root/current.env" "$postspark_root/previous.env"
    fi
    printf 'POSTSPARK_WORKER_RELEASE=%s\n' "$postspark_release" > "$postspark_root/current.env"
    docker compose --env-file "$postspark_root/current.env" \
      -f "$postspark_directory/ops/aws/compose.worker.yml" up -d --no-build
    docker compose --env-file "$postspark_root/current.env" \
      -f "$postspark_directory/ops/aws/compose.worker.yml" ps
    ;;
  *) echo 'Usage: release-worker.sh build|activate RELEASE [SHA256]' >&2; exit 2 ;;
esac
