#!/usr/bin/env python3
"""Publish the reviewed unified-editor artifact on the existing VPS.

Usage: python3 deploy-unified.py processor|web <archive-sha256> <expected-image-id>
Preserves all current Compose overrides. Does not emit environment values.
Disable groups on the new reader-compatible image for rollback after new posts
have been saved; never blindly restore an older strict composition reader.
"""
import hashlib,json,subprocess,sys,tarfile
from pathlib import Path
stage,expected_hash,expected_image=sys.argv[1:4]
assert stage in ('processor','web')
release=Path('/opt/postspark/releases/unified-editor-20261117')
container='postspark-image-pilot-image-editor-1' if stage=='processor' else 'platform-app-trial-postspark-web-1'
def output(*args):return subprocess.check_output(args).decode().strip()
def inspect():return json.loads(output('docker','inspect',container))[0]
current=inspect();assert current['Image']==expected_image,'Concurrent release: inspect/rebuild first'
archive=Path('/tmp/postspark-unified-'+stage+'.tar.gz');assert hashlib.sha256(archive.read_bytes()).hexdigest()==expected_hash
folder=release/stage;folder.mkdir(parents=True,exist_ok=True)
with tarfile.open(archive) as bundle:bundle.extractall(folder,filter='data')
labels=current['Config']['Labels'];files=labels['com.docker.compose.project.config_files'].split(',');directory=labels['com.docker.compose.project.working_dir'];project=labels['com.docker.compose.project']
base='postspark-'+stage+':before-unified-20261117';image='postspark-'+stage+':unified-20261117'
output('docker','tag',expected_image,base)
if stage=='processor':
 dockerfile='FROM '+base+'\nUSER root\nCOPY --chown=node:node service.mjs /app/image-editor-service.mjs\nUSER node\n'
 service='image-editor'
else:
 dockerfile='FROM '+base+'\nUSER root\nCOPY --chown=node:node public/ /app/dist/public/\nCOPY --chown=node:node api/ /app/api/\nCOPY --chown=node:node source/ /app/\nUSER node\n'
 service='postspark-web'
(folder/'Dockerfile').write_text(dockerfile)
with (folder/'build.log').open('w') as log:subprocess.run(['docker','build','-t',image,str(folder)],stdout=log,stderr=subprocess.STDOUT,check=True)
override=folder/'compose.unified.yaml';override.write_text('services:\n  '+service+':\n    image: '+image+'\n    environment:\n      ADVANCED_IMAGE_CORE_ENABLED: "true"\n      ADVANCED_IMAGE_FINISHING_ENABLED: "true"\n      ADVANCED_IMAGE_IRIS_ENABLED: "false"\n')
compose=['docker','compose','--project-directory',directory,'-p',project]
for file in files:compose+=['-f',file]
compose+=['-f',str(override)]
if stage=='web':compose+=['--profile','postspark-web']
config=json.loads(output(*compose,'config','--format','json'));env=config['services'][service]['environment'];previous=dict(v.split('=',1) for v in current['Config']['Env'])
allowed={'ADVANCED_IMAGE_CORE_ENABLED','ADVANCED_IMAGE_FINISHING_ENABLED','ADVANCED_IMAGE_IRIS_ENABLED'}
assert all(key in allowed or str(previous.get(key))==str(value) for key,value in env.items()),'Unexpected environment change'
assert inspect()['Image']==expected_image,'Concurrent release before activation'
subprocess.run(compose+['up','-d','--no-deps','--no-build',service],check=True)
report={'previousImage':expected_image,'image':inspect()['Image'],'composeFiles':files+[str(override)],'changedService':service,'enabledGroups':['core','finishing'],'irisEnabled':False,'oldCredentialsPreserved':True}
(folder/'release.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
