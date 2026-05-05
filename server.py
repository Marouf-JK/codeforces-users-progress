import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
    print(f"Serving dashboard on http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
