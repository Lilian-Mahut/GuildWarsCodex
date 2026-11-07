#!/usr/bin/env python3
"""Assemble les tuiles GW Memorial PNG/JPG en aperçu ou master PNG."""
from pathlib import Path
from PIL import Image
import argparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', default='tyria')
    parser.add_argument('--zoom', type=int, default=7)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()

    source = Path('gw-memorial-source') / args.map / str(args.zoom)
    output = Path('assets/maps/masters')
    output.mkdir(parents=True, exist_ok=True)

    tiles = sorted(
        (p for p in source.glob('*/*') if p.is_file() and p.suffix.lower() in {'.png', '.jpg', '.jpeg'}),
        key=lambda p: (int(p.parent.name), int(p.stem))
    )
    if not tiles:
        raise SystemExit(f'Aucune tuile PNG/JPG trouvée : {source}')

    coords = []
    occupied = set()
    for path in tiles:
        try:
            x, y = int(path.stem), int(path.parent.name)
        except ValueError as exc:
            raise SystemExit(f'Coordonnées non numériques : {path}') from exc
        if (x, y) in occupied:
            raise SystemExit(f'Doublon de coordonnées ({x}, {y}) : {path}')
        occupied.add((x, y))
        coords.append((x, y, path))

    min_x = min(x for x, _, _ in coords)
    max_x = max(x for x, _, _ in coords)
    min_y = min(y for _, y, _ in coords)
    max_y = max(y for _, y, _ in coords)

    with Image.open(coords[0][2]) as first:
        tile_width, tile_height = first.size

    scale = 0.125 if args.preview else 1
    scaled_width = round(tile_width * scale)
    scaled_height = round(tile_height * scale)
    columns = max_x - min_x + 1
    rows = max_y - min_y + 1
    canvas = Image.new('RGBA', (columns * scaled_width, rows * scaled_height), (0, 0, 0, 0))

    for i, (x, y, path) in enumerate(coords, 1):
        with Image.open(path) as img:
            if img.size != (tile_width, tile_height):
                raise ValueError(f'Taille incohérente : {path} ({img.size})')
            tile = img.convert('RGBA')
            if args.preview:
                tile = tile.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)
            canvas.paste(tile, ((x - min_x) * scaled_width, (y - min_y) * scaled_height))
        if i % 250 == 0:
            print(f'{i}/{len(coords)} tuiles assemblées')

    suffix = 'preview' if args.preview else 'master'
    destination = output / f'{args.map}-{suffix}.png'
    canvas.save(destination, optimize=True)
    print(f'Image créée : {destination}')
    print(f'Dimensions : {canvas.width} x {canvas.height}')
    print(f'Tuiles : {len(coords)} / {columns * rows} positions ; X={min_x}..{max_x}, Y={min_y}..{max_y}')


if __name__ == '__main__':
    main()
