#!/usr/bin/env python3
"""Publish the informational editor roadmap note, using the running web as base.

Run on the VPS after uploading the reviewed artifact. Does not alter env files,
backend bundle, worker or processor. All existing compose overrides are retained.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tarfile

container = 'platform-app-trial-postspark-web-1'
release = Path('/opt/postspark/releases/advanced-roadmap-20261117')
image = 'postspark-web:advanced-roadmap-20261117'

def output(*args):
    return subprocess.check_output(args).decode().strip()

def inspect():
    return json.loads(output('docker', 'inspect', container))[0]

current = inspect()
expected_base = sys.argv[2]
assert current['Image'] == expected_base, 'Published web changed; inspect and rebuild first'
release.mkdir(parents=True, exist_ok=True)
archive = Path('/tmp/postspark-roadmap-web.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest() == sys.argv[1]
with tarfile.open(archive) as bundle:
    bundle.extractall(release, filter='data')
labels = current['Config']['Labels']
files = labels['com.docker.compose.project.config_files'].split(',')
directory = labels['com.docker.compose.project.working_dir']
assert labels['com.docker.compose.project'] == 'platform-app-trial'
base = 'postspark-web:before-roadmap-20261117'
output('docker', 'tag', expected_base, base)
(release / 'Dockerfile').write_text('FROM '+base+'\nUSER root\n'
    'COPY --chown=node:node public/ /app/dist/public/\n'
    'COPY --chown=node:node CanvasLabPage.tsx /app/client/src/pages/CanvasLab/CanvasLabPage.tsx\n'
    'USER node\nCMD ["node", "api/index.js"]\n')
with (release / 'build.log').open('w') as log:
    subprocess.run(['docker','build','-t',image,str(release)],stdout=log,stderr=subprocess.STDOUT,check=True)
override = release / 'compose.roadmap.yaml'
override.write_text('services:\n  postspark-web:\n    image: '+image+'\n')
compose = ['docker','compose','--project-directory',directory]
for file in files:
    compose += ['-f',file]
compose += ['-f',str(override),'--profile','postspark-web']
config = json.loads(output(*compose,'config','--format','json'))
env = config['services']['postspark-web']['environment']
old_env = dict(pair.split('=',1) for pair in current['Config']['Env'])
assert all(str(old_env.get(key)) == str(value) for key,value in env.items()), 'Unexpected env change'
assert inspect()['Image'] == expected_base, 'Concurrent publication before activation'
subprocess.run(compose+['up','-d','--no-deps','--no-build','postspark-web'],check=True)
report = {'previousImage':expected_base,'image':inspect()['Image'],'rollbackImage':base,
          'composeFiles':files+[str(override)],'onlyInformationalFrontendChange':True,
          'backendChanged':False,'configurationChanged':False}
(release/'release.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
