#!/usr/bin/env python3
"""Package only capture source/configuration; never copy environments or keys."""
from pathlib import Path
import hashlib
import json
import tarfile

root = Path(__file__).resolve().parents[2]
files = [p for p in (root/'server/capture').glob('*.ts') if '.test.' not in p.name]
files += [root/'ops/aws'/name for name in [
    'Dockerfile.capture', 'Caddyfile.capture', 'compose.capture.yml',
    'compose.capture.public.yml', 'capture-probe.ts', 'release-capture.sh', 'README.capture.md',
]]
archive_path = Path('/tmp/postspark-capture-source.tar.gz')
with tarfile.open(archive_path, 'w:gz') as archive:
    for path in sorted(files):
        assert path.is_file() and not path.is_symlink()
        archive.add(path, arcname=str(path.relative_to(root)), recursive=False)
digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
release = {'release': 'capture-'+digest[:16], 'sha256': digest, 'archive': str(archive_path), 'files': len(files)}
Path('/tmp/postspark-capture-release.json').write_text(json.dumps(release))
print(json.dumps(release))
