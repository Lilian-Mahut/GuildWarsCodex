import { contourKey, contourTypes, addContourLayers, regionContourFromZones } from '../js/core/contours.js';
import { getName } from '../js/core/i18n.js';
import { placeName, placeTypes, renderPlaceTree } from './place-list.js';

export function initContourEditor(map, world, contours, request, assignments, rows) {
    const panel = document.getElementById('contours');
    const chooser = panel.querySelector('[data-chooser]');
    const list = panel.querySelector('[data-contour-list]');
    const summary = chooser.querySelector('summary');
    const status = panel.querySelector('[role=status]');
    const edit = panel.querySelector('[data-edit]');
    const undo = panel.querySelector('[data-undo]');
    const restart = panel.querySelector('[data-restart]');
    const save = panel.querySelector('[data-save]');
    const cancel = panel.querySelector('[data-cancel]');
    const colors = panel.querySelector('[data-colors]');
    const picker = colors.querySelector('[data-color]');
    const hex = colors.querySelector('[data-hex]');
    const published = new Map(contours.map(contour => [contourKey(contour), contour]));
    const places = [];
    const studioRows = new Map(rows.map(row => [contourKey(row), row]));
    let selectedIndex = -1;
    const layers = addContourLayers(map, world, contours);
    const preview = L.layerGroup().addTo(map);
    const handles = L.layerGroup().addTo(map);
    map.createPane('gw-contour-handles').style.zIndex = '650';

    for (const realm of world.realms) {
        for (const category of Object.keys(contourTypes)) {
            for (const item of realm.categories[category]?.items ?? []) {
                const place = { realm: realm.id, category, id: item.id };
                const key = contourKey(place);
                const row = studioRows.get(key) ?? { ...place, name_fr: getName(realm.id, item) };
                places.push({ place, item, key, r: row, i: places.length });
            }
        }
    }

    function renderChoices() {
        renderPlaceTree(list, places, rows, world, assignments, selectedIndex, choose, () => true);
    }

    function choose(index) {
        selectedIndex = index;
        const { r } = places[index];
        summary.textContent = placeName(r) + ' · ' + placeTypes[r.category];
        edit.disabled = false;
        renderChoices();
        chooser.open = false;
        edit.focus();
    }
    renderChoices();

    let draft = null;
    let derivedGeometry = null;
    let previous = null;
    let saving = false;
    const hexColor = () => {
        const value = hex.value.trim().replace(/^#/, '');
        return /^[0-9a-f]{6}$/i.test(value) ? '#' + value.toLowerCase() : null;
    };
    const project = latlng => {
        const p = map.project(latlng, world.maxZoom);
        return [Math.round(p.x), Math.round(p.y)];
    };
    const unproject = point => map.unproject(point, world.maxZoom);
    const inBounds = ([x, y]) => x >= 0 && y >= 0 && x <= world.width && y <= world.height;

    function drawPreview() {
        preview.clearLayers();
        if (!draft.length && !derivedGeometry?.length) return;
        const color = picker.value;
        const style = { color, weight: 2, fillOpacity: 0.24, dashArray: '6 4', interactive: false };
        if (derivedGeometry !== null) {
            L.polygon(derivedGeometry, style).addTo(preview);
            return;
        }
        const points = draft.map(unproject);
        (draft.length >= 3 ? L.polygon(points, style) : L.polyline(points, style)).addTo(preview);
    }

    function render() {
        handles.clearLayers();
        drawPreview();
        const editablePoints = derivedGeometry === null ? draft : [];
        editablePoints.forEach((point, index) => {
            const marker = L.marker(unproject(point), {
                pane: 'gw-contour-handles', draggable: !saving,
                icon: L.divIcon({ className: 'gw-contour-vertex', iconSize: [12, 12], iconAnchor: [6, 6] })
            }).addTo(handles);
            marker.on('drag', () => {
                const moved = project(marker.getLatLng());
                if (inBounds(moved)) draft[index] = moved;
                drawPreview();
            });
            marker.on('dragend', render);
        });
        undo.disabled = saving || draft.length === 0;
        restart.disabled = saving || draft.length === 0;
        updateColorControls();
        picker.disabled = hex.disabled = saving;
        cancel.disabled = saving;
        const hint = derivedGeometry === null
            ? `${draft.length} sommets. Clique sur la carte pour en ajouter.`
            : 'Contour calculé à partir des zones rattachées. Tu peux modifier sa couleur.';
        status.textContent = saving ? 'Enregistrement…' : hint;
    }

    function updateColorControls() {
        const invalid = !hexColor();
        hex.setAttribute('aria-invalid', String(invalid));
        save.disabled = saving || draft.length < 3 || invalid;
    }

    picker.oninput = () => {
        hex.value = picker.value.toUpperCase();
        updateColorControls();
        drawPreview();
    };
    hex.oninput = () => {
        const color = hexColor();
        if (color) picker.value = color;
        updateColorControls();
        drawPreview();
        status.textContent = color
            ? 'Couleur mise à jour dans l’aperçu.'
            : 'Saisis six chiffres ou lettres de A à F, par exemple #A9D5C2.';
    };

    function stop(message) {
        draft = null;
        derivedGeometry = null;
        previous = null;
        handles.clearLayers();
        preview.clearLayers();
        map.getContainer().classList.remove('gw-contour-editing');
        chooser.inert = false;
        colors.hidden = true;
        edit.disabled = selectedIndex < 0;
        for (const button of [undo, restart, save, cancel]) button.hidden = true;
        status.textContent = message;
    }

    edit.onclick = () => {
        const { place, item, key } = places[selectedIndex];
        previous = published.get(key) ?? null;
        draft = previous?.points.map(point => [...point]) ?? [];
        const union = regionContourFromZones(world, published.values(), place);
        derivedGeometry = union?.map(polygon => polygon.map(ring => ring.map(unproject))) ?? null;
        colors.hidden = false;
        picker.value = previous?.color ?? contourTypes[place.category].color;
        hex.value = picker.value.toUpperCase();
        layers.show(place.category);
        const boundsPoints = derivedGeometry?.flat(2) ?? draft.map(unproject);
        if (boundsPoints.length) map.fitBounds(L.latLngBounds(boundsPoints), { maxZoom: derivedGeometry === null ? 4 : 1, padding: [45, 45] });
        else map.setView(unproject([item.x, item.y]), 4);
        map.getContainer().classList.add('gw-contour-editing');
        chooser.inert = edit.disabled = true;
        save.hidden = cancel.hidden = false;
        undo.hidden = restart.hidden = derivedGeometry !== null;
        render();
    };
    map.on('click', event => {
        if (!draft || saving || derivedGeometry !== null) return;
        const point = project(event.latlng);
        if (!inBounds(point)) return;
        draft.push(point);
        render();
    });
    undo.onclick = () => { draft.pop(); render(); };
    restart.onclick = () => { draft = []; render(); };
    cancel.onclick = () => stop('Tracé abandonné.');
    save.onclick = async () => {
        saving = true;
        render();
        try {
            const { place } = places[selectedIndex];
            const payload = {
                ...place, points: draft, previous: previous?.points ?? null,
                color: hexColor(), previousColor: previous?.color ?? null
            };
            const result = await request('/api/contours', 'POST', payload);
            published.clear();
            result.contours.forEach(contour => published.set(contourKey(contour), contour));
            layers.setContours(result.contours);
            stop('Contour enregistré sur la carte.');
        } catch (error) {
            render();
            status.textContent = error.message;
        } finally {
            saving = false;
            if (draft) {
                const message = status.textContent;
                render();
                status.textContent = message;
            }
        }
    };
    return { get active() { return draft !== null; } };
}
