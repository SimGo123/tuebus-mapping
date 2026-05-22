#!.venv/bin/python

import sys
import os
import traceback
import http.client
import socket as _socket

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
SOCKET_PATH = os.path.join(BACKEND_DIR, "flask.sock")


class _UnixConn(http.client.HTTPConnection):
    def connect(self):
        self.sock = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET_PATH)


def is_flask_running():
    try:
        conn = _UnixConn("localhost", timeout=2)
        conn.request("GET", "/hello")
        conn.getresponse()
        return True
    except Exception:
        return False


def start_flask():
    import subprocess
    import time

    lockfile = SOCKET_PATH + ".starting"
    if os.path.exists(lockfile):
        for _ in range(40):
            time.sleep(0.5)
            if is_flask_running():
                return True
        return False

    open(lockfile, "w").close()
    try:
        if os.path.exists(SOCKET_PATH):
            os.remove(SOCKET_PATH)

        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "HOME": BACKEND_DIR,
            "OPENBLAS_NUM_THREADS": "1",
            "SCRIPT_NAME": "",
        }
        log = open(os.path.join(BACKEND_DIR, "gunicorn.log"), "a")
        subprocess.Popen(
            [
                os.path.join(BACKEND_DIR, ".venv/bin/gunicorn"),
                "--bind", "unix:" + SOCKET_PATH,
                "--preload",
                "--workers", "4",
                "--timeout", "120",
                "server:app",
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log,
            stderr=log,
        )
        for _ in range(40):
            time.sleep(0.5)
            if is_flask_running():
                return True
        return False
    finally:
        try:
            os.remove(lockfile)
        except OSError:
            pass


def proxy():
    method = os.environ.get("REQUEST_METHOD", "GET")
    path = os.environ.get("PATH_INFO", "/")
    query = os.environ.get("QUERY_STRING", "")
    url = path + ("?" + query if query else "")

    hdrs = {}
    ct = os.environ.get("CONTENT_TYPE")
    if ct:
        hdrs["Content-Type"] = ct

    body = None
    if method in ("POST", "PUT", "PATCH"):
        length = int(os.environ.get("CONTENT_LENGTH") or 0)
        body = sys.stdin.buffer.read(length) if length > 0 else b""
        if body:
            hdrs["Content-Length"] = str(len(body))

    conn = _UnixConn("localhost", timeout=120)
    conn.request(method, url, body, hdrs)
    resp = conn.getresponse()

    out = sys.stdout.buffer
    out.write("Status: {} {}\r\n".format(resp.status, resp.reason).encode())
    for k, v in resp.getheaders():
        out.write("{}: {}\r\n".format(k, v).encode())
    out.write(b"\r\n")
    out.write(resp.read())
    out.flush()


try:
    for attempt in range(2):
        if not is_flask_running():
            if not start_flask():
                sys.stdout.buffer.write(b"Content-Type: text/plain\r\n\r\nFlask/gunicorn failed to start. Check gunicorn.log.\n")
                sys.stdout.buffer.flush()
                break
        try:
            proxy()
            break
        except (FileNotFoundError, ConnectionRefusedError, ConnectionResetError):
            if attempt == 0:
                continue  # gunicorn died mid-request, restart and retry
            raise
except BaseException as e:
    sys.stdout.buffer.write(b"Content-Type: text/html\r\n\r\n")
    sys.stdout.buffer.write(
        "<h1>Proxy Error: {}</h1><pre>{}</pre>".format(type(e).__name__, traceback.format_exc()).encode()
    )
    sys.stdout.buffer.flush()
