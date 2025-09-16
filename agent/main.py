
#!/usr/bin/env python3
"""
Minimal agent orchestrator for the ABA app.

What it does on each run:
1) Ensures the repo and dashboard file exist.
2) Makes a tiny, safe change (UTF-8 friendly) to prove the loop works.
3) Installs deps (with Windows-friendly fallbacks).
4) Runs Playwright tests for the app.
5) Writes a JSON report to agent/reports/latest.json.

You can later replace `plan_and_generate()` with real code generation.
"""

import os
import sys
import json
import datetime
import subprocess
import pathlib
import platform
from typing import Tuple

# ---- Configuration ----
REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_DIR = REPO_ROOT / "app"
SERVER_DIR = REPO_ROOT / "server"
TASK_DIR = REPO_ROOT / "agent" / "tasks"
REPORTS_DIR = REPO_ROOT / "agent" / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

def sh(cmd, cwd=None, check=True, env=None):
    """Run a shell command with live output."""
    print(f"$ {' '.join(cmd)}  (cwd={cwd or REPO_ROOT})")
    return subprocess.run(
        cmd,
        cwd=str(cwd or REPO_ROOT),
        check=check,
        env=env if env is not None else os.environ.copy(),
    )

def ensure_git_repo():
    """Initialize a git repo if one does not exist."""
    try:
        sh(["git", "rev-parse", "--is-inside-work-tree"])
        return
    except subprocess.CalledProcessError:
        pass

    print("[agent] Initializing new git repository...")
    sh(["git", "init"])
    # Make an initial commit if there isn't one yet
    sh(["git", "add", "."])
    # Use -c flags to avoid requiring global user config
    sh([
        "git",
        "-c", "user.email=agent@example.com",
        "-c", "user.name=ABA Agent",
        "commit", "-m", "chore(agent): initial commit"
    ], check=False)

def ensure_dashboard_file():
    """Create a minimal dashboard page if it doesn't exist yet."""
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
    """
    Generates a trivial change to prove the loop works.
    Explicitly uses UTF-8 to avoid Windows cp1252 issues.
    """
    example_file = APP_DIR / "src" / "modules" / "DashboardPage.tsx"
    ensure_dashboard_file()

    src = example_file.read_text(encoding="utf-8")
    # Replace or append the rocket once
    if "Welcome to the Dashboard" in src and "🚀" not in src:
        src = src.replace(
            "Welcome to the Dashboard",
            "Welcome to the Dashboard 🚀"
        )
    else:
        # If the exact text isn't found, just append a harmless marker
        src += "\n// (agent) touched\n"

    example_file.write_text(src, encoding="utf-8")

    # Stage + commit (don't fail the whole run if git isn't configured)
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

def npm_install_with_fallback(app_dir: pathlib.Path):
    """
    Prefer 'npm ci' if a lockfile exists; otherwise 'npm i'.
    """
    lockfile = app_dir / "package-lock.json"
    try:
        if lockfile.exists():
            sh(["npm", "ci"], cwd=app_dir)
        else:
            sh(["npm", "install"], cwd=app_dir)
    except subprocess.CalledProcessError:
        # Fallback to 'npm install' if 'npm ci' fails for any reason
        sh(["npm", "install"], cwd=app_dir)

def playwright_install(app_dir: pathlib.Path):
    """
    Install browsers. On Windows, '--with-deps' isn't needed.
    """
    is_windows = platform.system().lower().startswith("win")
    if is_windows:
        sh(["npx", "playwright", "install"], cwd=app_dir)
    else:
        sh(["npx", "playwright", "install", "--with-deps"], cwd=app_dir)

def run_tests() -> Tuple[bool, str]:
    """
    Install deps and run Playwright tests in the app.
    Returns (ok, message).
    """
    try:
        npm_install_with_fallback(APP_DIR)
        playwright_install(APP_DIR)
        # Run tests with a simple reporter for CI-like output
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
    plan_and_generate()
    ok, msg = run_tests()

    summary = {
        "timestamp": ts,
        "tests_ok": ok,
        "message": msg,
    }
    (REPORTS_DIR / "latest.json").write_text(
        json.dumps(summary, indent=2),
        encoding="utf-8"
    )
    print("[agent] summary:", json.dumps(summary))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
