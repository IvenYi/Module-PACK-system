#!/usr/bin/env python3
"""Start this copy with its own PostgreSQL cluster, ports, files and secrets."""
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / '.pack-runtime'
DATA = ROOT / '.pack-postgres'
ENV_FILE = ROOT / '.env.pack.local'
PG = Path('/opt/homebrew/opt/postgresql@18/bin')
JAVA_HOME = Path('/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
JAR = ROOT / 'backend/target/edhr-0.0.1-SNAPSHOT.jar'


def configuration():
    RUN.mkdir(mode=0o700, exist_ok=True)
    if not ENV_FILE.exists():
        values = {
            'PACK_FRONTEND_PORT': '3010', 'PACK_BACKEND_PORT': '8090',
            'PACK_DATABASE_PORT': '55440', 'PACK_DATABASE_NAME': 'pack_edhr_dev',
            'PACK_DATABASE_USER': 'pack_edhr', 'PACK_DATABASE_PASSWORD': secrets.token_hex(24),
            'PACK_CLUSTER_PASSWORD': secrets.token_hex(24), 'JWT_SECRET': secrets.token_hex(48),
        }
        fd = os.open(ENV_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as out:
            out.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    values = dict(line.split('=', 1) for line in ENV_FILE.read_text().splitlines()
                  if line.strip() and not line.startswith('#'))
    if values['PACK_DATABASE_NAME'] != 'pack_edhr_dev' or values['PACK_DATABASE_USER'] != 'pack_edhr':
        raise RuntimeError('本地数据库名称和用户固定为 pack_edhr_dev / pack_edhr')
    return values


def pg_command(name, *args, input=None):
    env = dict(os.environ, PGPASSWORD=CONFIG['PACK_CLUSTER_PASSWORD'])
    return subprocess.run([str(PG / name), *map(str, args)], input=input, text=True,
                          env=env, check=True, capture_output=True).stdout


def sql(query, database='postgres'):
    return pg_command('psql', '-h', '127.0.0.1', '-p', CONFIG['PACK_DATABASE_PORT'],
                      '-U', 'pack_cluster', '-d', database, '-v', 'ON_ERROR_STOP=1',
                      '-At', input=query)


def free_port(port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', int(port)))
        except OSError as error:
            raise RuntimeError(f'端口 {port} 已占用，停止启动以保护现有项目') from error


def managed_pid(name):
    file = RUN / f'{name}.pid'
    if not file.exists():
        return None
    pid = int(file.read_text())
    result = subprocess.run(['ps', '-p', str(pid), '-o', 'command='],
                            capture_output=True, text=True)
    marker = str(JAR) if name == 'backend' else str(ROOT / 'frontend/node_modules/vite/bin/vite.js')
    return pid if marker in result.stdout else None


def database_running():
    return (DATA / 'PG_VERSION').exists() and subprocess.run(
        [str(PG / 'pg_ctl'), '-D', str(DATA), 'status'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def start_database():
    if database_running():
        if sql('SHOW port;').strip() != CONFIG['PACK_DATABASE_PORT']:
            raise RuntimeError('独立数据库端口与配置不一致')
        return
    free_port(CONFIG['PACK_DATABASE_PORT'])
    if not (DATA / 'PG_VERSION').exists():
        password_file = RUN / 'initdb-password'
        password_file.write_text(CONFIG['PACK_CLUSTER_PASSWORD'])
        password_file.chmod(0o600)
        try:
            pg_command('initdb', '-D', DATA, '-U', 'pack_cluster', '--encoding=UTF8',
                       '--locale=C', '--auth-local=scram-sha-256', '--auth-host=scram-sha-256',
                       f'--pwfile={password_file}')
        finally:
            password_file.unlink(missing_ok=True)
        with (DATA / 'postgresql.conf').open('a') as conf:
            conf.write("\n# Isolated Pack copy\nlisten_addresses = '127.0.0.1'\n"
                       f"port = {int(CONFIG['PACK_DATABASE_PORT'])}\n"
                       "unix_socket_directories = ''\n")
    pg_command('pg_ctl', '-D', DATA, '-l', RUN / 'postgres.log', '-w', 'start')
    if not sql("SELECT 1 FROM pg_roles WHERE rolname='pack_edhr';").strip():
        sql(f"CREATE ROLE pack_edhr LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '{CONFIG['PACK_DATABASE_PASSWORD']}';")
    if not sql("SELECT 1 FROM pg_database WHERE datname='pack_edhr_dev';").strip():
        sql('CREATE DATABASE pack_edhr_dev OWNER pack_edhr;')


def spawn(name, command, cwd, env):
    with (RUN / f'{name}.log').open('a') as log:
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                   stderr=subprocess.STDOUT, start_new_session=True)
    (RUN / f'{name}.pid').write_text(str(process.pid))


def wait_http(name, url, seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if not managed_pid(name):
            raise RuntimeError(f'{name} 进程已退出，查看 {RUN / (name + ".log")}')
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f'{name} 启动超时，查看 {RUN / (name + ".log")}')


def start():
    if not JAR.exists() or not (ROOT / 'frontend/node_modules/vite/bin/vite.js').exists():
        raise RuntimeError('先在 frontend 运行 npm ci，再在 backend 运行 mvn -DskipTests package')
    for name, key in [('backend', 'PACK_BACKEND_PORT'), ('frontend', 'PACK_FRONTEND_PORT')]:
        if not managed_pid(name):
            free_port(CONFIG[key])
    start_database()
    for folder in ['tmp', 'files', 'uploads', 'paddlex-cache', 'paddle-cache',
                   'paddle-extensions', 'huggingface', 'modelscope-cache', 'cache']:
        (RUN / folder).mkdir(exist_ok=True)
    inherited = {key: value for key, value in os.environ.items()
                 if not key.startswith(('SPRING_', 'SERVER_', 'EDHR_', 'APP_', 'VITE_'))
                 and key not in {'JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', '_JAVA_OPTIONS'}}
    env = dict(inherited, JAVA_HOME=str(JAVA_HOME), TMPDIR=str(RUN / 'tmp'),
               SPRING_PROFILES_ACTIVE='dev', SERVER_ADDRESS='127.0.0.1',
               SERVER_PORT=CONFIG['PACK_BACKEND_PORT'],
               SPRING_DATASOURCE_URL=f"jdbc:postgresql://127.0.0.1:{CONFIG['PACK_DATABASE_PORT']}/{CONFIG['PACK_DATABASE_NAME']}",
               SPRING_DATASOURCE_USERNAME=CONFIG['PACK_DATABASE_USER'],
               SPRING_DATASOURCE_PASSWORD=CONFIG['PACK_DATABASE_PASSWORD'],
               JWT_SECRET=CONFIG['JWT_SECRET'], FILE_UPLOAD_DIR=str(RUN / 'uploads'),
               OCR_PADDLE_ENABLED='false',
               OCR_PADDLE_PYTHON_COMMAND=str(ROOT / 'backend/.venv-ocr/bin/python'),
               OCR_PADDLE_SCRIPT_PATH=str(ROOT / 'backend/scripts/paddle_id_card_ocr.py'),
               PADDLE_PDX_CACHE_HOME=str(RUN / 'paddlex-cache'),
               PADDLE_HOME=str(RUN / 'paddle-cache'),
               PADDLE_EXTENSION_DIR=str(RUN / 'paddle-extensions'),
               HF_HOME=str(RUN / 'huggingface'), MODELSCOPE_CACHE=str(RUN / 'modelscope-cache'),
               XDG_CACHE_HOME=str(RUN / 'cache'), PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK='True',
               PADDLE_PDX_MODEL_SOURCE='bos', OMP_NUM_THREADS='1',
               PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD='1', UV_CACHE_DIR=str(RUN / 'uv-cache'))
    if not managed_pid('backend'):
        command = [str(JAVA_HOME / 'bin/java'), f'-Djava.io.tmpdir={RUN / "tmp"}', '-jar', str(JAR),
                   f'--edhr.file.storage-path={RUN / "files"}']
        chrome = Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        if chrome.exists():
            command.append(f'--edhr.dhr.pdf.chromium-path={chrome}')
        spawn('backend', command, ROOT / 'backend', env)
    wait_http('backend', f"http://127.0.0.1:{CONFIG['PACK_BACKEND_PORT']}/api/v1/system/settings/public", 180)
    if not managed_pid('frontend'):
        env['VITE_API_PROXY_TARGET'] = f"http://127.0.0.1:{CONFIG['PACK_BACKEND_PORT']}"
        spawn('frontend', ['node', str(ROOT / 'frontend/node_modules/vite/bin/vite.js'),
                          '--config', 'vite.config.ts', '--host', '127.0.0.1',
                          '--port', CONFIG['PACK_FRONTEND_PORT'], '--strictPort'], ROOT / 'frontend', env)
    wait_http('frontend', f"http://127.0.0.1:{CONFIG['PACK_FRONTEND_PORT']}", 30)
    status()


def stop():
    for name in ['frontend', 'backend']:
        pid = managed_pid(name)
        if pid:
            if os.getpgid(pid) != pid:
                raise RuntimeError(f'{name} 进程组不符合本副本记录，停止自动关闭')
            os.killpg(pid, signal.SIGTERM)
            deadline = time.monotonic() + 20
            while group_running(pid) and time.monotonic() < deadline:
                time.sleep(0.25)
            if group_running(pid):
                raise RuntimeError(f'{name} 未在20秒内退出，请查看日志')
        (RUN / f'{name}.pid').unlink(missing_ok=True)
    if database_running():
        pg_command('pg_ctl', '-D', DATA, '-m', 'fast', '-w', 'stop')
    print('Pack 副本已停止，独立数据库与附件保留。')


def group_running(group):
    result = subprocess.run(['ps', '-axo', 'pgid=,stat='], capture_output=True, text=True, check=True)
    return any(int(parts[0]) == group and not parts[1].startswith('Z')
               for line in result.stdout.splitlines() if len(parts := line.split()) == 2)


def status():
    result = {'frontend': {'pid': managed_pid('frontend'), 'url': f"http://127.0.0.1:{CONFIG['PACK_FRONTEND_PORT']}"},
              'backend': {'pid': managed_pid('backend'), 'url': f"http://127.0.0.1:{CONFIG['PACK_BACKEND_PORT']}"},
              'database': {'running': database_running(), 'host': '127.0.0.1',
                           'port': int(CONFIG['PACK_DATABASE_PORT']), 'name': CONFIG['PACK_DATABASE_NAME'],
                           'dataDirectory': str(DATA)}}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['database', 'start', 'stop', 'status'])
    args = parser.parse_args()
    try:
        CONFIG = configuration()
        {'database': start_database, 'start': start, 'stop': stop, 'status': status}[args.command]()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr or str(error))
        else:
            print(str(error))
        raise SystemExit(1)
