import { getIconScale, isVisible, hasLabel, isLabelVisible } from './zoom-rules.js';
import { getName, onLanguageChange, t } from './i18n.js';

const SHARED_ICONS = 'assets/shared/icons/';

// Affiche le nom (dans la langue courante) sur le nom, l'alt de l'icône et le tooltip
function setEntryName(entry) {
    const name = getName(entry.realm.id, entry.item);

    if (entry.labelEl) {
        const isIslesTitle = entry.realm.id === 'zaishen' && entry.item.id === '_realm';
        let label = name;
        if (isIslesTitle) {
            label = name.replace(/^(Îles|Iles)\s+(antagonistes)$/iu, '$1\n$2');
        }
        if (entry.realm.id === 'eotn' && entry.item.id === '_realm') {
            label = name.replace(/\s+(north)$/i, '\n$1');
        }
        entry.labelEl.textContent = label;
    }
    if (entry.imgEl) entry.imgEl.alt = name;

    const tooltip = entry.marker.getTooltip();
    if (tooltip) tooltip.setContent(name);
}

function createEntry(map, world, realm, category, def, rule, item) {
    const zoom = map.getZoom();
    const isText = rule.kind === 'text';

    // Icône : celle du lieu, sinon celle du royaume, sinon l'icône partagée (layers.json)
    const iconDef = item.icon ?? def.icon ?? rule.icon;
    const iconsPath = (item.icon || def.icon) ? realm.iconsPath : SHARED_ICONS;

    // Référence commune : icône des Chutes de Vlox, 25 × 25 px.
    const size = isText ? [0, 0] : [25, 25];
    const half = size[1] / 2;

    const classes = [
        'gw-item',
        `realm-${realm.id}`,
        `cat-${category}`,
        isText ? 'gw-item--text' : '',
        isVisible(zoom, rule, item) ? '' : 'is-hidden'
    ].join(' ');

    const isPortal = category === 'gate';

const imgHtml = isText
    ? ''
    : isPortal
        ? '<span class="gw-icon gw-portal" aria-hidden="true"></span>'
        : `<img class="gw-icon" src="${iconsPath}${iconDef.file}" draggable="false">`;

    const labelHtml = (isText || hasLabel(rule, item)) ? `
        <span class="gw-label${isText || isLabelVisible(zoom, rule, item) ? '' : ' is-off'}"></span>` : '';

    const icon = L.divIcon({
        className: 'gw-marker',
        iconSize: size,
        iconAnchor: [size[0] / 2, half],
        html: `<div class="${classes}" style="--s:${getIconScale(zoom, world)};--half:${half}px">
                   ${imgHtml}${labelHtml}
               </div>`
    });

    const marker = L.marker(
        map.unproject([item.x, item.y], world.maxZoom),
        { icon, interactive: !isText }
    ).addTo(map);

    const root = marker.getElement();
    const entry = {
        marker, realm, category, size, root, iconDef, rule, item, isText,
        el: root.querySelector('.gw-item'),
        imgEl: root.querySelector('.gw-icon'),
        labelEl: root.querySelector('.gw-label')
    };

    setEntryName(entry);
    return entry;
}

// Met à jour toutes les entrées pour un niveau de zoom
function applyZoom(entries, world, zoom) {
    const scale = getIconScale(zoom, world);

    entries.forEach((e) => {
        const zoomSize = e.rule.iconSizes?.[zoom];
        const [width, height] = Array.isArray(zoomSize)
            ? zoomSize
            : zoomSize ? [zoomSize, zoomSize] : e.size;
        const iconScale = scale;

        e.root.style.width = `${width}px`;
        e.root.style.height = `${height}px`;
        e.root.style.marginLeft = `${-width / 2}px`;
        e.root.style.marginTop = `${-height / 2}px`;
        e.el.style.setProperty('--half', `${height / 2}px`);
        e.el.style.setProperty('--s', iconScale);
        e.el.classList.toggle('is-hidden', !isVisible(zoom, e.rule, e.item));

        if (e.isText) return;   // pas d'icône ni de tooltip pour le texte seul

        const labelShown = isLabelVisible(zoom, e.rule, e.item);
        if (e.labelEl) e.labelEl.classList.toggle('is-off', !labelShown);

        // Tooltip seulement si le nom n'est pas déjà affiché sous l'icône
        if (labelShown) {
            if (e.marker.getTooltip()) e.marker.unbindTooltip();
        } else {
            if (!e.marker.getTooltip()) {
                e.marker.bindTooltip(getName(e.realm.id, e.item), {
                    direction: 'bottom',
                    className: `gw-map-tooltip realm-${e.realm.id}`
                });
            }
            e.marker.getTooltip().options.offset =
                L.point(0, (height * iconScale) / 2);
        }
    });
}

export function addMarkers(map, world, control) {
    const entries = [];

    console.table(
    world.realms.flatMap(realm =>
        Object.entries(realm.categories).map(([category, def]) => ({
            royaume: realm.id,
            categorie: category,
            total: def.items?.length ?? 0,
            valides: (def.items ?? []).filter(item =>
                item &&
                Number.isFinite(item.x) &&
                Number.isFinite(item.y)
            ).length,
            regle: {
                ...world.layers[category],
                ...def.rule
            }.kind ?? "MANQUANTE"
        }))
    )
);

    world.realms.forEach((realm) => {
        Object.entries(realm.categories).forEach(([category, def]) => {
            // Règle globale (layers.json), complétée ou remplacée par celle du royaume
            const rule = { ...world.layers[category], ...def.rule };

            if (!rule.kind) {
                console.warn(`"${category}" (${realm.id}) : aucune règle de zoom. Ajoute-la dans layers.json ou dans "rule" du royaume.`);
                return;
            }
            if (realm.id === 'eotn' && category === 'town') {
                console.log('[DEBUG EOTN TOWN]', {
                    nombreDeLieux: def.items?.length,
                    iconeCategorie: def.icon,
                    iconGlobal: rule.icon,
                    regle: rule
                });
            }
            if (rule.kind === 'icon' && !def.icon && !rule.icon) {
                console.warn(`"${category}" (${realm.id}) : aucune icône définie.`);
                return;
            }

            def.items.forEach((item, index) => {
                if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y)) {
                    console.warn(`Marker ignoré : ${realm.id}/${category}, index ${index}`, item);
                    return;
                }
                entries.push(createEntry(map, world, realm, category, def, rule, item));
            });
        });
    });

    map.on('zoomanim', (e) => applyZoom(entries, world, e.zoom));
    map.on('zoomend', () => applyZoom(entries, world, map.getZoom()));
    applyZoom(entries, world, map.getZoom());

    if (control) {
        const groups = new Map();
        for (const entry of entries) {
            if (!groups.has(entry.category)) groups.set(entry.category, []);
            groups.get(entry.category).push(entry);
        }
        const filters = new Map();
        for (const category of new Set(world.realms.flatMap(realm => Object.keys(realm.categories)))) {
            const group = L.layerGroup();
            const setVisible = visible => {
                for (const entry of groups.get(category) ?? []) {
                    entry.root.classList.toggle('gw-category-hidden', !visible);
                    if (!visible && entry.marker.getTooltip()) entry.marker.closeTooltip();
                }
            };
            group.on('add', () => setVisible(true));
            group.on('remove', () => setVisible(false));
            group.addTo(map);
            control.addOverlay(group, t('category.' + category));
            filters.set(category, group);
        }
        onLanguageChange(() => {
            for (const [category, group] of filters) {
                control.removeLayer(group);
                control.addOverlay(group, t('category.' + category));
            }
        });
    }

    // Changement de langue : met à jour tous les noms sans recharger la page
    onLanguageChange(() => entries.forEach(setEntryName));

    console.log(
    `[GuildWarsReborn] ${entries.length} markers créés`,
    `| Zoom actuel : ${map.getZoom()}`
);
}
