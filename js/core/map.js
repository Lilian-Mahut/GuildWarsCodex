import { OffsetTileLayer } from './offset-tile-layer.js';

// Création de la carte Leaflet : une couche par carte, positionnée par son offset
export function initMap(world) {
    const maxZoom = world.maxZoom;
    const tileSize = 256;

    const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: 0,
    maxZoom: maxZoom,
    zoomControl: false
});

    // Taille de chaque carte au zoom max, et étendue totale du monde (union des cartes)
    const factor = Math.pow(2, maxZoom) * tileSize;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    world.maps.forEach((m) => {
        const [cols, rows] = m.tilesAtZoom0;
        m.size = [cols * factor, rows * factor];
        m.offset = m.offset ?? [0, 0];

        minX = Math.min(minX, m.offset[0]);
        minY = Math.min(minY, m.offset[1]);
        maxX = Math.max(maxX, m.offset[0] + m.size[0]);
        maxY = Math.max(maxY, m.offset[1] + m.size[1]);
    });

    const worldBounds = L.latLngBounds(
        map.unproject([minX, maxY], maxZoom),
        map.unproject([maxX, minY], maxZoom)
    );

    map.setMaxBounds(worldBounds);
    map.fitBounds(worldBounds);

    world.maps.forEach((m, index) => {
        m.layer = new OffsetTileLayer({
            url: m.tiles,
            mapSize: m.size,
            offset: m.offset,
            nativeMaxZoom: m.nativeMaxZoom,
            clip: m.clip,
            blend: m.blend ?? world.blend ?? 'normal',
            minZoom: 0,
            maxZoom: maxZoom,
            tileSize: tileSize,
            zIndex: index + 1,
            attribution: index === 0 ? '© ArenaNet - Guild Wars' : ''
        }).addTo(map);
    });

    // Repérage : un clic affiche les coordonnées du MONDE à copier dans les JSON
    map.on('click', (e) => {
        const p = map.project(e.latlng, maxZoom);
        console.log(`{ "x": ${Math.round(p.x)}, "y": ${Math.round(p.y)} }`);
    });

    return map;
}