"""Constroi indices vetoriais para todos os estados necessarios (stale S0 + fresh St).

Le blobs direto do object database do Git (sem checkout). Chunking: 60 linhas,
overlap 10. Embeddings: intfloat/multilingual-e5-small (local, CPU), prefixo
"passage: ". Cache global de embeddings por sha256(chunk) — estados compartilham
a maior parte dos chunks.

Saida por estado: indexes/<commit>.npz (vetores float32 normalizados) +
indexes/<commit>.meta.json (path e linhas de cada chunk).
"""
import hashlib
import json

import numpy as np

from gitutil import CONFIG, EXP_DIR, IDX_DIR, REPO_DIR, in_universe, git
import subprocess

CHUNK_LINES = CONFIG["retrieval"]["chunking"]["lines_per_chunk"]
OVERLAP = CONFIG["retrieval"]["chunking"]["overlap_lines"]
MODEL_NAME = CONFIG["retrieval"]["embedding_model"]
CACHE_VEC = IDX_DIR / "embcache.npy"
CACHE_KEY = IDX_DIR / "embcache.keys.json"


def blob_map(commit: str) -> list[tuple[str, str]]:
    out = git("ls-tree", "-r", "-z", commit, binary=True)
    entries = []
    for rec in out.split(b"\0"):
        if not rec:
            continue
        meta, path = rec.split(b"\t", 1)
        mode, otype, sha = meta.decode().split()
        p = path.decode("utf-8", errors="replace")
        if otype == "blob" and in_universe(p):
            entries.append((sha, p))
    return entries


def read_blobs(shas: list[str]) -> dict[str, str]:
    uniq = list(dict.fromkeys(shas))
    proc = subprocess.run(
        ["git", "cat-file", "--batch"], cwd=REPO_DIR,
        input=("\n".join(uniq) + "\n").encode(), capture_output=True, check=True,
    )
    buf = proc.stdout
    out: dict[str, str] = {}
    pos = 0
    for sha in uniq:
        nl = buf.index(b"\n", pos)
        parts = buf[pos:nl].decode().split()
        if parts[-1] == "missing":
            out[sha] = ""
            pos = nl + 1
            continue
        size = int(parts[2])
        out[sha] = buf[nl + 1 : nl + 1 + size].decode("utf-8", errors="replace")
        pos = nl + 1 + size + 1
    return out


def chunk_file(path: str, text: str) -> list[dict]:
    lines = text.splitlines()
    if not lines:
        return []
    chunks = []
    step = CHUNK_LINES - OVERLAP
    for start in range(0, len(lines), step):
        seg = lines[start : start + CHUNK_LINES]
        if not seg:
            break
        body = "\n".join(seg)
        chunks.append({
            "path": path,
            "start_line": start + 1,
            "end_line": start + len(seg),
            "text": f"{path}\n{body}",
        })
        if start + CHUNK_LINES >= len(lines):
            break
    return chunks


class EmbCache:
    def __init__(self) -> None:
        self.keys: dict[str, int] = {}
        self.vecs: np.ndarray | None = None
        if CACHE_VEC.exists() and CACHE_KEY.exists():
            self.vecs = np.load(CACHE_VEC)
            self.keys = json.loads(CACHE_KEY.read_text())

    def save(self) -> None:
        np.save(CACHE_VEC, self.vecs)
        CACHE_KEY.write_text(json.dumps(self.keys))


def main() -> None:
    from sentence_transformers import SentenceTransformer

    IDX_DIR.mkdir(exist_ok=True)
    checkpoints = json.loads((EXP_DIR / "config" / "checkpoints.json").read_text(encoding="utf-8"))
    states: set[str] = set()
    for b in checkpoints["baselines"].values():
        states.add(b["s0"])
        states.update(cp["commit"] for cp in b["checkpoints"])

    model = SentenceTransformer(MODEL_NAME, device="cpu")
    cache = EmbCache()

    for n, commit in enumerate(sorted(states), 1):
        out_npz = IDX_DIR / f"{commit}.npz"
        if out_npz.exists():
            print(f"[{n}/{len(states)}] {commit[:9]} ja indexado, pulando")
            continue
        entries = blob_map(commit)
        blobs = read_blobs([sha for sha, _ in entries])
        chunks: list[dict] = []
        for sha, path in entries:
            chunks.extend(chunk_file(path, blobs[sha]))

        hashes = [hashlib.sha256(c["text"].encode()).hexdigest() for c in chunks]
        missing_idx = [i for i, h in enumerate(hashes) if h not in cache.keys]
        if missing_idx:
            texts = ["passage: " + chunks[i]["text"] for i in missing_idx]
            new_vecs = model.encode(
                texts, batch_size=64, normalize_embeddings=True,
                show_progress_bar=False,
            ).astype(np.float32)
            base = 0 if cache.vecs is None else len(cache.vecs)
            cache.vecs = new_vecs if cache.vecs is None else np.vstack([cache.vecs, new_vecs])
            for j, i in enumerate(missing_idx):
                cache.keys[hashes[i]] = base + j
            cache.save()

        mat = cache.vecs[[cache.keys[h] for h in hashes]]
        np.savez_compressed(out_npz, vectors=mat)
        meta = [{k: c[k] for k in ("path", "start_line", "end_line")} for c in chunks]
        (IDX_DIR / f"{commit}.meta.json").write_text(json.dumps(meta), encoding="utf-8")
        print(f"[{n}/{len(states)}] {commit[:9]} {len(chunks)} chunks "
              f"({len(missing_idx)} novos embeddings)")

    print("indices concluidos")


if __name__ == "__main__":
    main()
