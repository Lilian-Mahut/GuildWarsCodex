PRAGMA foreign_keys = ON;

CREATE TABLE realms (
    id TEXT PRIMARY KEY,
    name_en TEXT NOT NULL
);

CREATE TABLE categories (
    realm_id TEXT NOT NULL,
    id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    PRIMARY KEY (realm_id, id),
    FOREIGN KEY (realm_id)
        REFERENCES realms(id)
        ON DELETE CASCADE
);

CREATE TABLE places (
    id INTEGER PRIMARY KEY,
    realm_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    name_en TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    min_zoom INTEGER CHECK (min_zoom >= 0),
    label_min_zoom INTEGER CHECK (label_min_zoom >= 0),
    label INTEGER CHECK (label IN (0, 1)),
    UNIQUE (realm_id, slug),
    FOREIGN KEY (realm_id, category_id)
        REFERENCES categories(realm_id, id)
);

CREATE TABLE languages (
    code TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE translations (
    place_id INTEGER NOT NULL,
    language_code TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (place_id, language_code),
    FOREIGN KEY (place_id)
        REFERENCES places(id)
        ON DELETE CASCADE,
    FOREIGN KEY (language_code)
        REFERENCES languages(code)
);

CREATE TABLE realm_translations (
    realm_id TEXT NOT NULL,
    language_code TEXT NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (realm_id, language_code),
    FOREIGN KEY (realm_id)
        REFERENCES realms(id)
        ON DELETE CASCADE,
    FOREIGN KEY (language_code)
        REFERENCES languages(code)
);

CREATE INDEX idx_places_category
    ON places(realm_id, category_id);

CREATE INDEX idx_places_name
    ON places(name_en);