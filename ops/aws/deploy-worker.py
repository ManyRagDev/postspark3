#!/usr/bin/env python3
"""Build and verify an existing worker host; activate only with --activate.

This command creates no AWS resource and copies no credentials. Prepare the
host's protected shared/worker.env once, outside Git and outside the image.
"""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--activate', action='store_true')
parser.add_argument('--profile', default='postspark')
args = parser.parse_args()

subprocess.run([sys.executable, str(root/'ops/aws/package-worker.py')], cwd=root, check=True)
release = json.loads(Path('/tmp/postspark-worker-release.json').read_text())
helper = [sys.executable, str(root/'ops/aws/lightsail.py'), '--profile', args.profile]
subprocess.run([*helper, 'upload', release['archive'], '/tmp/postspark-worker-source.tar.gz'], check=True)
subprocess.run([*helper, 'upload', str(root/'ops/aws/release-worker.sh'), '/tmp/postspark-worker-release.sh'], check=True)
command = 'sudo sh /tmp/postspark-worker-release.sh build ' + shlex.quote(release['release']) + ' ' + shlex.quote(release['sha256'])
subprocess.run([*helper, 'ssh', command], check=True)
if args.activate:
    subprocess.run([*helper, 'ssh', 'sudo sh /tmp/postspark-worker-release.sh activate ' + shlex.quote(release['release'])], check=True)
else:
    print('Image verified. Existing worker unchanged; use --activate to deploy a verified release.')
