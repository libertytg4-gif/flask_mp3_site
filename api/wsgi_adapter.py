import base64, io, sys
from urllib.parse import urlencode

def handle(event, context, wsgi_app):
    method = event.get("method") or event.get("httpMethod") or "GET"
    path = event.get("path") or "/"
    if path == "/api":
        path = "/"
    elif path.startswith("/api/"):
        path = path[4:]
    raw_qs = event.get("queryString") or ""
    qs_dict = event.get("queryStringParameters") or {}
    if not raw_qs and qs_dict:
        raw_qs = urlencode([(k, v) for k, v in qs_dict.items() if v is not None])
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    body = event.get("body") or b""
    if isinstance(body, str):
        if event.get("encoding") == "base64" or event.get("isBase64Encoded"):
            body_bytes = base64.b64decode(body)
        else:
            body_bytes = body.encode(headers.get("content-encoding") or "utf-8", errors="ignore")
    else:
        body_bytes = body
    environ = {
        "REQUEST_METHOD": method, "SCRIPT_NAME":"", "PATH_INFO": path,
        "QUERY_STRING": raw_qs, "SERVER_NAME": headers.get("host","localhost").split(":")[0],
        "SERVER_PORT": headers.get("host","80").split(":")[-1], "SERVER_PROTOCOL":"HTTP/1.1",
        "wsgi.version":(1,0), "wsgi.url_scheme":"https", "wsgi.input": io.BytesIO(body_bytes),
        "wsgi.errors": sys.stderr, "wsgi.multithread": False, "wsgi.multiprocess": False, "wsgi.run_once": True,
        "CONTENT_LENGTH": str(len(body_bytes)), "CONTENT_TYPE": headers.get("content-type",""),
    }
    for k, v in headers.items():
        hk = "HTTP_" + k.upper().replace("-", "_")
        if hk in ("HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"): 
            continue
        environ[hk] = v
    status_headers = {}
    body_chunks = []
    def start_response(status, response_headers, exc_info=None):
        status_headers["status"] = status
        status_headers["headers"] = response_headers
    result = wsgi_app(environ, start_response)
    for chunk in result:
        if isinstance(chunk, str):
            chunk = chunk.encode("utf-8")
        body_chunks.append(chunk)
    if hasattr(result, "close"):
        result.close()
    status_code = int(status_headers.get("status","200 OK").split(" ")[0])
    headers_out = {}
    for k, v in status_headers.get("headers", []):
        headers_out[k] = f"{headers_out.get(k, '')+', ' if k in headers_out else ''}{v}"
    body_bytes = b"".join(body_chunks)
    return {"statusCode": status_code, "headers": headers_out,
            "body": base64.b64encode(body_bytes).decode("ascii"), "encoding": "base64"}
