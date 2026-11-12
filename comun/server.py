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
import urllib.parse
import webbrowser
import threading
from pathlib import Path

# La consola de Windows suele usar cp1252, que no soporta ✓/→/╔ etc. y
# rompe cada print (y con él, cada request: log_message se llama antes
# de enviar la respuesta). Se fuerza UTF-8 con reemplazo para que nunca truene.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Contexto SSL sin verificación (API interna)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

NO_OPEN_FLAGS = ('--no-open', '-n', 'noopen')
_args     = [a for a in sys.argv[1:] if a not in NO_OPEN_FLAGS]
NO_OPEN   = len(_args) != len(sys.argv) - 1
PORT      = int(_args[1]) if len(_args) > 1 else 3000
HTML_FILE = _args[0] if len(_args) > 0 else 'dashboard-alimentacion/dashboard-alimentacion.html'
API_HOST  = 'https://gateway.naturisa.com.ec'
# /bff-qa/* va al gateway de QA (p. ej. datamaestra structure/fuel_tanks, que aún no está en producción)
QA_HOST   = 'https://qa-gateway.naturisa.com.ec'
WORKER_URL = 'https://naturisa-proxy.parragajonathan965.workers.dev'


def gateway_url(path):
    if path.startswith('/bff-qa/'):
        return QA_HOST + '/bff/' + path[len('/bff-qa/'):]
    return API_HOST + path


def proxy_request(method, url, body=None, auth=None, extra_headers=None):
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
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(req, context=SSL_CTX, timeout=60)


class NaturisaHandler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        status = args[0] if args else ''
        print(f'  {self.command:<6} {self.path}  →  {status}')

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Api-Key')

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
            html_path = Path(HTML_FILE)
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
        elif self.path.startswith(('/db/', '/api/', '/d1/')):
            # Proxy al Cloudflare Worker
            url = WORKER_URL + self.path
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
            return
        elif self.path.startswith(('/bff/', '/bff-qa/')):
            # Proxy transparente al gateway
            url = gateway_url(self.path)
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
            # Otros archivos del repositorio (p. ej. el selector de app enlaza
            # ../consumos-insumos/consumos-insumos.html): se sirven desde la raiz.
            root = Path(__file__).resolve().parent.parent   # raiz del repositorio (comun/..)
            rel = urllib.parse.unquote(self.path.split('?', 1)[0]).lstrip('/')
            target = (root / rel).resolve()
            types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
                     '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'}
            if root in target.parents and target.is_file() and target.suffix.lower() in types:
                content = target.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', types[target.suffix.lower()])
                self.send_header('Content-Length', len(content))
                self.send_cors()
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, 'Not found')

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length) if length else None
        auth   = self.headers.get('Authorization')

        if self.path in ('/auth', '/bff/web/ap1/security/api/auth'):
            url = f'{API_HOST}/bff/web/ap1/security/api/auth'
            extra = None
        elif self.path.startswith(('/bff/', '/bff-qa/')):
            url = gateway_url(self.path)
            extra = None
        elif self.path.startswith('/db/') or self.path.startswith('/kv/'):
            # Proxy al Cloudflare Worker — pasar X-Api-Key si viene en el request
            url = WORKER_URL + self.path
            api_key = self.headers.get('X-Api-Key')
            extra = {'X-Api-Key': api_key} if api_key else None
        else:
            self.send_error(404, 'Not found')
            return

        try:
            with proxy_request('POST', url, body=body, auth=auth, extra_headers=extra) as resp:
                data = resp.read()
                self._send_json(resp.status, data)
        except urllib.error.HTTPError as e:
            self._send_json(e.code, e.read())
        except Exception as e:
            print(f'  ERROR proxy POST {self.path}: {e}')
            self._send_json(500, {'error': str(e)})

    def do_PUT(self):
        # Proxy al Cloudflare Worker para las rutas D1 que se editan (p. ej. /d1/recursos-sucursal):
        # el Worker no acepta CORS desde todos los puertos de localhost.
        if not self.path.startswith('/d1/'):
            self.send_error(404, 'Not found')
            return
        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length) if length else None
        try:
            with proxy_request('PUT', WORKER_URL + self.path, body=body, auth=self.headers.get('Authorization')) as resp:
                self._send_json(resp.status, resp.read())
        except urllib.error.HTTPError as e:
            self._send_json(e.code, e.read())
        except Exception as e:
            print(f'  ERROR proxy PUT {self.path}: {e}')
            self._send_json(500, {'error': str(e)})

if __name__ == '__main__':
    _root = Path(__file__).parent.parent   # raíz del proyecto
    # Resolver HTML_FILE antes de cambiar de directorio
    _html_resolved = (Path.cwd() / HTML_FILE).resolve()
    if not _html_resolved.exists():
        # Intentar relativo a la raíz del proyecto
        _html_resolved = (_root / HTML_FILE).resolve()
    HTML_FILE = str(_html_resolved)
    os.chdir(_root)
    # Con hilos: cada request se atiende en paralelo. Con HTTPServer simple las páginas que lanzan
    # muchas consultas al gateway a la vez (p. ej. bodega.html, ~150) quedaban en fila una tras otra.
    server = http.server.ThreadingHTTPServer(('localhost', PORT), NaturisaHandler)
    server.daemon_threads = True

    def open_browser():
        import time; time.sleep(0.8)
        webbrowser.open(f'http://localhost:{PORT}')

    if not NO_OPEN:
        threading.Thread(target=open_browser, daemon=True).start()

    title = HTML_FILE.replace('.html', '').replace('-', ' ').replace('_', ' ').title()
    try:
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
    except UnicodeEncodeError:
        print(f'Naturisa - {title}')
        print(f'Servidor iniciado en: http://localhost:{PORT}')
        print('Presiona Ctrl+C para detener')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Servidor detenido.')
