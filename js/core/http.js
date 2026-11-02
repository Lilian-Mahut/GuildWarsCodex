// Chargement des fichiers JSON

// JSON obligatoire : erreur claire avec le nom du fichier
export async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Impossible de charger ${url} (${res.status})`);

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(`JSON invalide dans ${url} : ${err.message}`);
    }
}

// JSON facultatif (traductions) : absent, vide ou invalide -> {} sans bloquer la carte
export async function fetchJsonOptional(url) {
    try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 404) return {};
        if (!res.ok) throw new Error(`erreur ${res.status}`);

        const text = (await res.text()).trim();
        return text ? JSON.parse(text) : {};
    } catch (err) {
        console.error(`Fichier ignoré ${url} : ${err.message}`);
        return {};
    }
}
