import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.migrations import run_migrations_or_stamp


def main() -> None:
    action = run_migrations_or_stamp()
    print(f"Migration bootstrap action: {action}")


if __name__ == "__main__":
    main()
