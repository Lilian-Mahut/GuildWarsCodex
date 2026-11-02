// Toute la logique "à quel zoom ?" est ici et nulle part ailleurs

export function getIconScale(zoom, world) {
    return world.iconScales?.[zoom] ?? 1;
}

export function isVisible(zoom, rule, item) {
    const min = item.minZoom ?? rule.minZoom ?? 0;
    const max = rule.maxZoom ?? Infinity;
    return zoom >= min && zoom <= max;
}

// Ce lieu peut-il un jour afficher son nom ?
export function hasLabel(rule, item) {
    return item.label !== false && (item.labelMinZoom ?? rule.labelMinZoom) !== undefined;
}

export function isLabelVisible(zoom, rule, item) {
    return hasLabel(rule, item) && zoom >= (item.labelMinZoom ?? rule.labelMinZoom);
}
