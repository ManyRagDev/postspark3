#!/usr/bin/env python3
"""Access the worker using short-lived Lightsail SSH credentials and AWS host keys.

AWS credentials remain on the operator's machine. Application secrets are never
printed, and no SSH private key is stored in the repository.
"""
import argparse
import ipaddress
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', default='postspark')
    parser.add_argument('--region', default='us-east-2')
    parser.add_argument('--instance', default='postspark-worker-prod')
    commands = parser.add_subparsers(dest='action', required=True)
    ssh = commands.add_parser('ssh')
    ssh.add_argument('command', nargs='?', default='true')
    upload = commands.add_parser('upload')
    upload.add_argument('source', type=Path)
    upload.add_argument('destination')
    download = commands.add_parser('download')
    download.add_argument('source')
    download.add_argument('destination', type=Path)
    args = parser.parse_args()
    cli = shutil.which('aws')
    if not cli:
        raise SystemExit('AWS CLI not found. Install it and run aws login --profile postspark.')
    request = subprocess.run([
        cli, 'lightsail', 'get-instance-access-details', '--instance-name', args.instance,
        '--protocol', 'ssh', '--profile', args.profile, '--region', args.region,
        '--no-cli-pager', '--output', 'json',
    ], capture_output=True, text=True, check=False)
    if request.returncode:
        raise SystemExit(request.stderr)
    details = json.loads(request.stdout)['accessDetails']
    ip = str(ipaddress.ip_address(details['ipAddress']))
    user = details['username']
    if not user.replace('-', '').replace('_', '').isalnum():
        raise SystemExit('Unexpected SSH username returned by AWS')
    # Lightsail can omit hostKeys on a new Ubuntu instance. Pin the first SSH
    # connection locally in that case; later connections reject changed keys.
    state = Path(__file__).resolve().parent / '.local'
    state.mkdir(mode=0o700, exist_ok=True)
    os.chmod(state, 0o700)
    name = re.sub(r'[^A-Za-z0-9_-]', '_', f'{args.profile}-{args.region}-{args.instance}')
    known = state / f'{name}.known_hosts'
    if details.get('hostKeys'):
        authoritative = ''.join(
            f"{ip} {host['algorithm']} {host['publicKey']}\n"
            for host in details['hostKeys']
        )
        if known.exists():
            pinned = {tuple(line.split()[:3]) for line in known.read_text().splitlines() if line and not line.startswith('#')}
            expected = {tuple(line.split()[:3]) for line in authoritative.splitlines()}
            current = {key for key in pinned if key[0] == ip}
            if current and not current.intersection(expected):
                raise SystemExit('Pinned SSH host keys disagree with AWS. Inspect the host before reconnecting.')
        known.write_text(authoritative)
    if not known.exists():
        known.touch(mode=0o600)
    strict = 'yes' if known.stat().st_size else 'accept-new'
    os.chmod(known, 0o600)
    with tempfile.TemporaryDirectory(prefix='postspark-lightsail-') as directory:
        root = Path(directory)
        key = root / 'identity'
        cert = root / 'identity-cert.pub'
        key.write_text(details['privateKey'].rstrip() + '\n')
        cert.write_text(details['certKey'].rstrip() + '\n')
        for file in (key, cert, known):
            os.chmod(file, 0o600)
        options = [
            '-i', str(key), '-o', f'CertificateFile={cert}',
            '-o', f'UserKnownHostsFile={known}', '-o', f'StrictHostKeyChecking={strict}',
            '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
            '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15',
            '-o', 'ServerAliveCountMax=3',
        ]
        if args.action == 'upload':
            if not args.source.is_file():
                raise SystemExit('Upload source must be a file')
            if not args.destination.startswith('/tmp/') or any(c in args.destination for c in '\n\r\t ;`$'):
                raise SystemExit('Upload destination must be a simple absolute /tmp path')
            result = subprocess.run(['scp', *options, str(args.source.resolve()), f'{user}@{ip}:{args.destination}'])
        elif args.action == 'download':
            if not args.source.startswith('/tmp/postspark-') or any(c in args.source for c in '\n\r\t ;`$'):
                raise SystemExit('Download source must be a simple /tmp/postspark-* proof file')
            result = subprocess.run(['scp', *options, f'{user}@{ip}:{args.source}', str(args.destination.resolve())])
        else:
            result = subprocess.run(['ssh', *options, f'{user}@{ip}', args.command])
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
