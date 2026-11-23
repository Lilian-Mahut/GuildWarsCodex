// Toute la logique "à quel zoom ?" est ici et nulle part ailleurs

export function getIconScale(zoom, world) {
    return world.iconScales?.[zoom] ?? 1;
}

export function isVisible(zoom, rule, item) {
    if (zoom === 0 && !rule.overview) return false;
    if (zoom === 1 && !rule.visibleAtZoomOne) return false;
    const min = item.minZoom ?? rule.minZoom ?? 0;
    const max = rule.maxZoom ?? Infinity;
    return zoom >= min && zoom <= max;
}

// Ce lieu peut-il un jour afficher son nom ?
export function hasLabel(rule, item) {
    return item.label !== false && (item.labelMinZoom ?? rule.labelMinZoom) !== undefined;
}

export function isLabelVisible(zoom, rule, item) {
    if (zoom === 1 || rule.hiddenLabelZooms?.includes(zoom)) return false;
    return hasLabel(rule, item) && zoom >= (item.labelMinZoom ?? rule.labelMinZoom);
}
