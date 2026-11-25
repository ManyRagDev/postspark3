#!/usr/bin/env bash
# Run as root on the Ubuntu x86-64 lab host. Only CLI processes are used.
set -euo pipefail
umask 022
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
base=/opt/postspark/mare-lab
install -d -m 0755 "$base/engines"
install_engine() (
  app=$1 version=$2 digest=$3
  destination="$base/engines/$app-$version"
  exec 9>"$base/engines/install.lock"
  flock 9
  if test -d "$destination"; then
    test "$(cat "$destination/package.sha256")" = "$digest"
    test -x "$destination/usr/bin/$app-cli"
    return
  fi
  stage=$(mktemp -d "$base/engines/.install.XXXXXXXX")
  trap 'rm -rf -- "$stage"' EXIT
  cached="${MARE_PACKAGE_DIR:-}/$app.deb"
  if test -n "${MARE_PACKAGE_DIR:-}" && test -f "$cached"; then
    package="$cached"
  else
    package="$stage/package.deb"
    curl --fail --silent --show-error --location --retry 3 --proto '=https' \
    "https://github.com/storytold/$app/releases/download/v$version/$app-$version-linux-x86_64.deb" -o "$package"
  fi
  printf '%s  %s\n' "$digest" "$package" | sha256sum --check --status
  test "$(dpkg-deb -f "$package" Package)" = "$app"
  test "$(dpkg-deb -f "$package" Architecture)" = amd64
  dpkg-deb -x "$package" "$stage/release"
  test -x "$stage/release/usr/bin/$app-cli"
  printf '%s\n' "$digest" > "$stage/release/package.sha256"
  mv -T "$stage/release" "$destination"
)
install_engine effectcraft 0.24.1 731f1e37aa872c35a6accfab9fa98a16674db5f9a588eb68804e006a442fbd59
install_engine filmcraft 0.20.1 5667c7505c91d2ad9de3c4acb15cb02fc9f138fae74dce9c7c5f08bc29edb3a8
du -sh "$base"/engines/*-0.*
