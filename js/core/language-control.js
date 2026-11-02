
import {
    getLanguages,
    getCurrentLanguage,
    setLanguage,
    onLanguageChange,
    t
} from './i18n.js';

export function addLanguageControl(map) {
    const LanguageControl = L.Control.extend({
        options: { position: 'topright' },

        onAdd() {
            if (!document.querySelector('link[href="css/ui.css"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'css/ui.css';
                document.head.appendChild(link);
            }

            const container = L.DomUtil.create('div', 'gw-lang');
            const button = L.DomUtil.create('button', 'gw-lang__button', container);
            const menu = L.DomUtil.create('div', 'gw-lang__menu', container);

            button.type = 'button';
            button.setAttribute('aria-haspopup', 'true');
            button.setAttribute('aria-expanded', 'false');
            menu.hidden = true;

            const close = () => {
                menu.hidden = true;
                button.setAttribute('aria-expanded', 'false');
            };

            const refresh = () => {
                const current = getLanguages().find(
                    lang => lang.code === getCurrentLanguage()
                );

                button.textContent = `${current?.label ?? 'English'} ▾`;
                button.setAttribute('aria-label', t('language'));

                menu.querySelectorAll('button').forEach(option => {
                    option.classList.toggle(
                        'is-active',
                        option.dataset.lang === getCurrentLanguage()
                    );
                });
            };

            button.addEventListener('click', () => {
                menu.hidden = !menu.hidden;
                button.setAttribute(
                    'aria-expanded',
                    String(!menu.hidden)
                );
            });

            getLanguages().forEach(lang => {
                const option = L.DomUtil.create(
                    'button',
                    'gw-lang__option',
                    menu
                );

                option.type = 'button';
                option.dataset.lang = lang.code;
                option.textContent = lang.label;

                option.addEventListener('click', async () => {
                    close();
                    await setLanguage(lang.code);
                });
            });

            container.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    close();
                    button.focus();
                }
            });

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            onLanguageChange(refresh);
            refresh();

            return container;
        }
    });

    new LanguageControl().addTo(map);
}
