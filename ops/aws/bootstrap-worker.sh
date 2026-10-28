#!/bin/sh
# Ubuntu 24.04 Lightsail launch script. No application or AWS secrets belong here.
# Lightsail prepends its own initialization and invokes the combined file with
# /bin/sh, so this script must remain POSIX even when used as launch user-data.
set -eu
exec >> /var/log/postspark-worker-bootstrap.log 2>&1
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends docker.io docker-compose-v2 docker-buildx ca-certificates curl
systemctl enable --now docker

# Give builds a small emergency buffer on the 2 GiB host; runtime remains bounded.
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

install -d -m 0750 /opt/postspark-worker/releases /opt/postspark-worker/shared
touch /opt/postspark-worker/bootstrap-ready
echo 'PostSpark worker host ready'
