#!/usr/bin/env python3
"""Package an explicit source allowlist; never include environment files or keys."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parents[2]
target = Path('/tmp/postspark-worker-source.tar.gz')
directories = ['client', 'server', 'shared', 'patches', 'ops/aws']
files = ['Dockerfile.worker', '.dockerignore', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'scripts/build-review-renderer.mjs']
excluded = {'node_modules', '.git', '.local', '__pycache__', 'benchmarks', '__tests__'}
paths = [root / file for file in files]
for directory in directories:
    paths.extend(path for path in (root / directory).rglob('*') if path.is_file() and not path.is_symlink())
selected = []
for path in sorted(set(paths)):
    relative = path.relative_to(root)
    if any(part in excluded for part in relative.parts):
        continue
    if path.name.startswith('.env') or path.suffix.lower() in {'.pem', '.key', '.log', '.bak', '.pyc'}:
        continue
    if '.test.' in path.name or '.spec.' in path.name:
        continue
    selected.append(path)
with tarfile.open(target, 'w:gz') as archive:
    for path in selected:
        archive.add(path, arcname=str(path.relative_to(root)), recursive=False)
digest = hashlib.sha256(target.read_bytes()).hexdigest()
release = 'aws-' + digest[:16]
Path('/tmp/postspark-worker-release.json').write_text(json.dumps({'release': release, 'sha256': digest, 'archive': str(target)}))
print(json.dumps({'release': release, 'sourceFiles': len(selected), 'archiveBytes': target.stat().st_size, 'sha256': digest}))
