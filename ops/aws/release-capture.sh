#!/bin/sh
# Run as root on the existing worker host; no database or AI credentials required.
set -eu
postspark_action=${1:-}
postspark_release=${2:-}
postspark_root=/opt/postspark-capture
printf '%s' "$postspark_release" | grep -Eq '^capture-[a-f0-9]{16}$'
postspark_directory="$postspark_root/releases/$postspark_release"
case "$postspark_action" in
  build)
    postspark_checksum=${3:?Expected source SHA256}
    postspark_base=${4:?Expected verified worker image}
    printf '%s' "$postspark_checksum" | grep -Eq '^[a-f0-9]{64}$'
    printf '%s  %s\n' "$postspark_checksum" /tmp/postspark-capture-source.tar.gz | sha256sum -c -
    docker image inspect "$postspark_base" > /dev/null
    install -d -m 0755 "$postspark_directory"
    install -d -m 0700 "$postspark_root/shared"
    install -d -o 1000 -g 1000 -m 0755 "$postspark_root/proofs"
    tar -xzf /tmp/postspark-capture-source.tar.gz -C "$postspark_directory"
    cd "$postspark_directory"
    docker build --build-arg "POSTSPARK_WORKER_BASE=$postspark_base" -f ops/aws/Dockerfile.capture -t "postspark-capture:$postspark_release" .
    postspark_probe=postspark-capture-probe
    cleanup() { docker rm -f "$postspark_probe" > /dev/null 2>&1 || true; rm -f "$postspark_root/shared/probe.env"; }
    trap cleanup EXIT HUP INT TERM
    test -z "$(docker ps -aq --filter name="^${postspark_probe}$")"
    python3 -c 'import secrets,os; p="/opt/postspark-capture/shared/probe.env"; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600); os.write(f,("SCREENSHOT_SERVICE_TOKEN="+secrets.token_hex(32)+"\n").encode()); os.close(f)'
    docker run -d --name "$postspark_probe" --init --read-only --tmpfs /tmp:size=256m,mode=1777 \
      --env-file "$postspark_root/shared/probe.env" --memory 512m --memory-swap 768m --shm-size 128m \
      --pids-limit 160 --cap-drop ALL --security-opt no-new-privileges:true "postspark-capture:$postspark_release" > /dev/null
    postspark_wait=0
    until docker exec "$postspark_probe" node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; do
      postspark_wait=$((postspark_wait+1)); test "$postspark_wait" -lt 15; sleep 1
    done
    if ! docker run --rm --init --read-only --network "container:$postspark_probe" \
      --tmpfs /tmp:size=64m,mode=1777 --env-file "$postspark_root/shared/probe.env" \
      --env CAPTURE_PROBE_OUTPUT=/proofs/desktop.png --mount "type=bind,src=$postspark_root/proofs,dst=/proofs" \
      --memory 256m --memory-swap 384m --pids-limit 64 --cap-drop ALL --security-opt no-new-privileges:true \
      "postspark-capture:$postspark_release" node --import tsx ops/aws/capture-probe.ts > "$postspark_directory/probe.json"; then
      docker logs --tail 30 "$postspark_probe"
      docker exec "$postspark_probe" node -e "for(const f of ['memory.peak','memory.events'])console.log(f,require('fs').readFileSync('/sys/fs/cgroup/'+f,'utf8'))" || true
      exit 1
    fi
    cat "$postspark_directory/probe.json"
    postspark_peak=$(docker exec "$postspark_probe" cat /sys/fs/cgroup/memory.peak)
    printf '{"memoryPeakBytes":%s}\n' "$postspark_peak" | tee "$postspark_directory/memory.json"
    docker exec "$postspark_probe" cat /sys/fs/cgroup/memory.events > "$postspark_directory/memory.events"
    awk '$1=="oom_kill" {seen=1; if($2!=0)exit 1} END {if(!seen)exit 1}' "$postspark_directory/memory.events"
    test -s "$postspark_root/proofs/desktop.png"
    docker inspect --format 'oom={{.State.OOMKilled}} restarts={{.RestartCount}} status={{.State.Status}}' "$postspark_probe"
    docker image inspect --format '{{.Id}}' "postspark-capture:$postspark_release" > "$postspark_directory/verified"
    ;;
  activate)
    test -s "$postspark_directory/verified"
    if ! test -s "$postspark_root/shared/capture.env"; then
      python3 -c 'import secrets,os; p="/opt/postspark-capture/shared/capture.env"; f=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(f,("SCREENSHOT_SERVICE_TOKEN="+secrets.token_hex(32)+"\n").encode()); os.close(f)'
    fi
    if test -f "$postspark_root/current.env"; then cp "$postspark_root/current.env" "$postspark_root/previous.env"; fi
    printf 'POSTSPARK_CAPTURE_IMAGE=postspark-capture:%s\n' "$postspark_release" > "$postspark_root/current.env.next"
    if test -f "$postspark_root/previous.env"; then
      grep -E '^POSTSPARK_CADDY_IMAGE=|^POSTSPARK_CAPTURE_HOST=' "$postspark_root/previous.env" >> "$postspark_root/current.env.next" || true
    fi
    mv "$postspark_root/current.env.next" "$postspark_root/current.env"
    set -- -f "$postspark_directory/ops/aws/compose.capture.yml"
    if grep -q '^POSTSPARK_CAPTURE_HOST=' "$postspark_root/current.env"; then set -- "$@" -f "$postspark_directory/ops/aws/compose.capture.public.yml"; fi
    docker compose --env-file "$postspark_root/current.env" "$@" up -d --wait
    ;;
  *) echo 'Usage: release-capture.sh build RELEASE SHA256 BASE_IMAGE | activate RELEASE' >&2; exit 2 ;;
esac
