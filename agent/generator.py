# agent/generator.py
import os, json, pathlib, textwrap
from typing import List, Dict, Any
import requests, yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SCHEMA_NOTE = """
Return ONLY valid JSON with this shape:
{
  "edits": [
    {"path": "relative/path/from/repo/root.ext", "contents": "FULL file contents as UTF-8 text"}
  ],
  "notes": "short rationale"
}
No Markdown, no backticks, no prose outside JSON. New files must include full contents.
"""

SYSTEM = """You are a senior full-stack engineer working on a Vite+React (TypeScript) frontend and a Node/Express API.
Write minimal, compiling edits. Keep it clean-room: mirror behaviors, never copy third-party text/assets."""

def read_tasks() -> str:
    buf = []
    task_dir = REPO_ROOT / "agent" / "tasks"
    for p in sorted(task_dir.glob("*.yaml")):
        try:
            t = yaml.safe_load(p.read_text(encoding="utf-8"))
            title = t.get("title", p.name)
            buf.append(f"# Task: {title}\n{yaml.safe_dump(t, sort_keys=False)}")
        except Exception as e:
            buf.append(f"# Task {p.name} could not be parsed: {e}")
    return "\n\n".join(buf)

def repo_snapshot() -> str:
    """
    Provide a compact snapshot of important files.
    Truncate long files to keep the prompt small.
    """
    keep_dirs = ["app/src", "app/tests", "server"]
    lines = []
    for rel in keep_dirs:
        base = REPO_ROOT / rel
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if p.is_dir():
                continue
            rp = p.relative_to(REPO_ROOT).as_posix()
            if not any(rp.endswith(ext) for ext in (".tsx",".ts",".js",".json",".mts",".yaml",".yml")):
                continue
            try:
                txt = p.read_text(encoding="utf-8")
            except Exception:
                continue
            if len(txt) > 4000:
                txt = txt[:3500] + "\n/* ... truncated ... */\n" + txt[-400:]
            lines.append(f"\n--- {rp} ---\n{txt}")
    return "\n".join(lines)

def call_llm(task_spec: str, snapshot: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    prompt = f"""You will propose concrete code edits to move the project forward.

{SCHEMA_NOTE}

Repository snapshot:
{snapshot}

Tasks / goals:
{task_spec}

Rules:
- Edits must compile and keep tests green.
- Include FULL file contents for any file you edit or create.
- Stay minimal and idiomatic.
"""

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    r = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=body, timeout=180)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)

def apply_edits(edits: List[Dict[str, str]]) -> List[str]:
    written = []
    for ed in edits:
        rel = ed["path"].replace("\\", "/").lstrip("/")
        dst = REPO_ROOT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(ed["contents"], encoding="utf-8", newline="\n")
        written.append(rel)
    return written

def generate_once() -> Dict[str, Any]:
    spec = read_tasks()
    snap = repo_snapshot()
    result = call_llm(spec, snap)
    changed = apply_edits(result.get("edits", []))
    return {"changed": changed, "notes": result.get("notes", "")}
