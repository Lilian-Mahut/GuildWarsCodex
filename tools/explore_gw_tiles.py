#!/usr/bin/env python3
"""Exploration progressive de tuiles GW Memorial (source zoom/Y/X).

Conserve le telechargeur original intact. Les PNG sont archives sans modification.
Une reponse PNG ne prouve pas qu'elle contient une carte : inspecter les apercus.
"""
import argparse
import csv
import io
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://www.gw-memorial.net/maps/img'
FIELDS = ('x', 'y', 'status', 'bytes', 'detail')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--map', required=True, help='Nom du dossier source, ex: tyria, elona')
    p.add_argument('--zoom', type=int, required=True)
    p.add_argument('--xmin', type=int, required=True)
    p.add_argument('--xmax', type=int, required=True)
    p.add_argument('--ymin', type=int, required=True)
    p.add_argument('--ymax', type=int, required=True)
    p.add_argument('--step', type=int, default=4, help='Epaisseur de la couronne, en tuiles')
    p.add_argument('--rings', type=int, default=1, help='Nombre de couronnes par execution')
    p.add_argument('--output', default='gw-memorial-source')
    p.add_argument('--delay', type=float, default=0.5)
    p.add_argument('--max-requests', type=int, default=500)
    args = p.parse_args()
    if min(args.zoom, args.xmin, args.ymin) < 0 or args.xmax < args.xmin or args.ymax < args.ymin:
        p.error('Coordonnees invalides')
    if args.step < 1 or args.rings < 1 or args.max_requests < 1 or args.delay < 0.2:
        p.error('step/rings/max-requests >= 1 et delay >= 0.2')

    root = Path(args.output) / args.map / str(args.zoom)
    report = Path(args.output) / 'reports' / f'{args.map}-z{args.zoom}.csv'
    report.parent.mkdir(parents=True, exist_ok=True)
    seen = {}
    if report.exists():
        with report.open(newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                seen[(int(row['x']), int(row['y']))] = row

    attempts = 0
    stats = {'ok': 0, 'cached': 0, 'missing': 0, 'error': 0, 'known_missing': 0}
    stop = False
    for ring in range(1, args.rings + 1):
        if stop:
            break
        pad = ring * args.step
        inner = (args.xmin - (ring-1)*args.step, args.xmax + (ring-1)*args.step,
                 args.ymin - (ring-1)*args.step, args.ymax + (ring-1)*args.step)
        outer = (max(0, args.xmin-pad), args.xmax+pad,
                 max(0, args.ymin-pad), args.ymax+pad)
        print(f'Couronne {ring}: X={outer[0]}..{outer[1]} Y={outer[2]}..{outer[3]}', flush=True)
        for y in range(outer[2], outer[3]+1):
            if stop:
                break
            for x in range(outer[0], outer[1]+1):
                if inner[0] <= x <= inner[1] and inner[2] <= y <= inner[3]:
                    continue
                dest = root / str(y) / f'{x}.png'
                if dest.is_file() and dest.stat().st_size > 8:
                    stats['cached'] += 1
                    continue
                prior = seen.get((x, y))
                if prior and prior['status'] == 'missing':
                    stats['known_missing'] += 1
                    continue
                if attempts >= args.max_requests:
                    stop = True
                    break
                attempts += 1
                url = f'{BASE}/{args.map}/{args.zoom}/{y}/{x}.png'
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'GuildWarsReborn-map-archiver/2.0 (authorized reuse)',
                    'Accept': 'image/png'})
                status, detail, size = 'error', '', 0
                try:
                    with urllib.request.urlopen(req, timeout=20) as response:
                        data = response.read()
                        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                            raise ValueError('Reponse non PNG')
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(data)
                    status, size = 'ok', len(data)
                except urllib.error.HTTPError as e:
                    if e.code == 404:
                        status = 'missing'
                    else:
                        detail = f'HTTP {e.code}'
                        if e.code in (429, 503):
                            stop = True
                except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                    detail = str(e)
                seen[(x, y)] = dict(x=x, y=y, status=status, bytes=size, detail=detail)
                stats[status] += 1
                print(f'{status.upper():7} {args.zoom}/{y}/{x}.png {detail}', flush=True)
                time.sleep(args.delay)
                if stop:
                    break
        # Sauvegarder apres chaque couronne, y compris en cas d'arret anticipe
        with report.open('w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(seen[k] for k in sorted(seen, key=lambda t: (t[1], t[0])))
    print('Bilan:', stats, '| requetes:', attempts, '| rapport:', report)
    if stop:
        print('Arret (limite de requetes ou HTTP 429/503). Relancer avec les memes arguments pour reprendre.')

if __name__ == '__main__':
    main()
