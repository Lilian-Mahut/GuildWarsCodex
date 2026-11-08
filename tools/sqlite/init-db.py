"""Import initial des données GuildWarsCodex vers SQLite."""
import csv
import json
import math
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data/db/guildwarscodex.db"
SCHEMA = Path(__file__).with_name("schema.sql")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def optional_zoom(value):
    value = str(value or "").strip()
    if not value:
        return None
    number = int(value)
    if number < 0:
        raise ValueError("Zoom négatif")
    return number


def optional_label(value):
    value = str(value or "").strip().lower()
    if not value:
        return None
    if value in ("false", "faux", "non", "no", "0"):
        return 0
    if value in ("true", "vrai", "oui", "yes", "1"):
        return 1
    raise ValueError(f"Label invalide : {value}")


def main():
    if DB.exists():
        raise SystemExit(f"Base déjà existante, import annulé : {DB}")

    languages = read_json(ROOT / "i18n/languages.json")
    realms = {
        path.parent.name: read_json(path)
        for path in sorted((ROOT / "data/realms").glob("*/realm.json"))
    }

    with (ROOT / "data/source/places.csv").open(
        encoding="utf-8-sig", newline=""
    ) as file:
        reader = csv.DictReader(file, delimiter=";")
        required = {"realm", "category", "id", "name_en", "x", "y"}

        columns = set(reader.fieldnames or [])
        missing = required - columns

        if missing:
            raise ValueError(
                f"Colonnes CSV manquantes : {sorted(missing)}"
            )

        translation_codes = {
            lang["code"]
            for lang in languages
            if f"name_{lang['code']}" in columns
        }

        rows = list(reader)

    DB.parent.mkdir(parents=True, exist_ok=True)

    try:
        with sqlite3.connect(DB) as db:
            db.execute("PRAGMA foreign_keys = ON")
            db.executescript(SCHEMA.read_text(encoding="utf-8-sig"))
            db.execute("BEGIN")

            for lang in languages:
                db.execute(
                    "INSERT INTO languages(code, name) VALUES (?, ?)",
                    (lang["code"], lang["label"])
                )

            for realm, config in realms.items():
                db.execute(
                    "INSERT INTO realms(id, name_en) VALUES (?, ?)",
                    (realm, config["name"])
                )
                for category, definition in config["categories"].items():
                    db.execute(
                        """INSERT INTO categories
                           (realm_id, id, file_path) VALUES (?, ?, ?)""",
                        (realm, category, definition["file"])
                    )

            seen = set()
            places_count = 0

            for line, row in enumerate(rows, 2):
                if None in row:
                    raise ValueError(f"Ligne {line}: colonnes supplémentaires")

                realm = (row.get("realm") or "").strip()
                category = (row.get("category") or "").strip()
                slug = (row.get("id") or "").strip()
                name = (row.get("name_en") or "").strip()

                if realm not in realms:
                    raise ValueError(f"Ligne {line}: royaume inconnu")

                if category == "_realm":
                    if slug != "_realm":
                        raise ValueError(f"Ligne {line}: ID _realm attendu")
                elif category not in realms[realm]["categories"]:
                    raise ValueError(f"Ligne {line}: catégorie inconnue")
                elif not name or not ID_RE.fullmatch(slug):
                    raise ValueError(f"Ligne {line}: nom ou ID invalide")

                key = (realm, slug)
                if key in seen:
                    raise ValueError(f"Ligne {line}: ID en double {key}")
                seen.add(key)

                if category == "_realm":
                    for lang in languages:
                        code = lang["code"]
                        if code == "en":
                            continue
                        translated = (row.get(f"name_{code}") or "").strip()
                        if translated and translated != realms[realm]["name"]:
                            db.execute(
                                """INSERT INTO realm_translations
                                   VALUES (?, ?, ?)""",
                                (realm, code, translated)
                            )
                    continue

                x = float(row["x"].replace(",", "."))
                y = float(row["y"].replace(",", "."))
                if not math.isfinite(x) or not math.isfinite(y):
                    raise ValueError(f"Ligne {line}: coordonnées non finies")

                cursor = db.execute(
                    """INSERT INTO places
                       (realm_id, category_id, slug, name_en,
                        x, y, min_zoom, label_min_zoom, label)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        realm, category, slug, name, x, y,
                        optional_zoom(row.get("minZoom")),
                        optional_zoom(row.get("labelMinZoom")),
                        optional_label(row.get("label"))
                    )
                )
                places_count += 1

                for lang in languages:
                    code = lang["code"]
                    if code == "en":
                        continue
                    translated = (row.get(f"name_{code}") or "").strip()
                    if translated and translated != name:
                        db.execute(
                            """INSERT INTO translations
                               (place_id, language_code, name)
                               VALUES (?, ?, ?)""",
                            (cursor.lastrowid, code, translated)
                        )

            if db.execute("PRAGMA foreign_key_check").fetchall():
                raise ValueError("Erreur d'intégrité des clés étrangères")

            db.commit()

            print("Importation SQLite réussie")
            print("Royaumes :", len(realms))
            print("Langues :", len(languages))
            print("Lignes CSV :", len(rows))
            print("Lieux :", places_count)

            for table in ("categories", "translations", "realm_translations"):
                count = db.execute(
                    f"SELECT COUNT(*) FROM {table}"
                ).fetchone()[0]
                print(f"{table} :", count)

    except BaseException:
        DB.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    main()