"""
Servidor local - Dashboard Naturisa
Ejecutar: python server.py [archivo.html] [puerto] [--no-open]
  --no-open  no abre el navegador automáticamente al iniciar
"""
import http.server
import json
import os
import ssl
import sys
import urllib.request
import urllib.error
import webbrowser
import threading
from pathlib import Path

# Contexto SSL sin verificación (API interna)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

NO_OPEN_FLAGS = ('--no-open', '-n', 'noopen')
_args     = [a for a in sys.argv[1:] if a not in NO_OPEN_FLAGS]
NO_OPEN   = len(_args) != len(sys.argv) - 1
PORT      = int(_args[1]) if len(_args) > 1 else 3000
HTML_FILE = _args[0] if len(_args) > 0 else 'dashboard-alimentacion.html'
API_HOST  = 'https://gateway.naturisa.com.ec'


def proxy_request(method, url, body=None, auth=None):
    headers = {
        'Accept':     'application/json, text/plain, */*',
        'Origin':     'https://ap1.naturisa.com.ec',
        'Referer':    'https://ap1.naturisa.com.ec/',
        'User-Agent': 'Mozilla/5.0',
    }
    if auth:
        headers['Authorization'] = auth
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(req, context=SSL_CTX, timeout=20)


class NaturisaHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        status = args[0] if args else ''
        print(f'  {self.command:<6} {self.path}  →  {status}')

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def _send_json(self, status, data):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_cors()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ('/', '/index.html'):
            html_path = Path(__file__).parent / HTML_FILE
            if not html_path.exists():
                self.send_error(404, f'No se encontró {HTML_FILE}')
                return
            content = html_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', len(content))
            self.send_cors()
            self.end_headers()
            self.wfile.write(content)
        elif self.path.startswith('/bff/'):
            # Proxy transparente al gateway
            url = API_HOST + self.path
            auth = self.headers.get('Authorization')
            try:
                with proxy_request('GET', url, auth=auth) as resp:
                    data = resp.read()
                    self._send_json(resp.status, data)
            except urllib.error.HTTPError as e:
                self._send_json(e.code, e.read())
            except Exception as e:
                print(f'  ERROR proxy GET {self.path}: {e}')
                self._send_json(500, {'error': str(e)})
        else:
            self.send_error(404, 'Not found')

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length) if length else None

        if self.path in ('/auth', '/bff/web/ap1/security/api/auth'):
            url = f'{API_HOST}/bff/web/ap1/security/api/auth'
        elif self.path.startswith('/bff/'):
            url = API_HOST + self.path
        else:
            self.send_error(404, 'Not found')
            return

        auth = self.headers.get('Authorization')
        try:
            with proxy_request('POST', url, body=body, auth=auth) as resp:
                data = resp.read()
                self._send_json(resp.status, data)
        except urllib.error.HTTPError as e:
            self._send_json(e.code, e.read())
        except Exception as e:
            print(f'  ERROR proxy POST {self.path}: {e}')
            self._send_json(500, {'error': str(e)})


if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    server = http.server.HTTPServer(('localhost', PORT), NaturisaHandler)

    def open_browser():
        import time; time.sleep(0.8)
        webbrowser.open(f'http://localhost:{PORT}')

    if not NO_OPEN:
        threading.Thread(target=open_browser, daemon=True).start()

    title = HTML_FILE.replace('.html', '').replace('-', ' ').replace('_', ' ').title()
    print()
    print('  ╔══════════════════════════════════════╗')
    print(f'  ║   Naturisa — {title:<24}║')
    print('  ╚══════════════════════════════════════╝')
    print()
    print(f'  ✓ Servidor iniciado en: http://localhost:{PORT}')
    print('  ✓ El navegador se abrirá automáticamente' if not NO_OPEN else '  ✓ Apertura automática de navegador desactivada (--no-open)')
    print()
    print('  Presiona Ctrl+C para detener')
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Servidor detenido.')
