#!/usr/bin/env python3
"""
Minimal agent orchestrator for the ABA app.

What it does on each run:
1) Ensures git repo + dashboard file exist.
2) Makes a tiny UTF-8-safe change to prove the loop works.
3) Installs deps (Windows-friendly npm/npx detection).
4) Runs Playwright tests.
5) Writes agent/reports/latest.json.
"""

import os
import sys
import json
import datetime
import subprocess
import pathlib
import platform
from typing import Tuple

# ---- Paths ----
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"
SERVER_DIR = REPO_ROOT / "server"
TASK_DIR = REPO_ROOT / "agent" / "tasks"
REPORTS_DIR = REPO_ROOT / "agent" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

IS_WINDOWS = os.name == "nt" or platform.system().lower().startswith("win")

def bin_name(name: str) -> str:
    # On Windows, the npm/npx launchers are *.cmd
    if IS_WINDOWS and name in {"npm", "npx"}:
        return f"{name}.cmd"
    return name

def sh(cmd, cwd=None, check=True, env=None):
    """Run a command with live output."""
    cmd = [bin_name(c) if i == 0 else c for i, c in enumerate(cmd)]
    print(f"$ {' '.join(cmd)}  (cwd={cwd or REPO_ROOT})")
    return subprocess.run(
        cmd,
        cwd=str(cwd or REPO_ROOT),
        check=check,
        env=env if env is not None else os.environ.copy(),
    )

def ensure_git_repo():
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
    target = APP_DIR / "src" / "modules" / "DashboardPage.tsx"
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        print("[agent] Creating minimal DashboardPage.tsx")
        content = (
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
    """Make a tiny UTF-8-safe change to prove the loop works."""
    example_file = APP_DIR / "src" / "modules" / "DashboardPage.tsx"
    ensure_dashboard_file()

    src = example_file.read_text(encoding="utf-8")
    if "Welcome to the Dashboard" in src and "🚀" not in src:
        src = src.replace("Welcome to the Dashboard", "Welcome to the Dashboard 🚀")
    else:
        src += "\n// (agent) touched\n"
    example_file.write_text(src, encoding="utf-8")

    try:
        sh(["git", "add", "."])
        sh([
            "git",
            "-c", "user.email=agent@example.com",
            "-c", "user.name=ABA Agent",
            "commit", "-m", "chore(agent): trivial change to prove loop"
        ], check=False)
    except Exception as e:
        print(f"[agent] Skipping git commit due to error: {e}")

def ensure_node_tools():
    """Log versions for diagnostics; don't hard-fail."""
    try:
        sh(["node", "-v"])
    except Exception as e:
        print(f"[agent] Warning: node not found in PATH: {e}")
    try:
        sh(["npm", "--version"])
    except Exception as e:
        print(f"[agent] Warning: npm not found in PATH: {e}")
    try:
        sh(["npx", "--version"])
    except Exception as e:
        print(f"[agent] Warning: npx not found in PATH: {e}")

def npm_install_with_fallback(app_dir: pathlib.Path):
    lockfile = app_dir / "package-lock.json"
    try:
        if lockfile.exists():
            sh(["npm", "ci"], cwd=app_dir)
        else:
            sh(["npm", "install"], cwd=app_dir)
    except subprocess.CalledProcessError:
        sh(["npm", "install"], cwd=app_dir)

def playwright_install(app_dir: pathlib.Path):
    # On Windows, no --with-deps
    if IS_WINDOWS:
        sh(["npx", "playwright", "install"], cwd=app_dir)
    else:
        sh(["npx", "playwright", "install", "--with-deps"], cwd=app_dir)

def run_tests() -> Tuple[bool, str]:
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

def main():
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[agent] run at {ts}")

    ensure_git_repo()
    ensure_node_tools()
    plan_and_generate()
    ok, msg = run_tests()

    summary = {"timestamp": ts, "tests_ok": ok, "message": msg}
    (REPORTS_DIR / "latest.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("[agent] summary:", json.dumps(summary))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
