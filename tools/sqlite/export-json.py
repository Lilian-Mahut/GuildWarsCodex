
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = ROOT / "data/db/guildwarscodex.db"
OUTPUT_DIR = ROOT / "_backup/sqlite-export"


def dumps_items(items):
    if not items:
        return "[]\n"
    return "[\n" + ",\n".join(
        "  " + json.dumps(item, ensure_ascii=False)
        for item in items
    ) + "\n]\n"


def dumps_names(names):
    return (
        json.dumps(names, ensure_ascii=False, indent=2)
        if names else "{}"
    ) + "\n"


def number(value):
    if value is None:
        raise ValueError("Coordonnée manquante")
    return int(value) if float(value).is_integer() else value


def main():
    if not DB_PATH.is_file():
        raise SystemExit(f"Base SQLite introuvable : {DB_PATH}")

    with sqlite3.connect(
        f"file:{DB_PATH.as_posix()}?mode=ro",
        uri=True
    ) as db:
        db.row_factory = sqlite3.Row

        languages = [
            row["code"]
            for row in db.execute(
                "SELECT code FROM languages WHERE code NOT IN ('en', 'bork')"
            )
        ]

        places = db.execute("""
            SELECT id, realm_id, category_id, slug, name_en,
                   x, y, min_zoom, label_min_zoom, label
            FROM places
            ORDER BY id
        """).fetchall()

        translations = db.execute("""
            SELECT p.realm_id, p.slug, t.language_code, t.name
            FROM translations t
            JOIN places p ON p.id = t.place_id
            ORDER BY p.id
        """).fetchall()

    items = {}
    names = {}

    for place in places:
        realm = place["realm_id"]
        category = place["category_id"]
        items.setdefault((realm, category), [])

        item = {
            "id": place["slug"],
            "name": place["name_en"],
            "x": number(place["x"]),
            "y": number(place["y"]),
        }

        if place["min_zoom"] is not None:
            item["minZoom"] = place["min_zoom"]

        if place["label_min_zoom"] is not None:
            item["labelMinZoom"] = place["label_min_zoom"]

        if place["label"] is not None:
            item["label"] = bool(place["label"])

        items[(realm, category)].append(item)

    for translation in translations:
        key = (
            translation["language_code"],
            translation["realm_id"]
        )
        names.setdefault(key, {})
        names[key][translation["slug"]] = translation["name"]

    generated = {}
    differences = []

    for config_path in sorted(
        (ROOT / "data/realms").glob("*/realm.json")
    ):
        realm = config_path.parent.name
        config = json.loads(config_path.read_text(encoding="utf-8-sig"))

        for category, definition in config["categories"].items():
            relative = Path("data/realms") / realm / definition["file"]
            generated[relative] = dumps_items(
                items.get((realm, category), [])
            )

        for language in languages:
            relative = Path("i18n") / language / "names" / f"{realm}.json"
            generated[relative] = dumps_names(
                names.get((language, realm), {})
            )

    for relative, content in generated.items():
        output = OUTPUT_DIR / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8", newline="\n")

        original = ROOT / relative

        if not original.exists():
            differences.append((relative, "Fichier original absent"))
            continue

        old_content = original.read_text(encoding="utf-8-sig")

        if old_content != content:
            try:
                old_data = json.loads(old_content)
                new_data = json.loads(content)
                reason = (
                    "Format ou ordre différent"
                    if old_data == new_data
                    else "Données différentes"
                )
            except json.JSONDecodeError:
                reason = "JSON original invalide"

            differences.append((relative, reason))

    print("Fichiers générés :", len(generated))
    print("Lieux exportés :", len(places))
    print("Traductions exportées :", len(translations))
    print("Différences :", len(differences))
    print("Répertoire de test :", OUTPUT_DIR)

    for path, reason in differences:
        print(f"DIFFÉRENCE : {path} — {reason}")

    if differences:
        raise SystemExit(1)

    print("VALIDATION RÉUSSIE : export SQLite identique aux JSON actuels.")


if __name__ == "__main__":
    main()
