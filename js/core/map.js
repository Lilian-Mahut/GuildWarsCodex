// Carte mondiale : les coordonnées sont les pixels de l'image au zoom maximal.
export function initMap(world) {
    const { width, height, minZoom = 0, maxZoom, tileSize, tiles } = world;
    const map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom,
        maxZoom,
        zoomControl: false
    });

    const worldBounds = L.latLngBounds(
        map.unproject([0, height], maxZoom),
        map.unproject([width, 0], maxZoom)
    );

    L.tileLayer(tiles, {
        tileSize,
        minZoom,
        maxZoom,
        maxNativeZoom: maxZoom,
        bounds: worldBounds,
        noWrap: true,
        errorTileUrl: new URL('../../blank.png', new URL(tiles, document.baseURI)).href,
        attribution: '© ArenaNet - Guild Wars'
    }).on('tileloadstart', ({ tile, coords }) => {
        // Les tuiles de bord libvips sont complétées à 256 px.
        // Masque leur partie située hors du canevas Photoshop.
        const scale = Math.pow(2, maxZoom - coords.z);
        // Exclut les pixels mélangés au blanc lors de la réduction des bords.
        // Une marge d'un demi-pixel évite le liseré dû à l'interpolation du navigateur.
        const visibleWidth = Math.max(0, Math.min(tileSize, Math.floor(width / scale) - coords.x * tileSize - 0.5));
        const visibleHeight = Math.max(0, Math.min(tileSize, Math.floor(height / scale) - coords.y * tileSize - 0.5));
        tile.style.clipPath = `inset(0 ${tileSize - visibleWidth}px ${tileSize - visibleHeight}px 0)`;
    }).addTo(map);

    map.setMaxBounds(worldBounds);
    map.fitBounds(worldBounds);

    map.on('click', (e) => {
        const p = map.project(e.latlng, maxZoom);
        console.log(`{ "x": ${Math.round(p.x)}, "y": ${Math.round(p.y)} }`);
    });

    return map;
}
