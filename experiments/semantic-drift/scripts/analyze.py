"""Analise pre-registrada: Spearman unilateral D0 vs Retrieval Loss (Recall@5).

Junta results/checkpoints_d0.csv + results/per_query.csv, agrega por checkpoint,
gera results/final_dataset.csv e imprime o teste primario + baselines B1-B4.
Secundarias e bootstrap marcados como exploratorios.
"""
import csv
import json
from collections import defaultdict

import numpy as np
from scipy import stats

from gitutil import EXP_DIR, RES_DIR

RES = RES_DIR


def read_csv(path):
    with path.open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    d0_rows = {(r["baseline"], r["state"]): r for r in read_csv(RES / "checkpoints_d0.csv")}
    pq = read_csv(RES / "per_query.csv")

    agg: dict[tuple, dict] = defaultdict(lambda: defaultdict(list))
    for r in pq:
        key = (r["baseline"], r["state"])
        for col in ("recall1", "recall3", "recall5", "recall10", "mrr"):
            agg[key][f"{col}_stale"].append(float(r[f"{col}_stale"]))
            agg[key][f"{col}_fresh"].append(float(r[f"{col}_fresh"]))

    rows = []
    for key, vals in sorted(agg.items()):
        d = d0_rows[key]
        row = {
            "repo": d["repo"], "baseline": key[0], "state": key[1],
            "commit": key[1], "d0": float(d["d0"]),
            "novelty": float(d["novelty"]), "ghost_mass": float(d["ghost_mass"]),
            "changed_files_ratio": float(d["changed_files_ratio"]),
            "line_churn": float(d["line_churn"]),
            "commits_since_s0": int(d["commits_since_s0"]),
            "days_since_s0": float(d["days_since_s0"]),
            "n_queries": len(vals["recall5_stale"]),
        }
        for col in ("recall1", "recall3", "recall5", "recall10", "mrr"):
            row[f"{col}_stale"] = round(float(np.mean(vals[f"{col}_stale"])), 6)
            row[f"{col}_fresh"] = round(float(np.mean(vals[f"{col}_fresh"])), 6)
        row["retrieval_loss"] = round(row["recall5_fresh"] - row["recall5_stale"], 6)
        rows.append(row)

    out = RES / "final_dataset.csv"
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    D = np.array([r["d0"] for r in rows])
    L = np.array([r["retrieval_loss"] for r in rows])

    print("=" * 70)
    print("TESTE PRIMARIO (pre-registrado): Spearman unilateral, H1: rho > 0")
    print(f"n = {len(rows)} checkpoints (pool A+B)")
    rho, p = stats.spearmanr(D, L, alternative="greater")
    print(f"rho_s(D0, L) = {rho:.4f}   p = {p:.6f}   alpha = 0.05")
    print("REJEITA H0" if p < 0.05 else "NAO rejeitamos H0 (sem evidencia suficiente)")

    print("\nPor baseline (pre-registrado como reporte separado):")
    for b in ("A", "B"):
        sub = [r for r in rows if r["baseline"] == b]
        rb, pb = stats.spearmanr(
            [r["d0"] for r in sub], [r["retrieval_loss"] for r in sub], alternative="greater"
        )
        print(f"  {b}: n={len(sub)}  rho_s={rb:.4f}  p={pb:.6f}")

    print("\nBASELINES TRIVIAIS vs L (mesmo teste):")
    for name, col in [("B1 changed_files_ratio", "changed_files_ratio"),
                      ("B2 line_churn", "line_churn"),
                      ("B3 commits_since_s0", "commits_since_s0"),
                      ("B4 days_since_s0", "days_since_s0")]:
        X = np.array([r[col] for r in rows], dtype=float)
        rb, pb = stats.spearmanr(X, L, alternative="greater")
        print(f"  {name:26s} rho_s={rb:.4f}  p={pb:.6f}")

    print("\nEXPLORATORIO (pos-hoc, nao decisorio):")
    for col in ("mrr", "recall1", "recall10"):
        Lx = np.array([r[f"{col}_fresh"] - r[f"{col}_stale"] for r in rows])
        rb, pb = stats.spearmanr(D, Lx, alternative="greater")
        print(f"  rho_s(D0, delta {col}) = {rb:.4f}  p={pb:.6f}")
    rng = np.random.default_rng(42)
    boots = []
    n = len(rows)
    for _ in range(10000):
        idx = rng.integers(0, n, n)
        if len(set(L[idx])) > 1 and len(set(D[idx])) > 1:
            boots.append(stats.spearmanr(D[idx], L[idx]).statistic)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    print(f"  bootstrap IC95% de rho_s (exploratorio): [{lo:.4f}, {hi:.4f}]")

    stale_means = [r["recall5_stale"] for r in rows]
    fresh_means = [r["recall5_fresh"] for r in rows]
    print(f"\nSanidade: Recall@5 fresh medio = {np.mean(fresh_means):.4f} "
          f"(criterio de parada: < 0.40), stale medio = {np.mean(stale_means):.4f}")
    print(f"dataset final: {out}")


if __name__ == "__main__":
    main()
