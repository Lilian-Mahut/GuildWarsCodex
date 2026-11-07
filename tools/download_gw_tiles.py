#!/usr/bin/env python3
"""Télécharge des tuiles GW Memorial (ordre source z/y/x), sans les modifier."""
import argparse
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://www.gw-memorial.net/maps/img'


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--map', default='tyria', choices=['tyria', 'cantha', 'elona', 'battleisles', 'presearing', 'battle-isles'])
    p.add_argument('--zoom', type=int, default=7)
    p.add_argument('--xmin', type=int, default=29)
    p.add_argument('--xmax', type=int, default=31)
    p.add_argument('--ymin', type=int, default=36)
    p.add_argument('--ymax', type=int, default=38)
    p.add_argument('--output', default='gw-memorial-source')
    p.add_argument('--delay', type=float, default=0.5)
    p.add_argument('--format', choices=['png', 'jpg'], default='png')
    args = p.parse_args()
    if min(args.xmin, args.ymin, args.zoom) < 0 or args.xmax < args.xmin or args.ymax < args.ymin:
        p.error('Plages de coordonnées invalides.')
    count = (args.xmax - args.xmin + 1) * (args.ymax - args.ymin + 1)
    if count > 10000:
        p.error('Limite de sécurité : 10 000 tuiles par commande.')
    ok = missing = errors = skipped = 0
    for y in range(args.ymin, args.ymax + 1):
        for x in range(args.xmin, args.xmax + 1):
            dest = Path(args.output) / args.map / str(args.zoom) / str(y) / f'{x}.{args.format}'
            if dest.is_file() and dest.stat().st_size > 0:
                skipped += 1
                continue
            url = f'{BASE}/{args.map}/{args.zoom}/{y}/{x}.{args.format}'
            req = urllib.request.Request(url, headers={'User-Agent': 'GuildWarsReborn-map-archiver/1.0 (authorized reuse)', 'Accept': f'image/{args.format}'})
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    data = response.read()
                    valid = (
                    data.startswith(b'\x89PNG\r\n\x1a\n')
                    if args.format == 'png'
                    else data.startswith(b'\xff\xd8\xff')
                )

                if not valid:
                    raise ValueError(f'La réponse ne contient pas de {args.format.upper()} valide')
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                ok += 1
                print(f'OK      {args.zoom}/{y}/{x}.{args.format} ({len(data)} octets)')
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    missing += 1
                    print(f'ABSENT  {args.zoom}/{y}/{x}.png')
                else:
                    errors += 1
                    print(f'ERREUR  {url} : HTTP {e.code}')
            except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
                errors += 1
                print(f'ERREUR  {url} : {e}')
            time.sleep(max(0.2, args.delay))
    print(f'\nTerminé : {ok} téléchargées, {skipped} déjà présentes, {missing} absentes, {errors} erreurs.')


if __name__ == '__main__':
    main()
