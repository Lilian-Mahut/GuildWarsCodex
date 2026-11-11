
"""Accès aux données SQLite de GuildWarsCodex Studio."""

import os
import re
import sqlite3
import unicodedata
from contextlib import closing
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = ROOT / "data/db/guildwarscodex.db"
DB_PATH = Path(os.environ.get("GW_ADMIN_DB", DEFAULT_DB_PATH)).resolve()
BACKUPS = ROOT / "_backup/studio" if DB_PATH == DEFAULT_DB_PATH else DB_PATH.parent / "backups"
LANGUAGES = ("fr", "es", "de")

COLUMNS = [
    "realm", "category", "id", "name_en",
    "x", "y", "name_fr", "name_es", "name_de",
    "minZoom", "labelMinZoom", "label"
]


def to_text(value):
    """Convertit une valeur SQLite en texte compatible avec le CSV."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def load_rows():
    """Retourne les lieux au format attendu par le Studio."""
    if not DB_PATH.is_file():
        raise FileNotFoundError(f"Base SQLite introuvable : {DB_PATH}")

    with closing(connect("ro")) as db:
        db.execute("BEGIN")

        places = db.execute("""
            SELECT id, realm_id, category_id, slug, name_en,
                   x, y, min_zoom, label_min_zoom, label
            FROM places
            ORDER BY id
        """).fetchall()

        translations = db.execute("""
            SELECT place_id, language_code, name
            FROM translations
            WHERE language_code IN ('fr', 'es', 'de')
        """).fetchall()

        realm_names = db.execute("""
            SELECT r.id, r.name_en, t.language_code, t.name
            FROM realms r JOIN realm_translations t ON r.id = t.realm_id
            WHERE t.language_code IN ('fr', 'es', 'de')
            ORDER BY r.id
        """).fetchall()

    translated = {
        (row["place_id"], row["language_code"]): row["name"]
        for row in translations
    }

    rows = []

    for place in places:
        row = {
            "realm": place["realm_id"],
            "category": place["category_id"],
            "id": place["slug"],
            "name_en": place["name_en"],
            "x": to_text(place["x"]),
            "y": to_text(place["y"]),
            "name_fr": translated.get((place["id"], "fr"), place["name_en"]),
            "name_es": translated.get((place["id"], "es"), place["name_en"]),
            "name_de": translated.get((place["id"], "de"), place["name_en"]),
            "minZoom": to_text(place["min_zoom"]),
            "labelMinZoom": to_text(place["label_min_zoom"]),
            "label": (
                "" if place["label"] is None
                else "true" if place["label"] else "false"
            ),
        }

        rows.append({column: row[column] for column in COLUMNS})

    realm_rows = {}
    for realm in realm_names:
        row = realm_rows.setdefault(realm["id"], dict.fromkeys(COLUMNS, ""))
        row.update(realm=realm["id"], category="_realm", id="_realm", name_en=realm["name_en"])
        row[f'name_{realm["language_code"]}'] = realm["name"]
    return rows + list(realm_rows.values())


def connect(mode):
    db = sqlite3.connect(f"{DB_PATH.as_uri()}?mode={mode}", uri=True)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def assign_ids(rows):
    used = {(row["realm"], row["id"]) for row in rows if row["id"]}
    for row in rows:
        if row["category"] == "_realm":
            row["id"] = "_realm"
        if row["id"]:
            continue
        name = row["name_en"].replace("'", "").replace("’", "")
        ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
        base = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or "lieu"
        slug, number = base, 2
        while (row["realm"], slug) in used:
            slug, number = f"{base}-{number}", number + 1
        row["id"] = slug
        used.add((row["realm"], slug))


def backup_database():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    destination = BACKUPS / f"places-{stamp}.db"
    try:
        with closing(connect("ro")) as source, closing(sqlite3.connect(destination)) as target:
            source.backup(target)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination


def save_place(db, row):
    label = row["label"].lower()
    place_id = db.execute("""
        INSERT INTO places (realm_id, category_id, slug, name_en, x, y,
                            min_zoom, label_min_zoom, label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(realm_id, slug) DO UPDATE SET
            category_id = excluded.category_id, name_en = excluded.name_en,
            x = excluded.x, y = excluded.y, min_zoom = excluded.min_zoom,
            label_min_zoom = excluded.label_min_zoom, label = excluded.label
        RETURNING id
    """, (
        row["realm"], row["category"], row["id"], row["name_en"],
        float(row["x"].replace(",", ".")), float(row["y"].replace(",", ".")),
        int(row["minZoom"]) if row["minZoom"] else None,
        int(row["labelMinZoom"]) if row["labelMinZoom"] else None,
        int(label in ("true", "vrai", "oui", "yes", "1")) if label else None,
    )).fetchone()[0]
    for language in LANGUAGES:
        name = row[f"name_{language}"]
        if name == row["name_en"]:
            db.execute("DELETE FROM translations WHERE place_id = ? AND language_code = ?",
                       (place_id, language))
        else:
            db.execute("""
                INSERT INTO translations (place_id, language_code, name) VALUES (?, ?, ?)
                ON CONFLICT(place_id, language_code) DO UPDATE SET name = excluded.name
            """, (place_id, language, name))


def save_rows(rows):
    """Enregistre un instantané validé et sauvegarde la base avant modification."""
    rows = [{key: str(row.get(key, "")).strip() for key in COLUMNS} for row in rows]
    assign_ids(rows)
    places = [row for row in rows if row["category"] != "_realm"]
    realms = [row for row in rows if row["category"] == "_realm"]
    kept = {(row["realm"], row["id"]) for row in places}
    with closing(connect("rw")) as db, db:
        db.execute("BEGIN IMMEDIATE")
        backup_path = backup_database()
        removed = [
            (row["id"],) for row in db.execute("SELECT id, realm_id, slug FROM places")
            if (row["realm_id"], row["slug"]) not in kept
        ]
        db.executemany("DELETE FROM places WHERE id = ?", removed)
        for row in places:
            save_place(db, row)
        db.execute("DELETE FROM realm_translations WHERE language_code IN ('fr', 'es', 'de')")
        for row in realms:
            db.execute("UPDATE realms SET name_en = COALESCE(NULLIF(?, ''), name_en) WHERE id = ?",
                       (row["name_en"], row["realm"]))
            db.executemany("""
                INSERT INTO realm_translations (realm_id, language_code, name) VALUES (?, ?, ?)
            """, [(row["realm"], language, row[f"name_{language}"]) for language in LANGUAGES])
    return backup_path


if __name__ == "__main__":
    rows = load_rows()
    print(f"Lieux chargés depuis SQLite : {len(rows)}")
    if rows:
        print("Premier lieu :", rows[0])
