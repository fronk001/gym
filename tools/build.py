"""
Builds dist/, the copy of the app that GitHub Pages publishes.

    py tools/build.py

dist/ is src/ with three differences:
- seed.local.js is left out (the Notes import: personal, git-ignored, so CI never has it anyway);
- sw.js gets the list of files to keep on the device, and a version made from
  their contents, so any change at all makes phones fetch the new copy;
- index.html gets the same version, which is what switches sw.js on.

The GitHub workflow (.github/workflows/pages.yml) runs this on every push.
Standard library only.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
LEFT_OUT = {"data/seed.local.js"}
NOT_KEPT = {"sw.js"}  # the browser fetches the service worker itself


def stamp(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        sys.exit(f"build: expected {old!r} exactly once in {path.name}")
    path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    shutil.rmtree(DIST, ignore_errors=True)
    files = sorted(
        p.relative_to(SRC).as_posix() for p in SRC.rglob("*")
        if p.is_file() and p.relative_to(SRC).as_posix() not in LEFT_OUT
    )
    digest = hashlib.sha256()
    for f in files:
        (DIST / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SRC / f, DIST / f)
        digest.update(f.encode() + b"\0" + (SRC / f).read_bytes() + b"\0")
    version = digest.hexdigest()[:12]
    # "./" as well as index.html: the phone opens the folder address.
    kept = ["./"] + [f for f in files if f not in NOT_KEPT]
    stamp(DIST / "sw.js", "'__VERSION__'", repr(version))
    stamp(DIST / "sw.js", "__FILES__", json.dumps(kept, indent=2))
    stamp(DIST / "index.html", '<meta name="app-version" content="dev">', f'<meta name="app-version" content="{version}">')
    print(f"dist/ built: version {version}, {len(files)} files")


if __name__ == "__main__":
    main()
