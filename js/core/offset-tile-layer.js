// Couche de tuiles dont la carte est décalée dans le monde.
// Chaque tuile du monde est recomposée à partir des tuiles de la carte (jusqu'à 4),
// ce qui permet n'importe quel décalage en pixels, à tous les zooms.

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(url));
        img.src = url;
    });
}

export const OffsetTileLayer = L.GridLayer.extend({
    options: {
        url: '',              // 'images/tyrie/{z}/{x}/{y}.jpg'
        mapSize: [0, 0],      // taille de la carte en px au zoom maximum
        offset: [0, 0],       // position dans le monde, en px au zoom maximum
        nativeMaxZoom: null,  // dernier zoom dont les tuiles existent (agrandit au-delà)
        clip: null,           // polygone facultatif [[x, y], ...] en px de la carte, au zoom max
        blend: 'normal'       // mode de fusion CSS ('lighten' = le noir devient transparent)
    },

    onAdd(map) {
        this._updateBounds(map);
        L.GridLayer.prototype.onAdd.call(this, map);
        this.getContainer().style.mixBlendMode = this.options.blend;
    },

    // Utilisé par l'outil d'alignement
    setOffset(offset) {
        this.options.offset = offset;
        this._updateBounds(this._map);
        this.redraw();
    },

    // Ne demande des tuiles que dans la zone couverte par cette carte
    _updateBounds(map) {
        const { offset, mapSize, maxZoom } = this.options;
        this.options.bounds = L.latLngBounds(
            map.unproject([offset[0], offset[1] + mapSize[1]], maxZoom),
            map.unproject([offset[0] + mapSize[0], offset[1]], maxZoom)
        );
    },

    createTile(coords, done) {
        const size = this.getTileSize().x;
        const { url, mapSize, offset, clip, maxZoom } = this.options;
        const nativeMax = Math.min(this.options.nativeMaxZoom ?? maxZoom, maxZoom);

        const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');

        const z = coords.z;
        const toMax = Math.pow(2, maxZoom - z);          // px au zoom max pour 1 px au zoom courant
        const lx = coords.x * size - offset[0] / toMax;  // coin de la tuile, dans le repère de la carte
        const ly = coords.y * size - offset[1] / toMax;

        const fz = Math.min(z, nativeMax);               // zoom dont on lit réellement les tuiles
        const up = Math.pow(2, z - fz);                  // agrandissement si ce zoom n'existe pas encore
        const srcToMax = Math.pow(2, maxZoom - fz);
        const maxTx = Math.ceil(mapSize[0] / srcToMax / size) - 1;
        const maxTy = Math.ceil(mapSize[1] / srcToMax / size) - 1;
        const span = size / up;

        const tx0 = Math.max(0, Math.floor(lx / up / size));
        const tx1 = Math.min(maxTx, Math.floor((lx / up + span - 1e-6) / size));
        const ty0 = Math.max(0, Math.floor(ly / up / size));
        const ty1 = Math.min(maxTy, Math.floor((ly / up + span - 1e-6) / size));

        const jobs = [];
        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                const src = L.Util.template(url, { z: fz, x: tx, y: ty });
                jobs.push(loadImage(src).then((img) => ({ img, tx, ty })).catch(() => null));
            }
        }

        // Toujours asynchrone : Leaflet exige que done() soit appelé après createTile()
        Promise.all(jobs).then((tiles) => {
            ctx.save();

            if (clip) {
                ctx.beginPath();
                clip.forEach(([px, py], i) => {
                    const cx = px / toMax - lx;
                    const cy = py / toMax - ly;
                    if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
                });
                ctx.closePath();
                ctx.clip();
            }

            tiles.forEach((t) => {
                if (!t) return;   // tuile absente : on laisse transparent
                ctx.drawImage(t.img, t.tx * size * up - lx, t.ty * size * up - ly, size * up, size * up);
            });

            ctx.restore();
            done(null, canvas);
        });

        return canvas;
    }
});