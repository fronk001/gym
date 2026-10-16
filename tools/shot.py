"""
Screenshots of the app in headless Edge, for checking the look.

    py tools/shot.py                       # phone + laptop, demo data, Fri 16 Oct 2026
    py tools/shot.py "?local"              # any query string (the Notes import, on the laptop)
    py tools/shot.py "?demo" "#/history"   # and a screen
    py tools/shot.py --dom "?demo"         # print the rendered HTML instead

Each run uses a fresh browser profile, so localStorage starts empty and the
seed (or demo) is rebuilt every time. Images go to screenshots/ (git-ignored).
"""
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_tests import ROOT, browser, serve  # noqa: E402

# name: (page, window width, window height)
SIZES = {"desktop": ("src/index.html", 1280, 1100), "phone": ("tools/phone.html", 520, 1400)}


def edge(url: str, *flags: str) -> str:
    with tempfile.TemporaryDirectory() as profile:
        return subprocess.run(
            [browser(), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
             f"--user-data-dir={profile}", "--virtual-time-budget=5000", *flags, url],
            capture_output=True, text=True, encoding="utf-8", timeout=120,
        ).stdout


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    dom = "--dom" in args
    args = [a for a in args if a != "--dom"]
    query = args[0] if args else "?demo&today=2026-10-16"
    query += args[1] if len(args) > 1 else ""
    base = f"http://127.0.0.1:{serve()}/"
    if dom:
        print(edge(f"{base}src/index.html{query}", "--window-size=1440,1700", "--dump-dom"))
        return
    out = ROOT / "screenshots"
    out.mkdir(exist_ok=True)
    for name, (page, w, h) in SIZES.items():
        path = out / f"{name}.png"
        edge(f"{base}{page}{query}", f"--window-size={w},{h}", f"--screenshot={path}")
        print(path)


if __name__ == "__main__":
    main()
