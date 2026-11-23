
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
            const label = L.DomUtil.create('span', 'gw-lang__label', button);
            const currentName = L.DomUtil.create('span', 'gw-lang__name', label);
            const currentDistrict = L.DomUtil.create('span', 'gw-lang__district', label);
            currentDistrict.textContent = '- Active District';
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

                currentName.textContent = current?.label ?? 'English';
                button.setAttribute('aria-label', t('language'));

                menu.querySelectorAll('button').forEach(option => {
                    const active = option.dataset.lang === getCurrentLanguage();
                    option.classList.toggle('is-active', active);
                    option.querySelector('.gw-lang__district').textContent = active ? '- Active District' : '- District 1';
                    if (active) menu.prepend(option);
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
                option.dataset.label = lang.label;
                const optionName = L.DomUtil.create('span', 'gw-lang__name', option);
                optionName.textContent = lang.label;
                L.DomUtil.create('span', 'gw-lang__district', option);

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

            this._onOutsideClick = event => {
                if (!container.contains(event.target)) close();
            };
            document.addEventListener('click', this._onOutsideClick, true);

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            onLanguageChange(refresh);
            refresh();

            return container;
        },

        onRemove() {
            document.removeEventListener('click', this._onOutsideClick, true);
        }
    });

    new LanguageControl().addTo(map);
}
