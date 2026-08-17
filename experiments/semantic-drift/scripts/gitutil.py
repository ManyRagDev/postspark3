"""Helpers Git para o experimento semantic-drift.

Tudo opera por plumbing (ls-tree, cat-file, diff --numstat) sem checkout:
o working tree principal nunca e tocado.
"""
import json
import os
import subprocess
from functools import lru_cache
from pathlib import Path

EXP_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = EXP_DIR.parents[1]
_config_name = os.environ.get("EXP_CONFIG", "experiment.json")
CONFIG = json.loads((EXP_DIR / "config" / _config_name).read_text(encoding="utf-8"))
IDX_DIR = EXP_DIR / CONFIG.get("indexes_dir", "indexes")
RES_DIR = EXP_DIR / CONFIG.get("results_dir", "results")

INCLUDE_DIRS = tuple(CONFIG["file_universe"]["include_dirs"])
INCLUDE_EXTS = tuple(CONFIG["file_universe"]["include_extensions"])

# cache global blob-sha -> LOC (mesmo blob aparece em muitos estados)
_loc_cache: dict[str, int] = {}


def git(*args: str, binary: bool = False) -> bytes | str:
    out = subprocess.run(
        ["git", *args], cwd=REPO_DIR, capture_output=True, check=True
    ).stdout
    return out if binary else out.decode("utf-8", errors="replace")


def in_universe(path: str) -> bool:
    return path.startswith(INCLUDE_DIRS) and path.endswith(INCLUDE_EXTS)


def _count_loc(data: bytes) -> int:
    if not data:
        return 0
    n = data.count(b"\n")
    if not data.endswith(b"\n"):
        n += 1
    return n


def loc_map(commit: str) -> dict[str, int]:
    """path -> LOC para todos os arquivos do universo no commit dado."""
    out = git("ls-tree", "-r", "-z", commit, binary=True)
    entries: list[tuple[str, str]] = []  # (sha, path)
    for rec in out.split(b"\0"):
        if not rec:
            continue
        meta, path = rec.split(b"\t", 1)
        mode, otype, sha = meta.decode().split()
        p = path.decode("utf-8", errors="replace")
        if otype == "blob" and in_universe(p):
            entries.append((sha, p))

    missing = [sha for sha, _ in entries if sha not in _loc_cache]
    if missing:
        uniq = list(dict.fromkeys(missing))
        proc = subprocess.run(
            ["git", "cat-file", "--batch"],
            cwd=REPO_DIR,
            input=("\n".join(uniq) + "\n").encode(),
            capture_output=True,
            check=True,
        )
        buf = proc.stdout
        pos = 0
        for sha in uniq:
            nl = buf.index(b"\n", pos)
            header = buf[pos:nl].decode()
            parts = header.split()
            if parts[-1] == "missing":
                _loc_cache[sha] = 0
                pos = nl + 1
                continue
            size = int(parts[2])
            content = buf[nl + 1 : nl + 1 + size]
            _loc_cache[sha] = _count_loc(content)
            pos = nl + 1 + size + 1  # +1 pelo \n apos o conteudo
    return {p: _loc_cache[sha] for sha, p in entries}


def numstat(s0: str, st: str) -> tuple[dict[str, tuple[int, int]], int]:
    """path -> (added, deleted) no universo; retorna tambem qtde de binarios ignorados.

    Sem -M: renames contam como delete total + add total (formula V0)."""
    out = git("diff", "--numstat", "-z", s0, st, binary=True)
    result: dict[str, tuple[int, int]] = {}
    binaries = 0
    fields = out.split(b"\0")
    i = 0
    while i < len(fields):
        rec = fields[i]
        if not rec:
            i += 1
            continue
        add_s, del_s, path_b = rec.split(b"\t", 2)
        if path_b == b"":
            # rename record: path vem em dois campos seguintes (nao ocorre sem -M, por seguranca)
            path = fields[i + 2].decode("utf-8", errors="replace")
            i += 3
        else:
            path = path_b.decode("utf-8", errors="replace")
            i += 1
        if not in_universe(path):
            continue
        if add_s == b"-" or del_s == b"-":
            binaries += 1
            continue
        result[path] = (int(add_s), int(del_s))
    return result, binaries


def rename_count(s0: str, st: str) -> int:
    out = git("diff", "-M50", "--name-status", "-z", s0, st, binary=True)
    fields = [f for f in out.split(b"\0") if f]
    n = 0
    i = 0
    while i < len(fields):
        status = fields[i].decode()
        if status.startswith(("R", "C")):
            old = fields[i + 1].decode("utf-8", errors="replace")
            if in_universe(old):
                n += 1
            i += 3
        else:
            i += 2
    return n


@lru_cache(maxsize=None)
def commit_date(commit: str) -> str:
    return git("log", "-1", "--format=%cI", commit).strip()
