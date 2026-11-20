#!/usr/bin/env python3
"""Publish only the image-feedback UI, based on the currently deployed web.
Usage on VPS: python3 publish-feedback-controls.py <archive-sha256> <base-image-id>
No env, API bundle, worker, processor, database or image assets are modified.
"""
from pathlib import Path
import hashlib,json,subprocess,sys,tarfile
container='platform-app-trial-postspark-web-1'
release=Path('/opt/postspark/releases/editor-feedback-20261117')
image='postspark-web:editor-feedback-20261117'
def output(*args):return subprocess.check_output(args).decode().strip()
def inspect():return json.loads(output('docker','inspect',container))[0]
current=inspect();expected=sys.argv[2];assert current['Image']==expected,'Concurrent publication: inspect/rebuild first'
archive=Path('/tmp/postspark-editor-feedback.tar.gz');assert hashlib.sha256(archive.read_bytes()).hexdigest()==sys.argv[1]
release.mkdir(parents=True,exist_ok=True)
with tarfile.open(archive) as bundle:bundle.extractall(release,filter='data')
labels=current['Config']['Labels'];files=labels['com.docker.compose.project.config_files'].split(',');directory=labels['com.docker.compose.project.working_dir']
api_hash=output('docker','exec',container,'sha256sum','/app/api/index.js').split()[0]
base='postspark-web:before-feedback-20261117';output('docker','tag',expected,base)
(release/'Dockerfile').write_text('FROM '+base+'\nUSER root\nCOPY --chown=node:node public/ /app/dist/public/\nCOPY --chown=node:node source/ /app/\nUSER node\n')
with (release/'build.log').open('w') as log:subprocess.run(['docker','build','-t',image,str(release)],stdout=log,stderr=subprocess.STDOUT,check=True)
override=release/'compose.feedback.yaml';override.write_text('services:\n  postspark-web:\n    image: '+image+'\n')
compose=['docker','compose','--project-directory',directory,'-p',labels['com.docker.compose.project']]
for file in files:compose+=['-f',file]
compose+=['-f',str(override),'--profile','postspark-web']
config=json.loads(output(*compose,'config','--format','json'));old_env=dict(p.split('=',1) for p in current['Config']['Env'])
assert all(str(old_env.get(k))==str(v) for k,v in config['services']['postspark-web']['environment'].items()),'Unexpected environment change'
assert inspect()['Image']==expected,'Concurrent publication before activation'
subprocess.run(compose+['up','-d','--no-deps','--no-build','postspark-web'],check=True)
assert output('docker','exec',container,'sha256sum','/app/api/index.js').split()[0]==api_hash,'Backend bundle unexpectedly changed'
report={'previousImage':expected,'image':inspect()['Image'],'apiBundleSha256':api_hash,'backendUnchanged':True,'environmentUnchanged':True,'composeFiles':files+[str(override)]}
(release/'release.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
