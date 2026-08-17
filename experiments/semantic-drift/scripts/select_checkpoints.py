"""Aplica a regra pre-registrada de selecao de checkpoints e grava config/checkpoints.json.

Regra (preregistration.txt): rev-list --first-parent --reverse S0..HEAD,
indice 1-based, selecionar i % step == 0, incluir HEAD se ausente.
"""
import json

from gitutil import CONFIG, EXP_DIR, commit_date, git


def main() -> None:
    head = CONFIG["head"]
    out = {"head": head, "baselines": {}}
    for name, base in CONFIG["baselines"].items():
        commits = git("rev-list", "--first-parent", "--reverse", f"{base['s0']}..{head}").split()
        step = base["selection_step"]
        selected = [c for i, c in enumerate(commits, start=1) if i % step == 0]
        if commits and commits[-1] not in selected:
            selected.append(commits[-1])
        out["baselines"][name] = {
            "s0": base["s0"],
            "s0_date": commit_date(base["s0"]),
            "total_commits_after_s0": len(commits),
            "checkpoints": [
                {
                    "commit": c,
                    "index_since_s0": commits.index(c) + 1,
                    "date": commit_date(c),
                    "subject": git("log", "-1", "--format=%s", c).strip(),
                }
                for c in selected
            ],
        }
    path = EXP_DIR / "config" / "checkpoints.json"
    path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    for name, b in out["baselines"].items():
        print(f"baseline {name}: {len(b['checkpoints'])} checkpoints "
              f"(de {b['total_commits_after_s0']} commits apos S0)")
    print(f"gravado em {path}")


if __name__ == "__main__":
    main()
