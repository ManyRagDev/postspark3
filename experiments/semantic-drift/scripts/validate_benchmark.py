"""Valida o painel de queries contra todos os checkpoints (sem retrieval).

Para cada (query, estado): elegivel se o anchor casa via git grep -E no commit
E >=1 relevant_file existe no commit. Conjunto relevante = relevant_files
existentes no estado. Flags: query nunca elegivel, estados com <15 queries
elegiveis, anchor casando 0 arquivos relevantes.
Saida: benchmark/eligibility.json + relatorio no stdout.
"""
import json
import subprocess

from gitutil import EXP_DIR, REPO_DIR, in_universe


def files_at(commit: str) -> set[str]:
    out = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", commit],
        cwd=REPO_DIR, capture_output=True, check=True,
    ).stdout.decode("utf-8", errors="replace")
    return {p for p in out.splitlines() if in_universe(p)}


def anchor_hits(commit: str, anchor: str) -> set[str]:
    proc = subprocess.run(
        ["git", "grep", "-l", "-E", anchor, commit, "--",
         "client", "server", "shared", "api", "drizzle", "scripts", "lib"],
        cwd=REPO_DIR, capture_output=True,
    )
    hits = set()
    for line in proc.stdout.decode("utf-8", errors="replace").splitlines():
        if ":" in line:
            hits.add(line.split(":", 1)[1])
    return {h for h in hits if in_universe(h)}


def main() -> None:
    checkpoints = json.loads((EXP_DIR / "config" / "checkpoints.json").read_text(encoding="utf-8"))
    bench = json.loads((EXP_DIR / "benchmark" / "queries.json").read_text(encoding="utf-8"))
    states = sorted({cp["commit"] for b in checkpoints["baselines"].values() for cp in b["checkpoints"]})

    file_cache = {c: files_at(c) for c in states}
    result: dict[str, dict] = {}
    for q in bench["queries"]:
        per_state = {}
        for c in states:
            existing = [f for f in q["relevant_files"] if f in file_cache[c]]
            hits = anchor_hits(c, q["anchor"]) if existing else set()
            eligible = bool(existing) and bool(hits)
            per_state[c] = {
                "eligible": eligible,
                "relevant_files": existing,
                "anchor_hit_count": len(hits),
            }
        result[q["id"]] = per_state
        n_elig = sum(1 for v in per_state.values() if v["eligible"])
        max_hits = max((v["anchor_hit_count"] for v in per_state.values()), default=0)
        flag = ""
        if n_elig == 0:
            flag = "  << NUNCA ELEGIVEL"
        elif max_hits > 40:
            flag = f"  << ANCHOR AMPLO ({max_hits} arquivos)"
        print(f"{q['id']} [{q['type']:22s}] elegivel em {n_elig}/{len(states)} estados{flag}")

    print("\n--- queries elegiveis por estado ---")
    problems = []
    for c in states:
        n = sum(1 for qid in result if result[qid][c]["eligible"])
        mark = ""
        if n < 15:
            mark = "  << ABAIXO DO MINIMO (15)"
            problems.append(c)
        print(f"{c[:9]}: {n}{mark}")
    if problems:
        print(f"\nATENCAO: {len(problems)} estados abaixo do minimo.")

    out = EXP_DIR / "benchmark" / "eligibility.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"\ngravado em {out}")


if __name__ == "__main__":
    main()
