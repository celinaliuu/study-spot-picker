#!/usr/bin/env python3
"""Local dev server that disables caching, so the browser never runs stale JS.

Usage:  python3 serve.py [port]      (default 8000)
Then open http://localhost:8000
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


with Server(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving with caching off at http://localhost:{PORT}  (Ctrl+C to stop)")
    httpd.serve_forever()
