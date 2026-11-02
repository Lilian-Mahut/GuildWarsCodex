// Chargement des données : world.json, layers.json et chaque royaume
import { fetchJson } from './http.js';

function loadStylesheet(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

// Aide : signale les lieux sans id et les id en double (nécessaires aux traductions)
function checkIds(realm) {
    const seen = new Set();
    let missing = 0;

    for (const def of Object.values(realm.categories)) {
        for (const item of def.items) {
            if (!item.id) { missing++; continue; }
            if (seen.has(item.id)) console.warn(`${realm.id} : id en double "${item.id}"`);
            seen.add(item.id);
        }
    }
    if (missing) console.warn(`${realm.id} : ${missing} lieu(x) sans "id" (voir tools/add-ids.py)`);
}

async function loadRealm(id) {
    const base = `data/realms/${id}/`;
    const realm = await fetchJson(base + 'realm.json');

    realm.iconsPath = `assets/realms/${id}/icons/`;
    loadStylesheet(`css/realms/${id}.css`);

    // Charge le fichier de chaque catégorie
    await Promise.all(
        Object.values(realm.categories).map(async (def) => {
            def.items = await fetchJson(base + def.file);
        })
    );

    checkIds(realm);

    // Le nom du royaume : catégorie "realm" avec un seul élément (id réservé "_realm")
    realm.categories.realm = {
        items: [{ id: '_realm', name: realm.name, x: realm.title.x, y: realm.title.y }]
    };

    return realm;
}

export async function loadWorld() {
    const world = await fetchJson('data/world.json');
    const { layers, iconScales } = await fetchJson('data/layers.json');

    world.layers = layers;
    world.iconScales = iconScales;
    world.realms = await Promise.all(world.realms.map(loadRealm));

    return world;
}
