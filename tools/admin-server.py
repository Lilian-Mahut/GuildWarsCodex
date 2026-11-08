"""Serveur d'édition local. Lancer depuis la racine : python tools/admin-server.py"""
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / 'data/source/places.csv'
BACKUPS = ROOT / 'data/source/backups'
PORT = int(os.environ.get('GW_ADMIN_PORT', '8765'))
COLUMNS = ['realm','category','id','name_en','x','y','name_fr','name_es','name_de','minZoom','labelMinZoom','label']
ID_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def configs():
    return {p.parent.name: json.loads(p.read_text(encoding='utf-8')) for p in (ROOT/'data/realms').glob('*/realm.json')}


def load_rows():
    with CSV.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f, delimiter=';')
        if not reader.fieldnames or not set(COLUMNS).issubset(reader.fieldnames):
            raise ValueError('Colonnes CSV inattendues : vérifie places.csv')
        return [{k: (r.get(k) or '') for k in COLUMNS} for r in reader if r.get('realm')]


def validate(rows):
    errors = []
    realms = configs()
    ids = set()
    if not isinstance(rows, list):
        return ['Les données doivent être une liste.']
    for n, row in enumerate(rows, 2):
        if not isinstance(row, dict):
            errors.append(f'Ligne {n} : objet invalide'); continue
        realm = str(row.get('realm','')).strip()
        category = str(row.get('category','')).strip()
        if realm not in realms:
            errors.append(f'Ligne {n} : royaume inconnu ({realm})'); continue
        if category not in realms[realm]['categories'] and category != '_realm':
            errors.append(f'Ligne {n} : catégorie inconnue ({category})')
        name = str(row.get('name_en','')).strip()
        if not name and category != '_realm':
            errors.append(f'Ligne {n} : nom anglais obligatoire')
        ident = str(row.get('id','')).strip()
        if ident and ident != '_realm' and not ID_RE.fullmatch(ident):
            errors.append(f'Ligne {n} : ID invalide ({ident})')
        if ident:
            key = (realm, ident)
            if key in ids: errors.append(f'Ligne {n} : ID en double ({realm}/{ident})')
            ids.add(key)
        if category != '_realm':
            for axis in ('x','y'):
                try:
                    value = float(str(row.get(axis,'')).replace(',','.'))
                    if not math.isfinite(value): raise ValueError()
                except (ValueError, TypeError):
                    errors.append(f'Ligne {n} : coordonnée {axis} invalide')
        for key in ('minZoom','labelMinZoom'):
            value = str(row.get(key,'')).strip()
            if value:
                try:
                    if int(value) < 0: raise ValueError()
                except ValueError: errors.append(f'Ligne {n} : {key} invalide')
        label = str(row.get('label','')).strip().lower()
        if label not in ('','false','faux','non','no','0','true','vrai','oui','yes','1'):
            errors.append(f'Ligne {n} : label invalide')
    return errors


def backup():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    dest = BACKUPS / f'places-{stamp}.csv'
    shutil.copy2(CSV, dest)
    return dest


def save_rows(rows):
    errors = validate(rows)
    if errors: return {'ok': False, 'errors': errors}
    backup_path = backup()
    out = io.StringIO(newline='')
    writer = csv.DictWriter(out, fieldnames=COLUMNS, delimiter=';', lineterminator='\n', extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow({k: str(row.get(k,'')).strip() for k in COLUMNS})
    fd, tmp = tempfile.mkstemp(dir=CSV.parent, prefix='.places-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8-sig', newline='') as f:
            f.write(out.getvalue())
        os.replace(tmp, CSV)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    return {'ok': True, 'count': len(rows), 'backup': backup_path.name}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/places':
            try: self.reply(200, {'rows': load_rows(), 'realms': {k: list(v['categories']) for k,v in configs().items()}})
            except Exception as exc: self.reply(500, {'error': str(exc)})
            return
        return super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ('/api/places','/api/build'):
            return self.reply(404, {'error':'Route inconnue'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc not in (f'127.0.0.1:{PORT}',f'localhost:{PORT}'):
            return self.reply(403, {'error':'Origine non autorisée'})
        try:
            size = int(self.headers.get('Content-Length','0'))
            if size > 4_000_000 or size < 0: return self.reply(413, {'error':'Requête trop volumineuse'})
            payload = json.loads(self.rfile.read(size))
            if path == '/api/places':
                result = save_rows(payload.get('rows'))
                return self.reply(200 if result['ok'] else 422, result)
            if validate(load_rows()):
                return self.reply(422, {'ok':False,'errors':validate(load_rows())})
            # Snapshot des sorties afin de restaurer en cas d'échec de l'écriture.
            targets = list((ROOT/'data/realms').glob('**/*.json')) + list((ROOT/'i18n').glob('*/names/*.json')) + [CSV]
            snapshot = {p:p.read_bytes() for p in targets if p.exists()}
            result = subprocess.run([sys.executable,'tools/build-data.py'], cwd=ROOT, capture_output=True, text=True, timeout=60)
            if result.returncode:
                for p, content in snapshot.items(): p.write_bytes(content)
            return self.reply(200 if result.returncode == 0 else 422, {'ok':result.returncode == 0,'output':(result.stdout+'\n'+result.stderr)[-12000:]})
        except (ValueError, TypeError, KeyError) as exc:
            return self.reply(400, {'error':str(exc)})
        except Exception as exc:
            return self.reply(500, {'error':str(exc)})


if __name__ == '__main__':
    print(f'Administration locale : http://127.0.0.1:{PORT}/admin/')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
