"""Validation et enregistrement des contours de la carte."""
import json
import re
from pathlib import Path
import tempfile


def save_contour(root, payload):
    if not isinstance(payload, dict):
        raise ValueError('Contour invalide.')
    realm, category, slug = (payload.get(key) for key in ('realm', 'category', 'id'))
    world = json.loads((root / 'data/world.json').read_bytes())
    if realm not in world['realms'] or category not in ('region', 'zone', 'mission'):
        raise ValueError('Région, zone ou mission inconnue.')
    places = json.loads((root / 'data/realms' / realm / f'{category}.json').read_bytes())
    if not any(place['id'] == slug for place in places):
        raise ValueError('Région, zone ou mission inconnue.')
    points = payload.get('points')
    if not isinstance(points, list) or not 3 <= len(points) <= 2000:
        raise ValueError('Le contour doit contenir entre 3 et 2 000 sommets.')
    for point in points:
        if not (isinstance(point, list) and len(point) == 2
                and all(type(n) is int for n in point)
                and 0 <= point[0] <= world['width'] and 0 <= point[1] <= world['height']):
            raise ValueError('Un sommet est hors de la carte ou invalide.')
    area = sum(x1 * y2 - y1 * x2 for (x1, y1), (x2, y2) in zip(points, points[1:] + points[:1]))
    if not area or len(set(map(tuple, points))) != len(points):
        raise ValueError('Le contour doit délimiter une surface, sans sommets en double.')

    path = root / 'data/contours.json'
    contours = json.loads(path.read_bytes())
    key = (realm, category, slug)
    index = next((i for i, entry in enumerate(contours)
                  if (entry['realm'], entry['category'], entry['id']) == key), None)
    current = {} if index is None else contours[index]
    current_points = current.get('points')
    current_color = current.get('color')
    color = current_color
    previous_color = current_color
    if 'color' in payload:
        color = payload['color']
        if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            raise ValueError('Couleur de contour invalide. Utilise le format #RRGGBB.')
        color = color.lower()
        previous_color = payload.get('previousColor')

    current_state = (current_points, current_color)
    if (payload.get('previous'), previous_color) != current_state and (points, color) != current_state:
        raise ValueError('Ce contour a changé depuis son ouverture. Recharge le Studio.')
    entry = dict(realm=realm, category=category, id=slug, points=points)
    if color is not None:
        entry['color'] = color
    if index is None:
        contours.append(entry)
    else:
        contours[index] = entry
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as handle:
        staged = Path(handle.name)
    try:
        staged.write_text(json.dumps(contours, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)
    return contours
