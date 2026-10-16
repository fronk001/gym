"""
Runs tools/test.html in headless Edge and prints the result.

    py tools/run_tests.py                     # logic tests
    py tools/run_tests.py tools/smoke.html    # UI smoke test (taps the real app)

The browser is the only JavaScript engine on this machine, so the tests run
there: this script serves the project on a spare port, has Edge load the test
page with --dump-dom, and reads the summary back out of the HTML. Exit code 0
means every test passed.
"""
import html
import re
import socket
import subprocess
import sys
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from serve import Handler  # noqa: E402

BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]


def browser() -> str:
    for b in BROWSERS:
        if Path(b).exists():
            return b
    sys.exit("No Edge or Chrome found to run the tests in.")


class QuietServer(ThreadingHTTPServer):
    # The smoke test reloads its frame mid-download; the aborted connection
    # is expected and its traceback would bury the real result.
    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError)):
            super().handle_error(request, client_address)


def serve() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = QuietServer(("127.0.0.1", port), partial(Handler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return port


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # the Windows console defaults to cp1252
    page = sys.argv[1] if len(sys.argv) > 1 else "tools/test.html"
    port = serve()
    with tempfile.TemporaryDirectory() as profile:
        try:
            out = subprocess.run(
                [browser(), "--headless=new", "--disable-gpu", "--no-first-run",
                 f"--user-data-dir={profile}", "--virtual-time-budget=15000",
                 "--window-size=1500,1300", "--dump-dom", f"http://127.0.0.1:{port}/{page}"],
                capture_output=True, text=True, encoding="utf-8", timeout=120,
            ).stdout
        except subprocess.TimeoutExpired:
            # A page waiting on /__wait for something that never comes (a
            # frame that can't load) never finishes: that is a failure too.
            print(f"FAIL {page} never finished (2 minutes). Open it in a browser to see where it stops.")
            return 1
    m = re.search(r'<pre id="out">(.*?)</pre>', out, re.S)
    if not m:
        print("Could not read the test page. Raw output:\n" + out[:2000])
        return 2
    text = html.unescape(m.group(1))
    print(text)
    return 0 if text.startswith("PASS") else 1


if __name__ == "__main__":
    sys.exit(main())
