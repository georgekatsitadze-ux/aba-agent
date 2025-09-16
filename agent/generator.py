# agent/generator.py
import os, json, pathlib, glob, textwrap
from typing import List, Dict, Any
import requests, yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

SCHEMA_NOTE = """
Return ONLY valid JSON with this shape:
{
  "edits": [
    {"path": "relative/path/from/repo/root.ext", "contents": "FULL file contents as UTF-8 text"},
    ...
  ],
  "notes": "short rationale"
}
No Markdown, no backticks, no prose outside JSON. If you create new files, include their full contents.
"""

SYSTEM = """You are a senior full-stack engineer. You edit a Vite+React (TS) app and a Node/Express API.
Follow a clean-room approach: implement behaviors, never copy vendor text/assets."""

def read_tasks() -> str:
    buf = []
    for p in sorted((REPO_ROOT / "agent" / "tasks").glob("*.yaml")):
        try:
            t = yaml.safe_load(p.read_text(encoding="utf-8"))
            buf.append(f"# Task: {t.get('title')}\n{yaml.safe_dump(t, sort_keys=False)}")
        except Exception as e:
            buf.append(f"# Task {p.name} could not be parsed: {e}")
    return "\n\n".join(buf)

def repo_snapshot() -> str:
    # Keep prompt slim: include only important file listings
    keep = ["app/src", "app/tests", "server"]
    lines = []
    for root in keep:
        base = REPO_ROOT / root
        if not base.exists(): continue
        for p in base.rglob("*"):
            if p.is_dir(): continue
            rel = p.relative_to(REPO_ROOT).as_posix()
            if any(rel.endswith(ext) for ext in [".tsx",".ts",".js",".mts",".json",".yml",".yaml"]):
                try:
                    txt = p.read_text(encoding="utf-8")
                    # truncate long files in prompt
                    if len(txt) > 4000:
                        txt = txt[:3500] + "\n/* ... truncated ... */\n" + txt[-400:]
                    lines.append(f"\n--- {rel} ---\n{txt}")
                except Exception:
                    pass
    return "\n".join(lines)

def call_llm(task_spec: str, snapshot: str) -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    prompt = f"""You will propose concrete code edits to progress the tasks.

{SCHEMA_NOTE}

Repository snapshot (selected files):
{snapshot}

Tasks / goals:
{task_spec}

Write edits that:
- compile and run tests,
- keep code idiomatic,
- minimize changes,
- include full file contents for every edited/added file.
"""

    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    data = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    r = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data, timeout=180)
    r.raise_for_status()
    content = r.json()["choices"][0]["message"]["content"]
    return json.loads(content)

def apply_edits(edits: List[Dict[str, str]]) -> List[str]:
    written = []
    for edit in edits:
        rel = edit["path"].replace("\\", "/").lstrip("/")
        dst = (REPO_ROOT / rel)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(edit["contents"], encoding="utf-8", newline="\n")
        written.append(rel)
    return written

def generate_once() -> Dict[str, Any]:
    spec = read_tasks()
    snap = repo_snapshot()
    result = call_llm(spec, snap)
    changed = apply_edits(result.get("edits", []))
    return {"changed": changed, "notes": result.get("notes", "")}
