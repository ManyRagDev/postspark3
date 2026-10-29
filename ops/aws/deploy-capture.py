#!/usr/bin/env python3
"""Build/probe on the existing host; --activate replaces the capture container."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-image', required=True, help='Already verified worker image on the host')
parser.add_argument('--activate', action='store_true')
parser.add_argument('--profile', default='postspark')
parser.add_argument('--access-details-file', type=Path)
args = parser.parse_args()
subprocess.run([sys.executable, str(root/'ops/aws/package-capture.py')], cwd=root, check=True)
release = json.loads(Path('/tmp/postspark-capture-release.json').read_text())
helper = [sys.executable, str(root/'ops/aws/lightsail.py'), '--profile', args.profile]
if args.access_details_file:
    helper.extend(['--access-details-file', str(args.access_details_file.resolve())])
for source, destination in [(release['archive'], '/tmp/postspark-capture-source.tar.gz'), (root/'ops/aws/release-capture.sh', '/tmp/postspark-capture-release.sh')]:
    subprocess.run([*helper, 'upload', str(source), destination], check=True)
command = 'sudo sh /tmp/postspark-capture-release.sh build ' + ' '.join(shlex.quote(s) for s in [release['release'], release['sha256'], args.base_image])
subprocess.run([*helper, 'ssh', command], check=True)
if args.activate:
    subprocess.run([*helper, 'ssh', 'sudo sh /tmp/postspark-capture-release.sh activate '+shlex.quote(release['release'])], check=True)
else:
    print('Capture image verified. Existing capture unchanged; activation is explicit.')
