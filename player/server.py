#!/usr/bin/env python3
"""server.py - Dynamic KIParla audio player (replaces the old player.cgi).

    <prefix>/player/player.cgi?code=KPC003&begin=190535&end=193023    the player page
    <prefix>/player/?code=...                                         same page
    <prefix>/audio/<CODE>.mp3                                         audio, with HTTP Range support
    <prefix>/static/...                                               css/js of the page

The page is rendered per request: the conversation (turns, metadata) is read from
KIParla-collection, so nothing has to be precomputed. The audio is looked up in
<audio-root>/<Module>_audio/<CODE>.mp3.

Local run (same port and prefix the NoSketch docs use for the player):
    python3 player/server.py --collection ../KIParla-collection --audio ../../KIParla-audio

`application` is a plain WSGI app, so on the server it can also be run by gunicorn / mod_wsgi:
    KIPARLA_COLLECTION=... KIPARLA_AUDIO=... gunicorn --chdir player server:application
"""
import argparse
import json
import mimetypes
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qs
from wsgiref.simple_server import WSGIRequestHandler, make_server
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import player_data  # noqa: E402

COLLECTION = Path(os.environ.get("KIPARLA_COLLECTION", HERE.parent.parent / "KIParla-collection"))
AUDIO_ROOT = Path(os.environ.get("KIPARLA_AUDIO", HERE.parent.parent.parent / "KIParla-audio"))
PREFIX = os.environ.get("KIPARLA_PREFIX", "/corpus").rstrip("/")
ARTIFACTS_URL = os.environ.get("KIPARLA_ARTIFACTS_URL", "https://kiparla.github.io/KIParla-artifacts")

CODE_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
STATIC = {  # published name -> file
    "linear2html.css": HERE.parent / "css" / "linear2html.css",
    "player.css": HERE / "player.css",
    "player.js": HERE / "player.js",
}
CHUNK = 64 * 1024


def audio_path(code):
    if not CODE_RE.match(code) or not AUDIO_ROOT.is_dir():
        return None
    for d in sorted(AUDIO_ROOT.glob("*_audio")):
        f = d / f"{code}.mp3"
        if f.is_file():
            return f
    return None


def respond(start_response, status, body, ctype="text/html; charset=utf-8", extra=()):
    if isinstance(body, str):
        body = body.encode("utf-8")
    start_response(status, [("Content-Type", ctype), ("Content-Length", str(len(body))), *extra])
    return [body]


def page(environ, start_response):
    q = {k: v[0] for k, v in parse_qs(environ.get("QUERY_STRING", "")).items()}
    code = q.get("code", "")
    data = player_data.load_conversation(COLLECTION, code) if CODE_RE.match(code) else None
    if data is None:
        msg = "Parametro <code>code</code> mancante o conversazione non trovata."
        return respond(start_response, "404 Not Found", f"<!DOCTYPE html><meta charset='utf-8'><title>KIParla</title><p>{msg}</p>")
    data["audio"] = f"{PREFIX}/audio/{code}.mp3" if audio_path(code) else None
    data["artifacts_url"] = ARTIFACTS_URL
    # "</" would end the inline script early
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = (HERE / "index.html").read_text(encoding="utf-8")
    html = html.replace("{{PREFIX}}", PREFIX).replace("{{CONVERSATION}}", payload)
    return respond(start_response, "200 OK", html)


def static(name, start_response):
    f = STATIC.get(name)
    if f is None:
        return respond(start_response, "404 Not Found", "not found", "text/plain")
    return respond(start_response, "200 OK", f.read_bytes(), mimetypes.guess_type(f.name)[0] or "application/octet-stream",
                   [("Cache-Control", "no-cache")])


def audio(code, environ, start_response):
    f = audio_path(code)
    if f is None:
        return respond(start_response, "404 Not Found", "audio not found", "text/plain")
    size = f.stat().st_size
    start, end, status = 0, size - 1, "200 OK"
    m = re.match(r"bytes=(\d*)-(\d*)$", environ.get("HTTP_RANGE", ""))
    if m and (m.group(1) or m.group(2)):
        if m.group(1):
            start = int(m.group(1))
            end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
        else:  # suffix range: the last N bytes
            start = max(size - int(m.group(2)), 0)
        if start > end or start >= size:
            return respond(start_response, "416 Range Not Satisfiable", "", "text/plain",
                           [("Content-Range", f"bytes */{size}")])
        status = "206 Partial Content"
    length = end - start + 1
    headers = [("Content-Type", "audio/mpeg"), ("Content-Length", str(length)),
               ("Accept-Ranges", "bytes"), ("Cache-Control", "public, max-age=86400")]
    if status.startswith("206"):
        headers.append(("Content-Range", f"bytes {start}-{end}/{size}"))
    start_response(status, headers)
    if environ["REQUEST_METHOD"] == "HEAD":
        return []

    def body():
        with open(f, "rb") as fh:
            fh.seek(start)
            left = length
            while left > 0:
                chunk = fh.read(min(CHUNK, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk
    return body()


def application(environ, start_response):
    if environ["REQUEST_METHOD"] not in ("GET", "HEAD"):
        return respond(start_response, "405 Method Not Allowed", "", "text/plain")
    path = environ.get("PATH_INFO", "")
    if PREFIX and path.startswith(PREFIX + "/"):
        path = path[len(PREFIX):]
    if path in ("/player/player.cgi", "/player/", "/player"):
        return page(environ, start_response)
    if path.startswith("/static/"):
        return static(path[len("/static/"):], start_response)
    m = re.match(r"^/audio/([A-Za-z0-9_-]+)\.mp3$", path)
    if m:
        return audio(m.group(1), environ, start_response)
    return respond(start_response, "404 Not Found", "not found", "text/plain")


class Threaded(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class Quiet(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


def main():
    global COLLECTION, AUDIO_ROOT
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--collection", type=Path, default=COLLECTION)
    ap.add_argument("--audio", type=Path, default=AUDIO_ROOT)
    ap.add_argument("--port", type=int, default=10071)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    COLLECTION, AUDIO_ROOT = args.collection.resolve(), args.audio.resolve()
    with make_server(args.host, args.port, application, server_class=Threaded, handler_class=Quiet) as srv:
        print(f"http://{args.host}:{args.port}{PREFIX}/player/player.cgi?code=KPC003&begin=190535&end=193023")
        srv.serve_forever()


if __name__ == "__main__":
    main()
