import csv
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

csv_path = ROOT / "data/source/places.csv"
db_path = ROOT / "data/db/guildwarscodex.db"

with csv_path.open(encoding="utf-8-sig", newline="") as file:
    rows = list(csv.DictReader(file, delimiter=";"))

with sqlite3.connect(db_path) as db:
    db.row_factory = sqlite3.Row

    places = db.execute("""
        SELECT realm_id, category_id, slug, name_en,
               x, y, min_zoom, label_min_zoom, label
        FROM places
    """).fetchall()

    index = {
        (place["realm_id"], place["slug"]): place
        for place in places
    }

    errors = []

    for row in rows:
        if row["category"] == "_realm":
            continue

        key = (row["realm"], row["id"])
        place = index.get(key)

        if place is None:
            errors.append(f"Lieu absent : {key}")
            continue

        if place["category_id"] != row["category"]:
            errors.append(f"Catégorie différente : {key}")

        if place["name_en"] != row["name_en"]:
            errors.append(f"Nom différent : {key}")

        for coordinate in ("x", "y"):
            if abs(place[coordinate] - float(row[coordinate])) > 1e-9:
                errors.append(f"Coordonnée {coordinate} différente : {key}")

        for csv_column, db_column in (
            ("minZoom", "min_zoom"),
            ("labelMinZoom", "label_min_zoom"),
        ):
            value = (row.get(csv_column) or "").strip()
            expected = int(value) if value else None

            if place[db_column] != expected:
                errors.append(f"{csv_column} différent : {key}")

        raw_label = (row.get("label") or "").strip().lower()
        expected_label = (
            None if not raw_label
            else 1 if raw_label in ("true", "1", "yes", "oui", "vrai")
            else 0
        )

        if place["label"] != expected_label:
            errors.append(f"Label différent : {key}")

    csv_keys = {
        (row["realm"], row["id"])
        for row in rows
        if row["category"] != "_realm"
    }

    for key in index.keys() - csv_keys:
        errors.append(f"Lieu supplémentaire dans SQLite : {key}")

    # Vérification des traductions
    translations = db.execute("""
        SELECT p.realm_id, p.slug, t.language_code, t.name
        FROM translations t
        JOIN places p ON p.id = t.place_id
    """).fetchall()

    actual = {
        (t["realm_id"], t["slug"], t["language_code"]): t["name"]
        for t in translations
    }

    expected = {}

    for row in rows:
        if row["category"] == "_realm":
            continue

        for language in ("fr", "de", "es"):
            translated = (row.get(f"name_{language}") or "").strip()

            if translated and translated != row["name_en"].strip():
                key = (row["realm"], row["id"], language)
                expected[key] = translated

    for key in expected.keys() | actual.keys():
        if expected.get(key) != actual.get(key):
            errors.append(f"Traduction différente : {key}")

    print("Traductions CSV :", len(expected))
    print("Traductions SQLite :", len(actual))
    print("Lieux CSV :", len(csv_keys))
    print("Lieux SQLite :", len(places))
    print("Différences :", len(errors))

    for error in errors:
        print("ERREUR :", error)

    if not errors:
        print("VALIDATION RÉUSSIE : tous les lieux correspondent.")
    else:
        raise SystemExit(1)