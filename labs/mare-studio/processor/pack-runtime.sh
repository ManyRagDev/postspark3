#!/usr/bin/env bash
# Build the isolated Linux x64 raster runtime from the workstation's installed dependencies.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../../.." && pwd)
test "$(node -p 'process.platform+"-"+process.arch+"-"+process.versions.node')" = linux-x64-22.23.4
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
install -m 755 "$(node -p 'process.execPath')" "$stage/node"
for package in canvas canvas-linux-x64-gnu; do
  target="$stage/node_modules/@napi-rs/$package"
  mkdir -p "$target"
  cp -RL "$repo/node_modules/.pnpm/@napi-rs+$package@1.0.5/node_modules/@napi-rs/$package/." "$target"
done
mkdir "$stage/fonts"
cp /usr/share/fonts/truetype/liberation/{LiberationSans-Regular,LiberationSans-Bold,LiberationSerif-Regular,LiberationSerif-Italic}.ttf "$stage/fonts/"
cp /usr/share/doc/fonts-liberation/copyright "$stage/fonts/LICENSE"
"$stage/node" -e 'const canvas=require(process.argv[1]);canvas.createCanvas(8,8).toBuffer("image/png")' "$stage/node_modules/@napi-rs/canvas"
tar -czf - -C "$stage" .
