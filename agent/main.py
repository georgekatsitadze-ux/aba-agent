#!/usr/bin/env python3
"""
Agent orchestrator for the ABA app.

What it does on each run:
1) Ensures a git repo and a minimal dashboard file exist.
2) Tries LLM-based code generation (agent/generator.py); if unavailable, makes a tiny safe edit.
3) Installs app deps and runs Playwright tests (app/).
4) Writes agent/reports/latest.json with the result.

Tip for LLM generation:
  pip install requests pyyaml
  set OPENAI_API_KEY=...  (or $env:OPENAI_API_KEY in PowerShell)
"""

import os
import sys
import json
import datetime
import subprocess
import pathlib
import platform
from typing import Tuple

# ---- Paths / setup ----
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"
REPORTS_DIR = REPO_ROOT / "agent" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

IS_WINDOWS = os.name == "nt" or platform.system().lower().startswith("win")


def _bin(name: str) -> str:
    # On Windows, npm/npx launchers are *.cmd
    if IS_WINDOWS and name in {"npm", "npx"}:
        return f"{name}.cmd"
    return name


def sh(cmd, cwd=None, check=True, env=None):
    """Run a command with live output."""
    if isinstance(cmd, (list, tuple)):
        cmd = [ _bin(cmd[0]) ] + list(cmd[1:])
    else:
        raise ValueError("sh(cmd) expects a list like ['npm','test']")
    print(f"$ {' '.join(cmd)}  (cwd={cwd or REPO_ROOT})")
    return subprocess.run(
        cmd,
        cwd=str(cwd or REPO_ROOT),
        check=check,
        env=env if env is not None else os.environ.copy(),
    )


def ensure_git_repo():
    """Initialize a git repo if needed."""
    try:
        sh(["git", "rev-parse", "--is-inside-work-tree"])
        return
    except subprocess.CalledProcessError:
        pass

    print("[agent] Initializing new git repository...")
    sh(["git", "init"])
    sh(["git", "add", "."])
    sh([
        "git",
        "-c", "user.email=agent@example.com",
        "-c", "user.name=ABA Agent",
        "commit", "-m", "chore(agent): initial commit"
    ], check=False)


def ensure_dashboard_file():
    """Create a minimal dashboard page if missing (UTF-8)."""
    target = APP_DIR / "src" / "modules" / "DashboardPage.tsx"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        content = (
            'import React from "react";\n\n'
            'export default function DashboardPage(){\n'
            '  return (\n'
            '    <div>\n'
            '      <h2>Welcome to the Dashboard</h2>\n'
            '      <p>Quick links and KPIs will go here.</p>\n'
            '    </div>\n'
            '  );\n'
            '}\n'
        )
        target.write_text(content, encoding="utf-8")


def plan_and_generate():
    from agent.generator import generate_once
    passes = int(os.getenv("AGENT_PASSES", "3"))
    for i in range(1, passes+1):
        print(f"[agent] pass {i}/{passes}")
        try:
            out = generate_once()
            print("[agent] edits:", out.get("changed", []))
            if out.get("notes"): print("[agent] notes:", out["notes"])
        except Exception as e:
            print(f"[agent] generator error on pass {i}: {e}")
            break
        # commit after each pass
        try:
            sh(["git","add","."])
            sh(["git","-c","user.email=agent@example.com","-c","user.name=ABA Agent",
                "commit","-m",f"feat(agent): design pass {i}"], check=False)
        except Exception as e:
            print(f"[agent] git commit skipped: {e}")


def ensure_node_tools():
    """Log Node/npm/npx versions for diagnostics."""
    try: sh(["node", "-v"])
    except Exception as e: print(f"[agent] warning: node not found: {e}")
    try: sh(["npm", "--version"])
    except Exception as e: print(f"[agent] warning: npm not found: {e}")
    try: sh(["npx", "--version"])
    except Exception as e: print(f"[agent] warning: npx not found: {e}")


def npm_install_with_fallback(app_dir: pathlib.Path):
    """Prefer npm ci when lockfile exists, else npm install; fallback to install on failure."""
    lockfile = app_dir / "package-lock.json"
    try:
        if lockfile.exists():
            sh(["npm", "ci"], cwd=app_dir)
        else:
            sh(["npm", "install"], cwd=app_dir)
    except subprocess.CalledProcessError:
        sh(["npm", "install"], cwd=app_dir)


def playwright_install(app_dir: pathlib.Path):
    """Install Playwright browsers (no --with-deps on Windows)."""
    cmd = ["npx", "playwright", "install"]
    if not IS_WINDOWS:
        cmd.append("--with-deps")
    sh(cmd, cwd=app_dir)


def run_tests() -> Tuple[bool, str]:
    """
    Install deps and run Playwright tests in the app.
    The Playwright config controls whether it uses dev or preview.
    """
    try:
        npm_install_with_fallback(APP_DIR)
        playwright_install(APP_DIR)
        sh(["npm", "test", "--", "--reporter=line"], cwd=APP_DIR)
        return True, "Playwright tests passed."
    except subprocess.CalledProcessError as e:
        return False, f"Tests failed with exit code {e.returncode}."
    except FileNotFoundError as e:
        return False, f"Command not found: {e}"
    except Exception as e:
        return False, f"Unexpected error: {e}"


def write_report(ok: bool, msg: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    summary = {"timestamp": ts, "tests_ok": ok, "message": msg}
    (REPORTS_DIR / "latest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("[agent] summary:", json.dumps(summary))


def main():
    print(f"[agent] run at {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    ensure_git_repo()
    ensure_node_tools()
    ensure_dashboard_file()
    plan_and_generate()
    ok, msg = run_tests()
    write_report(ok, msg)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
