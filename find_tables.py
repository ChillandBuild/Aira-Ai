import os
import re

table_names = set()

def find_tables_in_dir(directory, ext, pattern):
    for root, dirs, files in os.walk(directory):
        # Ignore common hidden/cache dirs
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '__pycache__', '.git', '.claude')]
        for file in files:
            if file.endswith(ext):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        matches = re.findall(pattern, content)
                        table_names.update(matches)
                except Exception as e:
                    pass

find_tables_in_dir('backend', ('.py',), r'\.table\([\'"]([^\'"]+)[\'"]\)')
find_tables_in_dir('frontend', ('.ts', '.tsx'), r'\.from\([\'"]([^\'"]+)[\'"]\)')

print('Required tables:', sorted(list(table_names)))
