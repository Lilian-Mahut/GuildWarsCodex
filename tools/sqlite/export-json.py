
import argparse
import json
import os
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from storage import DB_PATH, ROOT, connect

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


def publish(generated):
    """Prépare toutes les sorties avant de remplacer les fichiers de la carte."""
    with TemporaryDirectory(prefix=".sqlite-export-", dir=ROOT) as folder:
        staging = Path(folder)
        pending = []
        for number, (relative, content) in enumerate(generated.items()):
            target = ROOT / relative
            original = target.read_bytes() if target.exists() else None
            if original is not None and target.read_text(encoding="utf-8-sig") == content:
                continue

            staged = staging / f"{number}.new"
            staged.write_text(content, encoding="utf-8", newline="\n")
            previous = None
            if original is not None:
                previous = staging / f"{number}.old"
                previous.write_bytes(original)
            pending.append((staged, target, previous))

        installed = []
        try:
            for staged, target, previous in pending:
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(staged, target)
                installed.append((target, previous))
        except OSError:
            for target, previous in reversed(installed):
                if previous is None:
                    target.unlink()
                else:
                    os.replace(previous, target)
            raise

        return len(installed)


def main():
    parser = argparse.ArgumentParser(description="Exporte les données SQLite de la carte.")
    parser.add_argument("--publish", action="store_true", help="met à jour les JSON de la carte locale")
    args = parser.parse_args()
    if not DB_PATH.is_file():
        raise SystemExit(f"Base SQLite introuvable : {DB_PATH}")

    with closing(connect("ro")) as db:
        db.execute("BEGIN")

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
            WHERE t.name != ''
            ORDER BY p.id, t.language_code
        """).fetchall()

        realm_names = dict(db.execute("SELECT id, name_en FROM realms").fetchall())
        realm_translations = db.execute("""
            SELECT realm_id, language_code, name
            FROM realm_translations WHERE name != ''
            ORDER BY realm_id, language_code
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

    for translation in realm_translations:
        key = (translation["language_code"], translation["realm_id"])
        names.setdefault(key, {})["_realm"] = translation["name"]

    generated = {}
    differences = []

    for config_path in sorted(
        (ROOT / "data/realms").glob("*/realm.json")
    ):
        realm = config_path.parent.name
        original_config = config_path.read_text(encoding="utf-8-sig")
        config = json.loads(original_config)
        if realm in realm_names and config["name"] != realm_names[realm]:
            config["name"] = realm_names[realm]
            generated[config_path.relative_to(ROOT)] = dumps_names(config)

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

    if args.publish:
        changed = publish(generated)
        print(f"Carte locale générée : {len(generated)} fichiers, {changed} mis à jour.")
        print(f"Lieux exportés : {len(places)}")
        return

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
