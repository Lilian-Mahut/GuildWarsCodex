// Outil d'alignement : index.html?align=1
// Flèches = déplacer la carte sélectionnée ; le résultat se copie dans world.json

export function enableAlignTool(map, world) {
    const maxZoom = world.maxZoom;
    let selected = world.maps[0];

    // Style de l'outil, chargé uniquement ici
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/align.css';
    document.head.appendChild(link);

    map.setMaxBounds(null);   // libère la navigation pendant le réglage
    map.keyboard.disable();   // les flèches servent à déplacer la carte sélectionnée

    const Panel = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
            const box = L.DomUtil.create('div', 'gw-align');
            box.innerHTML = `
                <label>Carte
                    <select class="gw-align__map">
                        ${world.maps.map((m) => `<option value="${m.id}">${m.id}</option>`).join('')}
                    </select>
                </label>
                <label>Opacité
                    <input class="gw-align__opacity" type="range" min="0.1" max="1" step="0.05" value="1">
                </label>
                <div class="gw-align__offset"></div>
                <button class="gw-align__copy" type="button">Copier les décalages</button>
                <small>Flèches : déplacer (1 px d'écran, Maj = 10 px). Zoome pour affiner.
                Clic sur la carte : coordonnées dans la console.</small>`;
            L.DomEvent.disableClickPropagation(box);
            L.DomEvent.disableScrollPropagation(box);
            return box;
        }
    });

    const box = new Panel().addTo(map).getContainer();
    const mapSelect = box.querySelector('.gw-align__map');
    const opacity = box.querySelector('.gw-align__opacity');
    const offsetEl = box.querySelector('.gw-align__offset');
    const copyBtn = box.querySelector('.gw-align__copy');

    const showOffset = () => {
        offsetEl.textContent = `offset : [${selected.offset[0]}, ${selected.offset[1]}]`;
    };

    mapSelect.addEventListener('change', () => {
        selected = world.maps.find((m) => m.id === mapSelect.value);
        opacity.value = selected.layer.options.opacity;
        showOffset();
    });

    opacity.addEventListener('input', () => selected.layer.setOpacity(Number(opacity.value)));

    // Déplacement : la valeur change tout de suite, la carte se redessine après une courte pause
    let timer = null;
    function move(dx, dy) {
        const m = selected;
        m.offset = [m.offset[0] + dx, m.offset[1] + dy];
        showOffset();
        clearTimeout(timer);
        timer = setTimeout(() => m.layer.setOffset(m.offset), 150);
    }

    const DIRECTIONS = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
    };

    document.addEventListener('keydown', (e) => {
        const dir = DIRECTIONS[e.key];
        if (!dir) return;
        e.preventDefault();

        // 1 px d'écran, converti en pixels au zoom max (plus on zoome, plus c'est fin)
        const step = (e.shiftKey ? 10 : 1) * Math.pow(2, maxZoom - map.getZoom());
        move(Math.round(dir[0] * step), Math.round(dir[1] * step));
    });

    copyBtn.addEventListener('click', async () => {
        const json = JSON.stringify(world.maps.map((m) => ({ id: m.id, offset: m.offset })), null, 2);
        console.log(json);
        try {
            await navigator.clipboard.writeText(json);
            copyBtn.textContent = 'Copié !';
        } catch {
            copyBtn.textContent = 'Voir la console';
        }
        setTimeout(() => { copyBtn.textContent = 'Copier les décalages'; }, 1500);
    });

    // Coordonnées d'un clic dans le repère de la carte sélectionnée (utile pour "clip")
    map.on('click', (e) => {
        const p = map.project(e.latlng, maxZoom);
        console.log(`${selected.id} (repère de la carte) : [${Math.round(p.x - selected.offset[0])}, ${Math.round(p.y - selected.offset[1])}]`);
    });

    showOffset();
}