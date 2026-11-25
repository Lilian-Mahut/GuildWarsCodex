const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
export const compareNames = (a, b) => collator.compare(a, b);
export const placeName = row => row.name_fr?.trim() || row.name_en?.trim() || '(Sans nom)';

export const placeTypes = {
    _realm: 'Continent',
    region: 'Région',
    zone: 'Zone',
    mission: 'Mission',
    town: 'Ville',
    outpost: 'Avant-poste',
    arena: 'Arène',
    dungeon: 'Donjon',
    gate: 'Portail',
    guildhall: 'Hall de guilde',
    collector: 'Collectionneur',
    'armor-collector': 'Collectionneur d’armure',
    'resurrection-shrine': 'Sanctuaire de résurrection',
    merchant: 'Marchand',
    torment: 'Tourment'
};

const byName = (a, b) => compareNames(a.name, b.name);
const orderPlaces = (a, b) => compareNames(placeName(a.r), placeName(b.r))
    || compareNames(placeTypes[a.r.category] ?? a.r.category, placeTypes[b.r.category] ?? b.r.category)
    || a.i - b.i;

export function renderPlaceTree(list, visible, rows, world, assignments, selected, select, validPoint) {
    const scroll = list.scrollTop;
    const hadFocus = list.contains(document.activeElement);
    const roots = new Map();
    const known = new Map(rows.filter(r => r.category === '_realm' || r.category === 'region')
        .map(r => [JSON.stringify([r.realm, r.category, r.id]), r]));

    function getRealm(id) {
        if (!roots.has(id)) {
            const config = world.realms.find(realm => realm.id === id);
            const row = known.get(JSON.stringify([id, '_realm', '_realm']));
            roots.set(id, { name: row ? placeName(row) : config?.name ?? id, regions: new Map(), config });
        }
        return roots.get(id);
    }

    function getRegion(realm, realmId, id) {
        if (!realm.regions.has(id)) {
            const row = known.get(JSON.stringify([realmId, 'region', id]));
            const config = realm.config?.categories.region?.items.find(item => item.id === id);
            const name = id === 'depths-of-tyria' ? 'Profondeurs de la Tyrie' : config?.name ?? 'Région à préciser';
            realm.regions.set(id, { name: row ? placeName(row) : name, places: [], unassigned: !id });
        }
        return realm.regions.get(id);
    }

    for (const entry of visible) {
        const { r } = entry;
        const realm = getRealm(r.realm);
        if (r.category === '_realm') {
            realm.entry = entry;
            continue;
        }
        const mapped = Object.hasOwn(assignments[r.realm] ?? {}, r.id)
            ? assignments[r.realm][r.id] : null;
        const onlyRegion = realm.config?.categories.region?.items;
        const regionId = r.category === 'region' ? r.id : mapped ?? (onlyRegion?.length === 1 ? onlyRegion[0].id : '');
        const region = getRegion(realm, r.realm, regionId);
        if (r.category === 'region') region.entry = entry;
        else region.places.push(entry);
    }

    let selectedButton;
    function makeButton({ r, i }, showType = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'place';
        button.classList.toggle('active', i === selected);
        button.setAttribute('aria-pressed', String(i === selected));
        button.dataset.category = r.category;
        const name = document.createElement('span');
        name.textContent = placeName(r);
        if (r.category !== '_realm' && !validPoint(r)) name.textContent += ' ⚠';
        button.append(name);
        if (showType) {
            const badge = document.createElement('small');
            badge.className = 'place-type';
            badge.textContent = placeTypes[r.category] ?? r.category;
            button.append(badge);
        }
        button.onclick = () => select(i);
        if (i === selected) selectedButton = button;
        return button;
    }

    function heading(group, tag) {
        const node = document.createElement(tag);
        if (group.entry) node.append(makeButton(group.entry));
        else node.textContent = group.name;
        return node;
    }

    const tree = document.createElement('ul');
    tree.className = 'place-tree';
    for (const realm of [...roots.values()].sort(byName)) {
        const item = document.createElement('li');
        item.append(heading(realm, 'h2'));
        const regions = document.createElement('ul');
        for (const region of [...realm.regions.values()].sort((a, b) => Number(a.unassigned) - Number(b.unassigned) || byName(a, b))) {
            const group = document.createElement('li');
            group.append(heading(region, 'h3'));
            const places = document.createElement('ul');
            for (const entry of region.places.sort(orderPlaces)) {
                const leaf = document.createElement('li');
                leaf.append(makeButton(entry, true));
                places.append(leaf);
            }
            if (places.childElementCount) group.append(places);
            regions.append(group);
        }
        if (regions.childElementCount) item.append(regions);
        tree.append(item);
    }
    list.replaceChildren(tree);
    if (hadFocus) selectedButton?.focus({ preventScroll: true });
    list.scrollTop = scroll;
}
