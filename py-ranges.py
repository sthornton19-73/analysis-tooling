"""Exact start/end lines for every Python def/class in a tree.

    python py-ranges.py <repo-root>   ->  {"rel/path.py": [[name, start, end], ...]} on stdout

ast.end_lineno is authoritative and needs Python 3.8+. Files that fail to parse are
skipped silently - the caller treats a missing range as "approximate", never as a guess.
"""
import ast, json, sys, io, os

SKIP = {'node_modules', '.git', 'dist', 'build', 'out', 'graphify-out',
        'coverage', '__pycache__', '.venv', 'venv', 'vendor'}

root = sys.argv[1]
out = {}
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in SKIP]
    for fn in filenames:
        if not fn.endswith('.py'):
            continue
        full = os.path.join(dirpath, fn)
        rel = os.path.relpath(full, root).replace(os.sep, '/')
        try:
            tree = ast.parse(io.open(full, encoding='utf-8').read())
        except Exception:
            continue
        rows = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                end = getattr(node, 'end_lineno', None)
                if end:
                    rows.append([node.name, node.lineno, end])
        if rows:
            out[rel] = rows

sys.stdout.write(json.dumps(out))
