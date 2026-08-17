"""Calcula D0, Novelty, Ghost Mass e baselines B1-B4 para cada checkpoint.

Saida: results/checkpoints_d0.csv
Formula V0 congelada em config/preregistration.txt. Nao alterar apos retrieval.
"""
import csv
import json
import math
from datetime import datetime

from gitutil import CONFIG, EXP_DIR, commit_date, git, loc_map, numstat, rename_count


def compute_state(s0: str, st: str) -> dict:
    loc0 = loc_map(s0)
    loct = loc_map(st)
    ns, binaries = numstat(s0, st)
    universe = set(loc0) | set(loct)

    total_mass = 0.0
    weighted = 0.0
    novelty_mass = 0.0
    ghost_mass = 0.0
    changed = 0
    total_add = 0
    total_del = 0

    for f in universe:
        l0 = loc0.get(f, 0)
        lt = loct.get(f, 0)
        m = math.log(1 + max(l0, lt))
        add, dele = ns.get(f, (0, 0))
        denom = l0 + lt
        if f in ns and denom > 0:
            delta = min(1.0, (add + dele) / denom)
        elif f in ns:
            delta = 0.0
        elif (f in loc0) != (f in loct):
            # presente em so um estado mas fora do numstat (nao deveria ocorrer)
            delta = 1.0
        else:
            delta = 0.0
        total_mass += m
        weighted += m * delta
        total_add += add
        total_del += dele
        if f in ns:
            changed += 1
        if f not in loc0 and f in loct:
            novelty_mass += m
        if f in loc0 and f not in loct:
            ghost_mass += m

    loc_s0 = sum(loc0.values())
    loc_st = sum(loct.values())
    d0 = weighted / total_mass if total_mass else 0.0
    b3 = int(git("rev-list", "--first-parent", "--count", f"{s0}..{st}").strip())
    dt0 = datetime.fromisoformat(commit_date(s0))
    dtt = datetime.fromisoformat(commit_date(st))
    return {
        "d0": round(d0, 6),
        "novelty": round(novelty_mass / total_mass, 6) if total_mass else 0.0,
        "ghost_mass": round(ghost_mass / total_mass, 6) if total_mass else 0.0,
        "changed_files_ratio": round(changed / len(universe), 6) if universe else 0.0,
        "line_churn": round((total_add + total_del) / (loc_s0 + loc_st), 6)
        if (loc_s0 + loc_st)
        else 0.0,
        "commits_since_s0": b3,
        "days_since_s0": round((dtt - dt0).total_seconds() / 86400, 2),
        "n_files_s0": len(loc0),
        "n_files_st": len(loct),
        "n_files_union": len(universe),
        "n_changed_files": changed,
        "n_added_files": sum(1 for f in universe if f not in loc0),
        "n_deleted_files": sum(1 for f in universe if f not in loct),
        "loc_s0": loc_s0,
        "loc_st": loc_st,
        "added_lines": total_add,
        "deleted_lines": total_del,
        "binaries_ignored": binaries,
        "renames_detected_M50": rename_count(s0, st),
    }


def main() -> None:
    checkpoints = json.loads(
        (EXP_DIR / "config" / "checkpoints.json").read_text(encoding="utf-8")
    )
    rows = []
    for name, base in checkpoints["baselines"].items():
        s0 = base["s0"]
        for cp in base["checkpoints"]:
            st = cp["commit"]
            row = {
                "repo": CONFIG["repo"],
                "baseline": name,
                "state": st[:9],
                "state_date": cp["date"][:10],
                "subject": cp["subject"],
            }
            row.update(compute_state(s0, st))
            rows.append(row)
            print(f"[{name}] {st[:9]} {cp['date'][:10]} d0={row['d0']:.4f} "
                  f"N={row['novelty']:.3f} G={row['ghost_mass']:.3f} "
                  f"renames={row['renames_detected_M50']}")

    out = EXP_DIR / "results" / "checkpoints_d0.csv"
    out.parent.mkdir(exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n{len(rows)} checkpoints gravados em {out}")


if __name__ == "__main__":
    main()
