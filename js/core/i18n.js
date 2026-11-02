// Gestion des langues : détection, chargement, traduction des textes et des noms de lieux
import { fetchJson, fetchJsonOptional } from './http.js';

const FALLBACK = 'en';
const STORAGE_KEY = 'lang';

let languages = [];
let realmIds = [];
let current = FALLBACK;
let ui = {};            // textes d'interface de la langue courante
let uiFallback = {};    // textes d'interface en anglais
let names = {};         // names[royaume][id] = nom traduit
let requestId = 0;      // évite qu'un chargement lent écrase un choix plus récent
const listeners = new Set();

// Ordre de priorité : URL (?lang=fr) > choix mémorisé > langues du navigateur > anglais
function detectLanguage() {
    const codes = languages.map((l) => l.code);

    const fromUrl = new URLSearchParams(location.search).get('lang');
    if (codes.includes(fromUrl)) return fromUrl;

    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (codes.includes(saved)) return saved;
    } catch { /* stockage indisponible : on continue */ }

    // "auto": false dans languages.json exclut une langue du choix automatique
    const auto = languages.filter((l) => l.auto !== false).map((l) => l.code);
    for (const tag of navigator.languages ?? [navigator.language]) {
        const base = String(tag).toLowerCase().split('-')[0];   // "fr-CA" -> "fr"
        if (auto.includes(base)) return base;
    }
    return FALLBACK;
}

async function loadLanguage(code) {
    const uiData = await fetchJsonOptional(`i18n/${code}/ui.json`);
    const nameData = {};

    // En anglais, le champ "name" des JSON fait foi : pas de fichier de noms
    if (code !== FALLBACK) {
        await Promise.all(realmIds.map(async (id) => {
            nameData[id] = await fetchJsonOptional(`i18n/${code}/names/${id}.json`);
        }));
    }
    return { ui: uiData, names: nameData };
}

function apply(code, data) {
    current = code;
    ui = data.ui;
    names = data.names;

    const lang = languages.find((l) => l.code === code);
    document.documentElement.lang = lang?.htmlLang ?? code;

    listeners.forEach((fn) => fn(code));
}

export async function initI18n(ids) {
    realmIds = ids;
    languages = await fetchJson('i18n/languages.json');
    uiFallback = await fetchJsonOptional(`i18n/${FALLBACK}/ui.json`);

    const code = detectLanguage();
    apply(code, code === FALLBACK ? { ui: uiFallback, names: {} } : await loadLanguage(code));
}

export async function setLanguage(code) {
    if (code === current || !languages.some((l) => l.code === code)) return;

    const id = ++requestId;
    const data = code === FALLBACK ? { ui: uiFallback, names: {} } : await loadLanguage(code);
    if (id !== requestId) return;   // un choix plus récent a pris le relais

    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignoré */ }
    apply(code, data);
}

// Texte d'interface : langue courante, sinon anglais, sinon la clé
export function t(key) {
    return ui[key] ?? uiFallback[key] ?? key;
}

// Nom d'un lieu : traduction par id, sinon le "name" du JSON (anglais)
export function getName(realmId, item) {
    return names[realmId]?.[item.id] ?? item.name;
}

export const getLanguages = () => languages;
export const getCurrentLanguage = () => current;

export function onLanguageChange(fn) {
    listeners.add(fn);
}
