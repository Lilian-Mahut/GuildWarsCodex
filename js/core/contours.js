import '../../vendor/polygon-clipping/polygon-clipping.js';
import { fetchJson } from './http.js';
import { onLanguageChange, t } from './i18n.js';

export const contourTypes = {
    region: { zoom: 1, color: '#e8bb72', label: 'contours.regions' },
    zone: { zoom: 4, color: '#a9d5c2', label: 'contours.zones' },
    mission: { zoom: 4, color: '#d6a2ed', label: 'contours.missions', pane: 'gw-mission-contours' }
};

export const contourKey = ({ realm, category, id }) => JSON.stringify([realm, category, id]);
export const loadContours = () => fetchJson('data/contours.json');

export function regionContourFromZones(world, contours, place) {
    if (place.category !== 'region') return null;
    const realm = world.realms.find(item => item.id === place.realm);
    const zoneIds = realm?.regionContourZones?.[place.id];
    if (!zoneIds) return null;

    const rings = [];
    for (const zone of contours) {
        if (zone.realm === place.realm && zone.category === 'zone' && zoneIds.includes(zone.id)) {
            rings.push([zone.points]);
        }
    }
    return rings.length ? globalThis.polygonClipping.union(...rings) : [];
}

export function addContourLayers(map, world, contours, { control, revealOnHover = false } = {}) {
    const pane = map.createPane('gw-contours');
    pane.style.zIndex = '390';
    map.createPane('gw-mission-contours').style.zIndex = '391';
    const layers = {};
    control ??= L.control.layers({}, {}, { position: 'topright' }).addTo(map);
    const active = {};

    for (const [category, style] of Object.entries(contourTypes)) {
        active[category] = L.layerGroup();
        layers[category] = L.layerGroup();
        control.addOverlay(active[category], t(style.label));
        if (revealOnHover && category !== 'mission') active[category].addTo(map);
    }

    function updateZoom() {
        for (const [category, style] of Object.entries(contourTypes)) {
            const group = active[category];
            const layer = layers[category];
            if (map.getZoom() === style.zoom) group.addLayer(layer);
            else group.removeLayer(layer);
        }
    }

    function setContours(items) {
        Object.values(layers).forEach(layer => layer.clearLayers());
        for (const contour of items) {
            const style = contourTypes[contour.category];
            if (!style) continue;
            const resting = { weight: 1.5, opacity: revealOnHover ? 0 : 1, fillOpacity: revealOnHover ? 0 : 0.10 };
            const highlighted = { weight: 3, opacity: 1, fillOpacity: 0.20 };
            const unproject = point => map.unproject(point, world.maxZoom);
            const regionGeometry = regionContourFromZones(world, items, contour);
            const geometry = regionGeometry === null
                ? contour.points.map(unproject)
                : regionGeometry.map(polygon => polygon.map(ring => ring.map(unproject)));
            if (!geometry.length) continue;
            const polygon = L.polygon(geometry, {
                pane: style.pane ?? 'gw-contours', color: contour.color ?? style.color, ...resting
            });
            polygon.on('mouseover', () => polygon.setStyle(highlighted));
            polygon.on('mouseout remove', () => polygon.setStyle(resting));
            if (revealOnHover) polygon.on('click', () => polygon.setStyle(highlighted));
            polygon.addTo(layers[contour.category]);
        }
    }

    onLanguageChange(() => {
        for (const [category, style] of Object.entries(contourTypes)) {
            control.removeLayer(active[category]);
            control.addOverlay(active[category], t(style.label));
        }
    });
    map.on('zoomend', updateZoom);
    setContours(contours);
    updateZoom();
    return {
        setContours,
        show(category) { active[category].addTo(map); }
    };
}
