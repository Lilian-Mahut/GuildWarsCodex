"""Vérifie la parité entre le CSV de migration et les lignes lues par le Studio."""

import csv

from storage import COLUMNS, ROOT, load_rows


def main():
    with (ROOT / "data/source/places.csv").open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, delimiter=";")
        if not set(COLUMNS).issubset(reader.fieldnames or ()):
            raise SystemExit("Colonnes CSV manquantes")
        expected = [
            {column: row[column] or "" for column in COLUMNS}
            for row in reader if row.get("realm")
        ]

    actual = load_rows()
    differences = abs(len(expected) - len(actual))
    for number, (csv_row, sqlite_row) in enumerate(zip(expected, actual), start=2):
        for column in COLUMNS:
            if csv_row[column] != sqlite_row[column]:
                differences += 1
                print(f"Ligne {number}, {column} : {csv_row[column]!r} != {sqlite_row[column]!r}")

    print(f"CSV : {len(expected)} | SQLite : {len(actual)} | Écarts : {differences}")
    return int(bool(differences))


if __name__ == "__main__":
    raise SystemExit(main())
