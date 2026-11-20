#!/usr/bin/env bash
# Install the official Linux CLI without FUSE, a display server or a Rust build.
# This script prepares the host only; it does not configure the PostSpark app.
set -Eeuo pipefail
umask 022

die() { printf 'photocraft: %s\n' "$*" >&2; exit 1; }
[[ $# -le 1 ]] || die 'Usage: bash install-linux.sh [latest|vX.Y.Z]'
[[ $(uname -s) == Linux ]] || die 'This installer is for Linux.'
for tool in curl python3 sha256sum timeout flock readlink; do
  command -v "$tool" >/dev/null || die "Missing prerequisite: $tool"
done
case $(uname -m) in
  x86_64|amd64) arch=x86_64 ;;
  aarch64|arm64) arch=aarch64 ;;
  *) die 'Only x86_64 and aarch64 official AppImages are supported.' ;;
esac

requested=${1:-latest}
[[ $requested == latest || $requested =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'Use latest or a stable tag such as v0.23.1.'
install_root=${PHOTOCRAFT_INSTALL_ROOT:-/opt/postspark/photocraft}
# An explicitly empty value disables the global symlink, useful for unprivileged installs.
global_link=${PHOTOCRAFT_GLOBAL_LINK-/usr/local/bin/photocraft-cli}
[[ $install_root == /* && $install_root != / && $install_root != *$'\n'* ]] || die 'PHOTOCRAFT_INSTALL_ROOT must be an absolute, dedicated directory.'
install_root=${install_root%/}
[[ -z $global_link || $global_link == /* ]] || die 'PHOTOCRAFT_GLOBAL_LINK must be absolute, or empty.'
if [[ -n $global_link ]]; then
  mkdir -p -- "$(dirname -- "$global_link")"
  if [[ -e $global_link || -L $global_link ]]; then
    [[ -L $global_link && $(readlink -- "$global_link") == "$install_root/current/photocraft-cli" ]] || die "Refusing to replace an unmanaged command: $global_link"
  fi
fi
mkdir -p -- "$install_root/releases"
[[ ! -e $install_root/current || -L $install_root/current ]] || die 'current already exists and is not a symlink.'
exec 9>"$install_root/.install.lock"
flock -n 9 || die 'Another PhotoCraft installation is running.'
work_dir=$(mktemp -d "$install_root/.install.XXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT

api=https://api.github.com/repos/storytold/photocraft/releases
[[ $requested != latest ]] || api=$api/latest
[[ $requested == latest ]] || api=$api/tags/$requested
curl_opts=(--fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 15 --retry 2)
curl "${curl_opts[@]}" --max-time 90 --output "$work_dir/release.json" "$api"

python3 - "$work_dir/release.json" "$arch" "$requested" >"$work_dir/asset.txt" <<'PY'
import json, re, sys
release = json.load(open(sys.argv[1], encoding="utf-8"))
tag = release.get("tag_name", "")
if not re.fullmatch(r"v\d+\.\d+\.\d+", tag) or release.get("draft") or release.get("prerelease"):
    sys.exit("Refusing a draft, prerelease or unexpected tag.")
if sys.argv[3] != "latest" and tag != sys.argv[3]:
    sys.exit("The response does not match the requested version.")
name = f"photocraft-{tag[1:]}-linux-{sys.argv[2]}.AppImage"
asset = next((a for a in release.get("assets", []) if a.get("name") == name), None)
expected = f"https://github.com/storytold/photocraft/releases/download/{tag}/{name}"
if not asset or asset.get("browser_download_url") != expected:
    sys.exit("Official AppImage not found for this architecture.")
digest = asset.get("digest", "")
if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
    sys.exit("Release asset has no SHA-256 digest; do not run an unverified download.")
print(tag, expected, digest[7:], sep="\n")
PY
mapfile -t asset <"$work_dir/asset.txt"
tag=${asset[0]}
download_url=${asset[1]}
digest=${asset[2]}
release_dir=$install_root/releases/$tag-$arch

if [[ -e $release_dir || -L $release_dir ]]; then
  [[ -f $release_dir/appimage.sha256 && $(cat "$release_dir/appimage.sha256") == "$digest" ]] || die "Existing release has a different or missing digest: $release_dir"
else
  printf 'Downloading %s (%s)...\n' "$tag" "$arch"
  curl "${curl_opts[@]}" --max-time 900 --output "$work_dir/PhotoCraft.AppImage" "$download_url"
  printf '%s  %s\n' "$digest" "$work_dir/PhotoCraft.AppImage" | sha256sum --check --status || die 'AppImage SHA-256 mismatch.'
  chmod 0755 "$work_dir/PhotoCraft.AppImage"
  # AppImage extraction avoids /dev/fuse and repeated extraction per request.
  (cd "$work_dir" && timeout 120 ./PhotoCraft.AppImage --appimage-extract >extract.log)
  mkdir "$work_dir/release"
  mv -- "$work_dir/squashfs-root" "$work_dir/release/app"
  cp -- "$work_dir/release.json" "$work_dir/release/release.json"
  printf '%s\n' "$digest" >"$work_dir/release/appimage.sha256"
  cat >"$work_dir/release/photocraft-cli" <<'SH'
#!/bin/sh
set -eu
photocraft_release_dir=$(dirname -- "$(readlink -f -- "$0")")
export PHOTOCRAFT_NO_DESKTOP_INTEGRATION=1
exec "$photocraft_release_dir/app/AppRun" --cli "$@"
SH
  chmod 0755 "$work_dir/release/photocraft-cli"
  # Fail before publishing if the VPS lacks a runtime library / compatible glibc.
  timeout 30 "$work_dir/release/photocraft-cli" --version
  mv -- "$work_dir/release" "$release_dir"
fi

# The real registry, including parameter documentation, is retained with each version.
timeout 30 "$release_dir/photocraft-cli" --version
timeout 30 "$release_dir/photocraft-cli" commands --json >"$work_dir/commands.json"
python3 - "$work_dir/commands.json" <<'PY'
import json, sys
commands = json.load(open(sys.argv[1], encoding="utf-8"))
ids = {c["id"] for c in commands}
required = {"select.subject", "select.refineEdge", "select.lasso", "layer.layerMask.revealSelection",
            "image.crop", "image.imageSize", "image.adjustments.brightnessContrast", "filter.blur.gaussianBlur"}
missing = required - ids
if missing:
    sys.exit("Required commands absent: " + ", ".join(sorted(missing)))
print(f"Registry checked: {len(ids)} commands; all initial operations present.")
PY
cp -- "$work_dir/commands.json" "$release_dir/commands.json"
ln -s -- "releases/$tag-$arch" "$work_dir/current"
mv -Tf -- "$work_dir/current" "$install_root/current"
if [[ -n $global_link ]]; then
  ln -sfnT -- "$install_root/current/photocraft-cli" "$global_link"
fi
printf '\nInstalled: %s\nPHOTOCRAFT_BIN=%s/current/photocraft-cli\n' "$tag" "$install_root"
printf 'Run verify-headless.py next; registry presence alone does not validate image quality.\n'
