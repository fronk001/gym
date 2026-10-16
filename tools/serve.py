"""
Dev server. This machine has no Node, so Python serves the files.

    py tools/serve.py            # project root on :8530 -> http://localhost:8530/src/
    py tools/serve.py src 8530   # just the app

Sends Cache-Control: no-store on everything. Without it the browser keeps
serving stale ES modules after an edit, and a test run can quietly pass
against code that is no longer on disk. (Learned in the Mongolian project.)
"""
import sys
import time
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

EXTRA_TYPES = {
    ".webmanifest": "application/manifest+json",
    ".woff2": "font/woff2",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}
    offline = False

    def do_GET(self):
        # /__wait answers after 0.2 s. Headless Edge fast-forwards its clock
        # whenever no request is open, so a test page that must wait in real
        # time (tools/firebase-check.html) keeps one of these open meanwhile.
        if self.path.startswith("/__wait"):
            time.sleep(0.2)
            self.send_response(204)
            self.end_headers()
            return
        # /__offline?on and ?off: tools/sw-check.html pretends the published
        # copy (dist/) is out of reach, to see the app open from the phone's copy.
        if self.path.startswith("/__offline"):
            Handler.offline = self.path.endswith("on")
            self.send_response(204)
            self.end_headers()
            return
        if Handler.offline and self.path.startswith("/dist/"):
            # Not a dropped connection: headless Edge then waits for the
            # frame forever, and a broken copy would hang the test, not fail it.
            self.send_error(503, "Pretend offline (tools/sw-check.html)")
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--open"]
    root = args[0] if args else "."
    port = int(args[1]) if len(args) > 1 else 8530
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root))
    url = f"http://localhost:{port}/" + ("src/" if root == "." else "")
    print(f"Gym: {url}  (close this window to stop)", flush=True)
    if "--open" in sys.argv:
        webbrowser.open(url)  # only now: the port is bound, so the page can't race the server
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
