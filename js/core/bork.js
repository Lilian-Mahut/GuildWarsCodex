// Variante du parler du Chef suédois, générée depuis les noms anglais.
// Les remplacements sont faits en un passage pour éviter les conversions en cascade.
const SOUNDS = {
    tion: 'shun',
    the: 'zee',
    th: 't',
    an: 'un',
    au: 'oo',
    ow: 'öv',
    oo: 'öö',
    a: 'ä',
    e: 'ë',
    i: 'ee',
    o: 'ö',
    u: 'ü',
    v: 'f',
    w: 'v'
};

export function toBork(text) {
    return text.replace(/[A-Za-z]+/g, word => {
        if (word.toLowerCase() === 'bork') return word;

        return word.replace(/tion|the|th|an|au|ow|oo|[aeiouvw]/gi, sound => {
            const replacement = SOUNDS[sound.toLowerCase()];
            if (sound === sound.toUpperCase()) return replacement.toUpperCase();
            if (sound[0] === sound[0].toUpperCase()) {
                return replacement[0].toUpperCase() + replacement.slice(1);
            }
            return replacement;
        });
    });
}
