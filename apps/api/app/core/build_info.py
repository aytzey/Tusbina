import os
import subprocess
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def get_commit_sha() -> str:
    env_sha = os.getenv("APP_GIT_SHA", "").strip()
    if env_sha:
        return env_sha

    app_root = Path(__file__).resolve().parents[2]
    commit_file = app_root / ".build_commit"
    try:
        if commit_file.exists():
            file_sha = commit_file.read_text(encoding="utf-8").strip()
            if file_sha:
                return file_sha
    except Exception:
        pass

    try:
        output = subprocess.check_output(
            ["git", "-C", str(app_root), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL,
            timeout=2,
        )
        git_sha = output.decode("utf-8", errors="ignore").strip()
        if git_sha:
            return git_sha
    except Exception:
        pass

    return "unknown"
