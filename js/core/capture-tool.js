// Outil de saisie : index.html?edit=1
// Un clic sur la carte copie "x<TAB>y" dans le presse-papiers : colle-le dans le tableur,
// les deux nombres se répartissent dans les colonnes x et y.

export function enableCaptureTool(map, world) {
    const maxZoom = world.maxZoom;

    map.getContainer().style.cursor = 'crosshair';

    // Petit message en bas de l'écran
    const toast = document.createElement('div');
    Object.assign(toast.style, {
        position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
        padding: '8px 14px', borderRadius: '4px', zIndex: 10000,
        background: 'rgba(20, 20, 20, 0.9)', color: '#f0f0f0',
        font: '14px/1.4 "Segoe UI", Arial, sans-serif', pointerEvents: 'none'
    });
    toast.textContent = 'Mode saisie : clique sur la carte pour copier x et y';
    document.body.appendChild(toast);

    let mark = null;   // repère du dernier clic

    map.on('click', async (e) => {
        const p = map.project(e.latlng, maxZoom);
        const x = Math.round(p.x);
        const y = Math.round(p.y);

        if (mark) mark.remove();
        mark = L.circleMarker(e.latlng, { radius: 5, color: '#ff3b3b', weight: 2, interactive: false }).addTo(map);

        try {
            await navigator.clipboard.writeText(`${x}\t${y}`);
            toast.textContent = `x ${x}   y ${y}   (copié)`;
        } catch {
            toast.textContent = `x ${x}   y ${y}   (copie impossible : recopie à la main)`;
        }
    });
}
