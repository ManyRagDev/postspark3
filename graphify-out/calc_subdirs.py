import json
from pathlib import Path
from collections import Counter

data = json.loads(Path('graphify-out/.graphify_detect.json').read_text(encoding='utf-8', errors='ignore'))
scan_root = data.get('scan_root', 'C:\\Users\\emanu\\Documents\\Projetos\\PostSpark 3')

# Collect all files
all_files = []
for cat_files in data.get('files', {}).values():
    all_files.extend(cat_files)

# Filter out graphify-out converted files
all_files = [f for f in all_files if 'graphify-out' not in f.replace('/', '\\')]

# Get first-level subdirectories
subdirs = []
for f in all_files:
    rel = f.replace(scan_root, '').lstrip('/')
    rel = rel.lstrip('\\')
    parts = rel.split('\\' if '\\' in rel else '/')
    if len(parts) > 1:
        subdirs.append(parts[0])
    else:
        subdirs.append('(root)')

counts = Counter(subdirs)
print('Top 5 subdirectories by file count:')
for dir_name, count in counts.most_common(5):
    print(f'  {dir_name}: {count} files')
