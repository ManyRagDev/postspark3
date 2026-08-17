import json
from pathlib import Path

# Read with error handling
content = Path('graphify-out/.graphify_detect.json').read_bytes()
data = json.loads(content.decode('utf-8', errors='ignore'))

excludes = ['postspark-next', 'node_modules', '.git', 'dist', 'build']

def filter_path(path):
    path_normalized = path.replace('\\', '/')
    for ex in excludes:
        if '/' + ex + '/' in path_normalized:
            return False
    return True

filtered = {'files': {}, 'total_files': 0, 'total_words': 0, 'skipped_sensitive': []}

for category, files in data.get('files', {}).items():
    filtered['files'][category] = [f for f in files if filter_path(f)]
    filtered['total_files'] += len(filtered['files'][category])

filtered['total_words'] = data.get('total_words', 0)
filtered['skipped_sensitive'] = data.get('skipped_sensitive', [])

Path('graphify-out/.graphify_detect.json').write_text(json.dumps(filtered, ensure_ascii=False), encoding='utf-8')

total = filtered['total_files']
words = filtered['total_words']
print(f'Corpus: {total} files ~{words:,} words')

for cat in ['code', 'document', 'paper', 'image', 'video']:
    count = len(filtered['files'].get(cat, []))
    if count > 0:
        print(f'  {cat.ljust(10)}: {count} files')

if filtered.get('skipped_sensitive'):
    print(f'Skipped {len(filtered["skipped_sensitive"])} sensitive files')
