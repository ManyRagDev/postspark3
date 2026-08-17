"""Executa retrieval stale vs fresh para cada checkpoint e grava resultados por query.

Para cada baseline e checkpoint St:
  - stale  = indice de S0 (congelado)
  - fresh  = indice de St
  - queries elegiveis em St (benchmark/eligibility.json)
  - ranking em NIVEL DE ARQUIVO: score do arquivo = max(similaridade dos chunks);
    metricas sobre a lista de arquivos distintos ordenada por score.

Saida: results/per_query.csv
"""
import csv
import json

import numpy as np

from gitutil import CONFIG, EXP_DIR, IDX_DIR, RES_DIR

KS = (1, 3, 5, 10)


def load_index(commit: str):
    vecs = np.load(IDX_DIR / f"{commit}.npz")["vectors"]
    meta = json.loads((IDX_DIR / f"{commit}.meta.json").read_text(encoding="utf-8"))
    return vecs, meta


def file_ranking(qvec: np.ndarray, vecs: np.ndarray, meta: list[dict]) -> list[str]:
    sims = vecs @ qvec
    best: dict[str, float] = {}
    for s, m in zip(sims, meta):
        p = m["path"]
        if p not in best or s > best[p]:
            best[p] = float(s)
    return [p for p, _ in sorted(best.items(), key=lambda kv: -kv[1])]


def metrics(ranking: list[str], relevant: set[str]) -> dict:
    out = {}
    for k in KS:
        top = ranking[:k]
        out[f"recall{k}"] = sum(1 for f in relevant if f in top) / len(relevant)
    first = next((i + 1 for i, f in enumerate(ranking) if f in relevant), None)
    out["mrr"] = 1.0 / first if first else 0.0
    out["first_rank"] = first if first else -1
    return out


def main() -> None:
    from sentence_transformers import SentenceTransformer

    checkpoints = json.loads((EXP_DIR / "config" / "checkpoints.json").read_text(encoding="utf-8"))
    bench = json.loads((EXP_DIR / "benchmark" / "queries.json").read_text(encoding="utf-8"))
    elig = json.loads((EXP_DIR / "benchmark" / "eligibility.json").read_text(encoding="utf-8"))
    queries = {q["id"]: q for q in bench["queries"]}

    model = SentenceTransformer(CONFIG["retrieval"]["embedding_model"], device="cpu")
    qvecs = {
        qid: model.encode(
            CONFIG["retrieval"]["query_prefix"] + q["query"], normalize_embeddings=True
        ).astype(np.float32)
        for qid, q in queries.items()
    }

    rows = []
    cache: dict[str, tuple] = {}

    def idx(commit: str):
        if commit not in cache:
            cache[commit] = load_index(commit)
        return cache[commit]

    for bname, base in checkpoints["baselines"].items():
        s0 = base["s0"]
        stale_vecs, stale_meta = idx(s0)
        for cp in base["checkpoints"]:
            st = cp["commit"]
            fresh_vecs, fresh_meta = idx(st)
            for qid, q in queries.items():
                e = elig[qid][st]
                if not e["eligible"]:
                    continue
                relevant = set(e["relevant_files"])
                qv = qvecs[qid]
                m_stale = metrics(file_ranking(qv, stale_vecs, stale_meta), relevant)
                m_fresh = metrics(file_ranking(qv, fresh_vecs, fresh_meta), relevant)
                rows.append({
                    "repo": CONFIG["repo"], "baseline": bname, "state": st[:9],
                    "query_id": qid, "query_type": q["type"], "eligible": 1,
                    "n_relevant": len(relevant),
                    "stale_rank": m_stale["first_rank"], "fresh_rank": m_fresh["first_rank"],
                    **{f"{k}_stale": round(v, 6) for k, v in m_stale.items() if k != "first_rank"},
                    **{f"{k}_fresh": round(v, 6) for k, v in m_fresh.items() if k != "first_rank"},
                })
            print(f"[{bname}] {st[:9]} ok ({sum(1 for r in rows if r['state']==st[:9] and r['baseline']==bname)} queries)")

    RES_DIR.mkdir(exist_ok=True)
    out = RES_DIR / "per_query.csv"
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\n{len(rows)} linhas gravadas em {out}")


if __name__ == "__main__":
    main()
