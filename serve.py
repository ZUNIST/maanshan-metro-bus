# City and Metro - local static server (no console window, self-exiting).
#
# Why this exists: the old launcher started `python -m http.server` in a minimized
# console window that stayed in the background until you closed it by hand. This
# script runs under pythonw.exe (no console at all), opens the browser itself, and
# exits on its own once the game tab stops sending heartbeats (see js/serve-hb.js).
#
# Usage (called by the launcher):
#   pythonw.exe serve.py --root "<game folder>"
#
# Behaviour:
#   * If an instance of this server is already listening on 8123-8130, it just
#     opens the browser and exits - no second process.
#   * Otherwise it binds the first free port, serves the folder and opens the page.
#   * It only shuts down by itself AFTER it has seen at least one heartbeat and
#     then 45 s of silence, so an old build without the heartbeat keeps working.
import functools
import http.server
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser

PORTS = range(8123, 8131)
MARK = ('X-CityMetro', '1')
IDLE_SECONDS = 45
# 兜底：页面一直没发心跳（比如浏览器没被成功拉起）时，最多保留这么久，避免留下看不见的常驻进程
GRACE_SECONDS = int(os.environ.get('CM_GRACE_SECONDS') or 300)
HEARTBEAT = '/__hb'

state = {'last': time.time(), 'armed': False, 'start': time.time()}
lock = threading.Lock()


def log(msg):
    """pythonw.exe 下 sys.stdout 是 None，直接 print 会抛异常并静默退出。"""
    try:
        if sys.stdout:
            print(msg, flush=True)
    except Exception:
        pass


def touch(armed=None):
    with lock:
        state['last'] = time.time()
        if armed:
            state['armed'] = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass                                    # stay silent: there is no console to write to

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store' if self.path.endswith(('.html', '.js')) else 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == HEARTBEAT:
            touch(armed=True)
            self.send_response(204)
            self.send_header(MARK[0], MARK[1])
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        touch()
        super().do_GET()

    def do_HEAD(self):
        touch()
        super().do_HEAD()


def watchdog():
    while True:
        time.sleep(5)
        with lock:
            armed, last, start = state['armed'], state['last'], state['start']
        if armed and time.time() - last > IDLE_SECONDS:
            os._exit(0)                         # 标签页关了：没有要服务的对象了
        if not armed and time.time() - start > GRACE_SECONDS:
            os._exit(0)                         # 一直没人来访问：浏览器大概没打开，别留僵尸进程


def probe(port):
    """True if one of our own instances owns this port."""
    try:
        req = urllib.request.Request('http://127.0.0.1:%d%s' % (port, HEARTBEAT), method='GET')
        with urllib.request.urlopen(req, timeout=0.6) as r:
            return r.headers.get(MARK[0]) == MARK[1]
    except Exception:
        return False


def bind(port, root):
    handler = functools.partial(Handler, directory=root)
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler, bind_and_activate=False)
    # Windows 上 SO_REUSEADDR 允许第二个进程绑同一个端口，请求会被系统随机分给其中一个，
    # 于是「新服务其实没接管」。这里必须关掉，端口被占就直接换下一个。
    httpd.allow_reuse_address = False
    httpd.server_bind()
    httpd.server_activate()
    return httpd


def write_log(msg):
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'serve.log'), 'a', encoding='utf-8') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S') + '  ' + msg.replace('\n', ' | ') + '\n')
    except Exception:
        pass


def fail(msg, root=None):
    # 这里绝不能弹 MessageBox：pythonw.exe 没有控制台也没有人点它，进程会一直挂在那里
    # （实测挂过 4.5 小时），玩家看到的就是「双击没反应」。改成写日志 + 退化成直接打开页面。
    write_log('启动失败：' + msg)
    if root:
        page = os.path.join(root, 'index.html')
        if os.path.isfile(page):
            try:
                webbrowser.open('file:///' + page.replace('\\', '/'))
            except Exception:
                pass
    sys.exit(1)


def main():
    root = os.getcwd()
    args = sys.argv[1:]
    if '--root' in args:
        root = args[args.index('--root') + 1]
    root = os.path.abspath(root)
    if not os.path.isfile(os.path.join(root, 'index.html')):
        fail('index.html 不在 %s 里。请确认 启动游戏.bat 与 city-and-metro 文件夹在同一层。' % root)

    # 1. Reuse an instance we already started
    for port in PORTS:
        if probe(port):
            url = 'http://127.0.0.1:%d/index.html' % port
            if '--no-open' not in args:
                webbrowser.open(url)
            else:
                log(url)
            return

    # 2. Take the first free port
    httpd = None
    for port in PORTS:
        try:
            httpd = bind(port, root)
            break
        except OSError:
            continue
    if httpd is None:
        fail('8123-8130 都被占用了，无法启动本地服务。', root)

    threading.Thread(target=watchdog, daemon=True).start()
    url = 'http://127.0.0.1:%d/index.html' % httpd.server_port
    if '--no-open' not in args:
        webbrowser.open(url)
    else:
        log(url)
    try:
        httpd.serve_forever(poll_interval=0.5)
    except (KeyboardInterrupt, OSError):
        pass


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        write_log('未捕获的异常：\n' + traceback.format_exc())
        fail('本地服务启动失败，详细错误见 serve.log。')
