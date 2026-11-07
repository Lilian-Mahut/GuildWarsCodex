"""Source unique des lieux : data/source/places.csv

    python tools/build-data.py            génère les JSON (lieux + traductions) depuis le CSV
    python tools/build-data.py --import   crée le CSV à partir des JSON existants (migration)
    python tools/build-data.py --force    autorise l'écrasement (CSV existant, lieux absents du CSV)

À lancer depuis la racine du projet.

Colonnes du CSV :
    realm ; category ; id ; name_en ; x ; y ; name_fr ; name_es ; name_de ; minZoom ; labelMinZoom ; label
(une colonne name_<code> par langue de i18n/languages.json, hors anglais)

Ligne spéciale pour le nom d'un royaume : category = _realm (x et y ignorés).
"""
import argparse
import csv
import glob
import io
import json
import os
import re
import shutil
import sys
import unicodedata

CSV_PATH = os.path.join('data', 'source', 'places.csv')
REALMS_DIR = os.path.join('data', 'realms')
ID_PATTERN = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
BASE_COLUMNS = ['realm', 'category', 'id', 'name_en', 'x', 'y']
EXTRA_COLUMNS = ['minZoom', 'labelMinZoom', 'label']
KNOWN_KEYS = {'id', 'name', 'x', 'y', 'minZoom', 'labelMinZoom', 'label'}
FALSE_WORDS = {'false', 'faux', 'non', 'no', '0'}


# ---------------------------------------------------------------- outils

def slugify(text):
    text = text.replace("'", '').replace('\u2019', '')      # apostrophes : Lion's -> lions
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def unique_slug(name, used):
    base = slugify(name) or 'lieu'
    new_id, n = base, 2
    while new_id in used:
        new_id, n = f'{base}-{n}', n + 1
    used.add(new_id)
    return new_id


def read_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, encoding='utf-8') as f:
            text = f.read().strip()
        return json.loads(text) if text else default
    except ValueError as err:
        sys.exit(f'JSON invalide dans {path} : {err}')


def write_if_changed(path, text):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            if f.read() == text:
                return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return True


def dumps_items(items):
    if not items:
        return '[]\n'
    return '[\n' + ',\n'.join('  ' + json.dumps(i, ensure_ascii=False) for i in items) + '\n]\n'


def dumps_names(names):
    return (json.dumps(names, ensure_ascii=False, indent=2) if names else '{}') + '\n'


def parse_number(text):
    value = float(text.replace(',', '.'))
    return int(value) if value == int(value) else value


def load_config():
    languages = read_json(os.path.join('i18n', 'languages.json'), [])
    langs = [lang['code'] for lang in languages if lang['code'] != 'en']

    realms = {}
    for realm_dir in sorted(glob.glob(os.path.join(REALMS_DIR, '*', ''))):
        realm_id = os.path.basename(os.path.normpath(realm_dir))
        config = read_json(os.path.join(realm_dir, 'realm.json'), None)
        if config is None:
            sys.exit(f'{realm_dir}realm.json introuvable')
        realms[realm_id] = config
    return langs, realms


def columns_for(langs):
    return BASE_COLUMNS + [f'name_{code}' for code in langs] + EXTRA_COLUMNS


def detect_delimiter(first_line):
    """Choisit le séparateur qui retrouve le plus de colonnes connues dans l'en-tête."""
    expected = {'realm', 'category', 'id', 'name_en', 'x', 'y'}
    best, best_score = ';', -1
    for delimiter in (';', ',', '\t'):
        cells = {c.strip().strip('"').lstrip('\ufeff').lower() for c in first_line.split(delimiter)}
        score = len(cells & expected)
        if score > best_score:
            best, best_score = delimiter, score
    return best


def read_csv(langs):
    if not os.path.exists(CSV_PATH):
        sys.exit(f"{CSV_PATH} introuvable. Pour le créer depuis tes JSON actuels : "
                 f"python tools/build-data.py --import")

    with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:   # tolère le BOM d'Excel
        text = f.read()

    first_line = text.split('\n', 1)[0]
    delimiter = detect_delimiter(first_line)

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

    # En-têtes tolérants : espaces, guillemets, majuscules (Realm -> realm, minzoom -> minZoom)
    canonical = {c.lower(): c for c in columns_for(langs)}
    fieldnames = []
    for name in (reader.fieldnames or []):
        clean = name.strip().strip('"').lstrip('\ufeff').strip()
        fieldnames.append(canonical.get(clean.lower(), clean))
    reader.fieldnames = fieldnames

    missing = [c for c in ('realm', 'category', 'name_en', 'x', 'y') if c not in fieldnames]
    if missing:
        shown = ' | '.join(fieldnames)
        sys.exit(f'En-tête du CSV incorrect : colonne(s) introuvable(s) : {", ".join(missing)}\n'
                 f'Séparateur détecté : "{delimiter}"\n'
                 f'Colonnes lues sur la 1re ligne : {shown}\n'
                 f'La 1re ligne doit être exactement : {delimiter.join(columns_for(langs))}')

    rows, skipped_headers = [], 0
    for raw in reader:
        row = {k: (v or '').strip() for k, v in raw.items() if k}
        if not any(row.values()):
            continue                                   # ligne vide
        if row.get('realm', '').lower() == 'realm' and row.get('category', '').lower() == 'category':
            skipped_headers += 1                       # en-tête recopié par erreur
            continue
        rows.append((reader.line_num, row))

    print(f'CSV lu : séparateur "{delimiter}", {len(fieldnames)} colonnes, {len(rows)} lignes de données.')
    if skipped_headers:
        print(f'  ({skipped_headers} ligne(s) d\'en-tête en double ignorée(s))')
    return fieldnames, delimiter, rows


def write_csv(fieldnames, delimiter, rows):
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    with open(CSV_PATH, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=delimiter,
                                extrasaction='ignore', lineterminator='\n')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, '') for k in fieldnames})


# ---------------------------------------------------------------- JSON -> CSV

def import_json(force):
    if os.path.exists(CSV_PATH) and not force:
        sys.exit(f'{CSV_PATH} existe déjà. Utilise --force pour le remplacer par les JSON actuels.')

    langs, realms = load_config()
    fieldnames = columns_for(langs)
    rows, ignored = [], set()

    for realm_id, config in realms.items():
        trans = {code: read_json(os.path.join('i18n', code, 'names', f'{realm_id}.json'), {})
                 for code in langs}

        data, used = {}, {'_realm'}
        for category, definition in config['categories'].items():
            data[category] = read_json(os.path.join(REALMS_DIR, realm_id, definition['file']), [])
            used.update(i['id'] for i in data[category] if i.get('id'))

        row = {'realm': realm_id, 'category': '_realm', 'id': '_realm', 'name_en': config['name']}
        row.update({f'name_{c}': trans[c].get('_realm', '') for c in langs})
        rows.append(row)

        for category, items in data.items():
            for item in items:
                if not isinstance(item, dict):
                    print(f'  Entrée ignorée : {realm_id}/{category} (format invalide)')
                    continue

                name = str(item.get('name') or '').strip()

                if not name or item.get('x') is None or item.get('y') is None:
                    print(f'  Entrée ignorée : {realm_id}/{category} (nom ou coordonnées manquants)')
                    continue

                place_id = item.get('id') or unique_slug(name, used)
        
                row = {'realm': realm_id, 'category': category, 'id': place_id,
                       'name_en': item['name'], 'x': item['x'], 'y': item['y']}
                row.update({f'name_{c}': trans[c].get(place_id, '') for c in langs})
                for extra in EXTRA_COLUMNS:
                    if extra in item:
                        row[extra] = 'false' if item[extra] is False else item[extra]
                ignored.update(set(item) - KNOWN_KEYS)
                rows.append(row)

    write_csv(fieldnames, ';', rows)
    print(f'{CSV_PATH} créé : {len(rows)} lignes.')
    if ignored:
        print(f'ATTENTION : clés non gérées par le CSV et non reprises : {", ".join(sorted(ignored))}')
    print('Tu peux maintenant éditer ce fichier, puis lancer : python tools/build-data.py')


# ---------------------------------------------------------------- CSV -> JSON

def build(force):
    langs, realms = load_config()
    fieldnames, delimiter, rows = read_csv(langs)
    errors = []

    # --- Passe 1 : validation des lignes et collecte des id explicites
    valid, explicit = [], {}
    for line, row in rows:
        realm, category = row.get('realm', ''), row.get('category', '')

        if realm not in realms:
            start = ' | '.join([v for v in row.values() if v][:4])
            valid_realms = ', '.join(realms)
            if any(ch in realm for ch in ';\t') or realm.count(',') >= 2:
                errors.append(f'ligne {line} : séparateur différent de celui de l\'en-tête ("{delimiter}"). '
                              f'Utilise le même séparateur partout (la ligne commence par : {start})')
            elif not realm:
                errors.append(f'ligne {line} : colonne "realm" vide. Mets le nom du dossier du royaume '
                              f'({valid_realms}). Valeurs lues sur cette ligne : {start}')
            else:
                errors.append(f'ligne {line} : royaume inconnu "{realm}" (royaumes valides : {valid_realms})')
            continue
        if category != '_realm' and category not in realms[realm]['categories']:
            valid_cats = ', '.join(list(realms[realm]['categories']) + ['_realm'])
            errors.append(f'ligne {line} : catégorie inconnue "{category}" pour {realm} '
                          f'(catégories valides : {valid_cats})')
            continue

        if category == '_realm':
            row['id'] = '_realm'
            row['name_en'] = realms[realm]['name']       # le nom anglais vient de realm.json
        else:
            if not row.get('name_en'):
                errors.append(f'ligne {line} : name_en vide')
                continue
            try:
                row['_x'], row['_y'] = parse_number(row.get('x', '')), parse_number(row.get('y', ''))
            except ValueError:
                errors.append(f'ligne {line} : x ou y invalide ("{row.get("x", "")}", "{row.get("y", "")}")')
                continue

        place_id = row.get('id', '')
        if place_id:
            if place_id != '_realm' and not ID_PATTERN.match(place_id):
                errors.append(f'ligne {line} : id invalide "{place_id}" (minuscules, chiffres et tirets)')
                continue
            seen = explicit.setdefault(realm, {})
            if place_id in seen:
                errors.append(f'ligne {line} : id en double "{place_id}" ({realm}, déjà ligne {seen[place_id]})')
                continue
            seen[place_id] = line

        row['_line'] = line
        valid.append(row)

    # --- Passe 2 : id manquants (générés à partir du nom anglais)
    generated = 0
    used = {realm: set(ids) for realm, ids in explicit.items()}
    for row in valid:
        if not row.get('id'):
            row['id'] = unique_slug(row['name_en'], used.setdefault(row['realm'], set()))
            generated += 1

    # --- Construction des sorties
    items = {realm: {category: [] for category in config['categories']}
             for realm, config in realms.items()}
    names = {code: {realm: {} for realm in realms} for code in langs}

    for row in valid:
        realm, category, place_id = row['realm'], row['category'], row['id']

        for code in langs:
            value = row.get(f'name_{code}', '')
            if value and value != row['name_en']:       # identique à l'anglais : inutile
                names[code][realm][place_id] = value

        if category == '_realm':
            continue

        item = {'id': place_id, 'name': row['name_en'], 'x': row['_x'], 'y': row['_y']}
        for key in ('minZoom', 'labelMinZoom'):
            if row.get(key, ''):
                try:
                    item[key] = int(row[key])
                except ValueError:
                    errors.append(f'ligne {row["_line"]} : {key} invalide "{row[key]}"')
        if row.get('label', '').lower() in FALSE_WORDS:
            item['label'] = False

        items[realm][category].append(item)

    if errors:
        print(f'{len(errors)} erreur(s), rien n\'a été écrit :')
        for message in errors:
            print(f'  {message}')
        sys.exit(1)

    # --- Protection : ne pas supprimer silencieusement des lieux absents du CSV
    at_risk = []
    for realm, config in realms.items():
        for category, definition in config['categories'].items():
            path = os.path.join(REALMS_DIR, realm, definition['file'])
            new_ids = {i['id'] for i in items[realm][category]}
            new_names = {i['name'] for i in items[realm][category]}
            # Ignore les anciens objets vides, sans nom ni identifiant.
            old_items = read_json(path, [])
            lost = []
            for old_item in old_items:
                if not isinstance(old_item, dict):
                    continue
                old_id = str(old_item.get('id') or '').strip()
                old_name = str(old_item.get('name') or '').strip()
                if not old_id and not old_name:
                    continue
                if old_id:
                    missing = old_id not in new_ids
                else:
                    missing = old_name not in new_names
                if missing:
                    lost.append(old_item)
            if lost:
                at_risk.append((path, lost))

    if at_risk and not force:
        print('Arrêt : ces fichiers contiennent des lieux absents du CSV (ils seraient supprimés) :')
        for path, lost in at_risk:
            sample = ', '.join(i.get('name', '?') for i in lost[:3])
            print(f'  {path} : {len(lost)} lieu(x), par ex. {sample}')
        print('\nSi ces lieux ne sont pas encore dans le CSV, lance d\'abord : '
              'python tools/build-data.py --import --force')
        print('(attention : cela remplace le CSV). Sinon, --force confirme leur suppression.')
        sys.exit(1)

    # --- Écriture
    if generated:                               # conserve les id générés dans le CSV
        shutil.copyfile(CSV_PATH, CSV_PATH + '.bak')
        write_csv(fieldnames, delimiter, [row for _, row in rows])

    changed = 0
    for realm, config in realms.items():
        for category, definition in config['categories'].items():
            path = os.path.join(REALMS_DIR, realm, definition['file'])
            changed += write_if_changed(path, dumps_items(items[realm][category]))
        for code in langs:
            path = os.path.join('i18n', code, 'names', f'{realm}.json')
            changed += write_if_changed(path, dumps_names(names[code][realm]))

    # --- Résumé
    print(f'{len(valid)} lignes lues, {changed} fichier(s) mis à jour.')
    if generated:
        print(f'{generated} id généré(s) et enregistré(s) dans le CSV (copie : {CSV_PATH}.bak)')
    for realm, config in realms.items():
        counts = ', '.join(f'{len(items[realm][c])} {c}' for c in config['categories'])
        print(f'  {realm} : {counts}')
    for code in langs:
        total = sum(len(v) for v in names[code].values())
        print(f'  {code} : {total} nom(s) traduit(s)')


def main():
    parser = argparse.ArgumentParser(description='CSV <-> JSON des lieux et des traductions')
    parser.add_argument('--import', dest='do_import', action='store_true',
                        help='crée le CSV à partir des JSON existants')
    parser.add_argument('--force', action='store_true',
                        help='autorise l\'écrasement du CSV ou la suppression de lieux absents du CSV')
    args = parser.parse_args()

    if args.do_import:
        import_json(args.force)
    else:
        build(args.force)


if __name__ == '__main__':
    main()
