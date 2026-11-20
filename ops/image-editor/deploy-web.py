#!/usr/bin/env python3
"""Run on the authorized VPS. Prepare/build first; activate only via explicit stage.

Never emits environment values. Rollback is specific to postspark-web; worker,
database, gateway and other products are not recreated.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

runtime = Path('/opt/platform-staging/runtime')
release = Path('/opt/postspark/photocraft/web-release-20261115')
container = 'platform-app-trial-postspark-web-1'
stage = sys.argv[1]

def run(*args, **kwargs):
    return subprocess.check_output(args, **kwargs).decode()

def inspect():
    return json.loads(run('docker', 'inspect', container))[0]

compose = ['docker', 'compose', '--project-directory', str(runtime),
           '-f', str(runtime / 'compose.yml'), '-f', str(release / 'compose.web.yaml'),
           '--profile', 'postspark-web']

if stage == 'prepare':
    archive = Path('/tmp/postspark-image-editor-web.tar.gz')
    expected = sys.argv[2]
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
    release.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as bundle:
        bundle.extractall(release, filter='data')
    current = inspect()
    receipt = release / 'before.json'
    if not receipt.exists():
        receipt.write_text(json.dumps({'image': current['Image'],
            'startedAt': current['State']['StartedAt'],
            'networks': list(current['NetworkSettings']['Networks'])}, indent=2))
    run('docker', 'tag', current['Image'], 'postspark-editor-web-base:20261115')
    run('docker', 'tag', current['Image'], 'postspark-web:before-advanced-20261115')
    values = {}
    for line in Path('/etc/postspark/image-editor.env').read_text().splitlines():
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            values[key] = value.strip().strip('\"\'')
    token = values['ADVANCED_IMAGE_PROCESSOR_TOKEN']
    assert len(token) >= 32
    env = Path('/etc/postspark/image-editor-web.env')
    fd = os.open(env, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write('ADVANCED_IMAGE_EDITOR_ENABLED=true\n'
                'ADVANCED_IMAGE_PROCESSOR_URL=http://image-editor:9417\n'
                'ADVANCED_IMAGE_PROCESSOR_TOKEN=' + token + '\n')
    os.chmod(env, 0o600)
    config = json.loads(run(*compose, 'config', '--format', 'json'))
    web = config['services']['postspark-web']
    assert set(web['networks']) == {'app-private', 'database', 'proxy', 'image-editor'}
    previous_env = dict(pair.split('=', 1) for pair in current['Config']['Env'])
    altered = sorted(key for key, value in web['environment'].items()
                     if str(previous_env.get(key)) != str(value))
    assert set(altered) <= {'ADVANCED_IMAGE_EDITOR_ENABLED', 'ADVANCED_IMAGE_PROCESSOR_URL',
                            'ADVANCED_IMAGE_PROCESSOR_TOKEN'}, altered
    assert web['image'] == 'postspark-web:advanced-editor-20261115'
    print(json.dumps({'prepared': True, 'changedEnvironmentKeys': altered,
                      'networks': list(web['networks']), 'previousImage': current['Image']}))
    with (release / 'build.log').open('w') as log:
        subprocess.run(['docker', 'build', '-t', web['image'], str(release)],
                       stdout=log, stderr=subprocess.STDOUT, check=True)
    print(json.dumps({'builtImage': run('docker', 'image', 'inspect', web['image'],
                                      '--format', '{{.Id}}').strip()}))
elif stage == 'activate':
    before = json.loads((release / 'before.json').read_text())
    assert inspect()['Image'] == before['image'], 'Web changed concurrently; inspect before activating'
    subprocess.run(compose + ['up', '-d', '--no-deps', '--no-build', 'postspark-web'], check=True)
    print(json.dumps({'activated': True, 'image': inspect()['Image']}))
elif stage == 'rollback':
    rollback = release / 'compose.rollback.yaml'
    rollback.write_text('services:\n  postspark-web:\n    image: postspark-web:before-advanced-20261115\n')
    subprocess.run(compose + ['-f', str(rollback), 'up', '-d', '--no-deps', '--no-build', 'postspark-web'], check=True)
    print(json.dumps({'rolledBack': True, 'image': inspect()['Image']}))
else:
    raise SystemExit('Use prepare <sha256>, activate or rollback')
