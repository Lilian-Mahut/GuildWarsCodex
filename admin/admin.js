import { loadWorld } from '../js/core/loader.js';
import { initMap } from '../js/core/map.js';

const $ = (id) => document.getElementById(id);
const form = $('editor');
let rows = [], realms = {}, selected = -1, picking = false, dirty = false, map, world, pinLayer;
let positionHistory = []; const NEAR_DISTANCE = 12;
const keys = ['realm','category','id','name_en','x','y','name_fr','name_es','name_de','minZoom','labelMinZoom','label'];
const notify = (message, error=false) => { $('notice').textContent=message; $('notice').classList.toggle('error',error); };
function options(select, values, placeholder = '') {
    const current = select.value;

    select.replaceChildren();

    if (placeholder) {
        select.add(new Option(placeholder, ''));
    }

    values.forEach(value => {
        select.add(new Option(value, value));
    });

    if ([...select.options].some(option => option.value === current)) {
        select.value = current;
    } else if (placeholder) {
        select.value = '';
    }
}

function updateCategories() {
    const realm = form.elements.realm.value;

    options(
        form.elements.category,
        realms[realm] || [],
        '— Choisir une catégorie —'
    );
}
function refreshFilters(){
    options($('realmFilter'),Object.keys(realms),'Tous les royaumes');
    const categories = $('realmFilter').value ? realms[$('realmFilter').value] : [...new Set(Object.values(realms).flat())].sort();
    options($('categoryFilter'),categories||[],'Toutes les catégories');
}
function isIncomplete(r, kind) {
    if (kind === 'missing-coords') return r.category !== '_realm' && !validPoint(r);
    if (kind === 'missing-translations') return ['name_fr','name_es','name_de'].some(k=>!String(r[k]||'').trim());
    if (kind === 'missing-id') return r.category !== '_realm' && !String(r.id||'').trim();
    if (kind === 'nearby') return validPoint(r) && rows.some(other=>other!==r && validPoint(other) && Math.hypot(Number(r.x)-Number(other.x),Number(r.y)-Number(other.y)) <= NEAR_DISTANCE);
    return true;
}
function renderQuality() {
    const total = rows.filter(r=>r.category!=='_realm');
    $('qualityStats').textContent = `${total.filter(r=>isIncomplete(r,'missing-coords')).length} sans coordonnées · ${total.filter(r=>isIncomplete(r,'missing-translations')).length} traductions à compléter · ${total.filter(r=>isIncomplete(r,'missing-id')).length} ID à générer · ${total.filter(r=>isIncomplete(r,'nearby')).length} markers proches (≤ ${NEAR_DISTANCE}px)`;
}
function renderPreview() {
    const r=rows[selected]; const box=$('previewCard'); box.replaceChildren();
    if(!r) {box.textContent='Sélectionne un lieu.';return;}
    const card=document.createElement('div');card.className='preview-card';
    const title=document.createElement('strong');title.textContent=r.name_en||'(Nom à renseigner)';card.append(title);
    const meta=document.createElement('div');meta.className='preview-meta';meta.textContent=`${r.realm} / ${r.category} · ${validPoint(r)?`X ${r.x} · Y ${r.y}`:'Position manquante'}`;card.append(meta);
    for(const [key,lang] of [['name_fr','FR'],['name_es','ES'],['name_de','DE']]) {if(r[key]){const line=document.createElement('div');line.textContent=`${lang} : ${r[key]}`;card.append(line);}}
    const zoom=document.createElement('div');zoom.className='preview-meta';zoom.textContent=`Marker dès zoom ${r.minZoom||'par défaut'} · Label dès zoom ${r.labelMinZoom||'par défaut'}${r.label==='false'?' · Label masqué':''}`;card.append(zoom);
    const missing=['name_fr','name_es','name_de'].filter(k=>!r[k]);if(missing.length){const warn=document.createElement('div');warn.className='preview-flag';warn.textContent=`Traductions à compléter : ${missing.map(k=>k.slice(5).toUpperCase()).join(', ')}`;card.append(warn);}
    box.append(card);
}

function filtered() {
    const q = $('search').value.trim().toLowerCase();

    const compare = (a, b) =>
        String(a || '').localeCompare(
            String(b || ''),
            'fr',
            { sensitivity: 'base', numeric: true }
        );

    return rows
        .map((r, i) => ({ r, i }))
        .filter(({ r }) =>
            (!$('realmFilter').value ||
                r.realm === $('realmFilter').value) &&

            (!$('categoryFilter').value ||
                r.category === $('categoryFilter').value) &&

            (!q || [
                r.name_en,
                r.id,
                r.name_fr,
                r.name_es,
                r.name_de
            ].some(v =>
                String(v || '').toLowerCase().includes(q)
            )) &&

            isIncomplete(r, $('qualityFilter').value)
        )
        .sort((a, b) =>
            compare(a.r.realm, b.r.realm) ||
            compare(a.r.category, b.r.category) ||
            compare(a.r.name_en, b.r.name_en) ||
            a.i - b.i
        );
}

function validPoint(r){return r.category!=='_realm' && r.x!=='' && r.y!=='' && Number.isFinite(Number(r.x))&&Number.isFinite(Number(r.y));}
function renderPins(){
    pinLayer.clearLayers();
    const visible=filtered();
    visible.forEach(({r,i})=>{
        if(!validPoint(r))return;
        const icon=L.divIcon({className:'',html:`<div class="admin-point ${i===selected?'selected':''}"></div>`,iconSize:[20,20],iconAnchor:[10,10]});
        L.marker(map.unproject([Number(r.x),Number(r.y)],world.maxZoom),{icon,title:r.name_en||'Lieu',draggable:i===selected})
          .on('click',e=>{L.DomEvent.stopPropagation(e);select(i);})
          .on('dragstart',()=>{positionHistory.push({i,x:r.x,y:r.y});})
          .on('dragend',e=>{const point=map.project(e.target.getLatLng(),world.maxZoom);setPosition(i,Math.round(point.x),Math.round(point.y),false);})
          .addTo(pinLayer);
    });
}

function renderList() {
    const list = $('list');
    list.replaceChildren();

    filtered().forEach(({ r, i }) => {
        const b = document.createElement('button');

        b.type = 'button';
        b.className = 'place' + (selected === i ? ' active' : '');

        b.textContent =
            `${r.realm} / ${r.category} / ${r.name_en || '(sans nom)'}` +
            (validPoint(r) ? '' : ' ⚠ coordonnées');

        b.onclick = () => select(i);

        list.append(b);
    });

    renderPins();
    renderQuality();
    renderPreview();
}

function select(i, center=true){
    selected=i;picking=false;document.body.classList.remove('gw-picking');
    if($('pick')) $('pick').textContent='Placer par clic';
    const r=rows[i];
    if(!r)return;
    options(
    form.elements.realm,
    Object.keys(realms),
    '— Choisir un royaume —'
);

form.elements.realm.value = r.realm || '';
    updateCategories();
    keys.forEach(k=>{if(form.elements[k])form.elements[k].value=r[k]??'';});
    renderList();
    if(center && map && world && validPoint(r)) {
        const target=map.unproject([Number(r.x),Number(r.y)],world.maxZoom);
        map.panTo(target,{animate:true,duration:0.35});
    }
}
function setPosition(i,x,y,remember=true){
    if(i<0||!rows[i])return;
    if(remember)positionHistory.push({i,x:rows[i].x,y:rows[i].y});
    rows[i].x=String(x);rows[i].y=String(y);
    if(i===selected){form.elements.x.value=x;form.elements.y.value=y;}
    markDirty();renderList();
}
function markDirty(){dirty=true;notify('Modifications non enregistrées dans SQLite.');}
function applyForm() {
    if (selected < 0) return false;

    const required = {
        realm: 'Royaume',
        category: 'Catégorie',
        name_en: 'Nom anglais',
        x: 'Coordonnée X',
        y: 'Coordonnée Y',
        name_fr: 'Nom français',
        name_es: 'Nom espagnol',
        name_de: 'Nom allemand',
        minZoom: 'minZoom',
        labelMinZoom: 'labelMinZoom'
    };

    const missing = Object.entries(required)
        .filter(([key]) => !String(form.elements[key].value).trim())
        .map(([, label]) => label);

    if (missing.length) {
        notify(
            `Champs obligatoires manquants : ${missing.join(', ')}`,
            true
        );

        form.reportValidity();
        return false;
    }

    if (!form.checkValidity()) {
        form.reportValidity();
        return false;
    }

    const r = {};

    keys.forEach(key => {
        r[key] = form.elements[key].value.trim();
    });

    if (!realms[r.realm]?.includes(r.category)) {
        notify('Catégorie inconnue pour ce royaume.', true);
        return false;
    }

    if (Number(r.labelMinZoom) < Number(r.minZoom)) {
        notify(
            'labelMinZoom ne peut pas être inférieur à minZoom.',
            true
        );
        return false;
    }

    rows[selected] = r;

    markDirty();
    renderList();

    return true;
}
async function request(path,method='GET',data){
    const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,cache:'no-store'});
    const result=await response.json();
    if(!response.ok)throw new Error((result.errors||[]).join('\n')||result.error||result.output||`Erreur HTTP ${response.status}`);
    return result;
}
async function init(){
    try{
        const [data,loadedWorld]=await Promise.all([request('/api/places'),loadWorld()]);
        rows=data.rows;realms=data.realms;world=loadedWorld;
        map = initMap(world);

        // Supprime les boutons de zoom uniquement s'ils existent.
        map.zoomControl?.remove();

        pinLayer = L.layerGroup().addTo(map);
        options(form.elements.realm,Object.keys(realms));updateCategories();refreshFilters();renderList();
        if(rows.length)select(0,false);
        map.on('click',e=>{
            if(!picking||selected<0)return;
            const p=map.project(e.latlng,world.maxZoom);
            const x=Math.round(p.x),y=Math.round(p.y);
            // Renseigner d'abord les champs obligatoires, puis valider le formulaire.
            // Sinon reportValidity() bloque un nouveau lieu dont x/y sont encore vides.
            form.elements.x.value=String(x);
            form.elements.y.value=String(y);
            // On met les coordonnées à jour sans exiger
// que tous les autres champs soient déjà remplis.
setPosition(selected, x, y);

picking = false;
$('pick').textContent = 'Placer par clic';

notify(
    'Position définie. Complète les champs obligatoires avant d’enregistrer.'
);
        });
        notify(`${rows.length} lignes chargées. Sélectionne un lieu ou crée-en un.`);
    }catch(e){notify(e.message,true);console.error(e);}
}
$('search').oninput=renderList;
$('qualityFilter').onchange=renderList;
$('realmFilter').onchange=()=>{refreshFilters();renderList();};
$('categoryFilter').onchange=renderList;
form.elements.realm.onchange=updateCategories;
form.onsubmit=e=>{e.preventDefault();applyForm();};
$('new').onclick = () => {
    // Rendre le nouveau lieu visible, même si des filtres sont actifs.
    $('search').value = '';
    $('realmFilter').value = '';
    refreshFilters();
    $('categoryFilter').value = '';
    $('qualityFilter').value = 'all';

    const empty = Object.fromEntries(
        keys.map(key => [key, ''])
    );

    rows.push(empty);

    selected = rows.length - 1;
    positionHistory = [];
    picking = false;

    select(selected, false);

    // Aucun royaume ou catégorie présélectionné.
    form.elements.realm.value = '';
    updateCategories();
    form.elements.category.value = '';

    markDirty();

    notify('Nouveau lieu : complète les champs obligatoires.');

    form.elements.realm.focus();
};
$('delete').onclick=()=>{
    if(selected<0)return;
    if(!confirm(`Supprimer « ${rows[selected].name_en} » ?`))return;
    rows.splice(selected,1);selected=-1;markDirty();renderList();
    if(rows.length)select(0);
};
$('pick').onclick=()=>{
    if(selected<0)return;
    picking=!picking;
    document.body.classList.toggle('gw-picking', picking);
    $('pick').textContent=picking?'Annuler le placement':'Placer par clic';
    notify(picking?'Clique sur la carte pour définir les coordonnées.':'Placement annulé.');
};
$('undo').onclick=()=>{
    const last=positionHistory.pop();if(!last)return notify('Aucune position à annuler.');
    if(!rows[last.i])return notify('Le lieu a été supprimé.',true);
    setPosition(last.i,last.x,last.y,false);select(last.i);
};
document.addEventListener('keydown',e=>{
    if(selected<0||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if(!validPoint(rows[selected]))return;
    e.preventDefault();const step=e.shiftKey?10:1;
    const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;
    const dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
    setPosition(selected,Number(rows[selected].x)+dx,Number(rows[selected].y)+dy);
});
$('locate').onclick=()=>{
    const r=rows[selected];if(!r||!validPoint(r))return notify('Coordonnées manquantes.',true);
    map.setView(map.unproject([Number(r.x),Number(r.y)],world.maxZoom),Math.max(map.getZoom(),2));
};
$('publish').onclick = async () => {
    const button = $('publish');

    if (selected >= 0 && !applyForm()) return;

    // Vérifie les données de tous les lieux avant de sauvegarder.
    const requiredKeys = [
        'realm', 'category', 'name_en',
        'x', 'y',
        'name_fr', 'name_es', 'name_de',
        'minZoom', 'labelMinZoom'
    ];

    const invalidIndex = rows.findIndex(row =>
        row.category !== '_realm' &&
        requiredKeys.some(key =>
            !String(row[key] ?? '').trim()
        )
    );

    if (invalidIndex !== -1) {
        select(invalidIndex);

        notify(
            `Enregistrement interrompu : « ${
                rows[invalidIndex].name_en || 'Nouveau lieu'
            } » possède des champs obligatoires manquants.`,
            true
        );

        return;
    }

    button.disabled = true;
    $('build').disabled = true;
    button.textContent = 'Enregistrement en cours…';

    try {
        const saved = await request('/api/places', 'POST', {
            rows
        });

        dirty = false;

        const data = await request('/api/places');
        rows = data.rows;
        refreshFilters();
        renderList();
        if (selected >= 0) select(selected, false);
        $('log').textContent = `Sauvegarde SQLite : ${saved.backup}`;
        notify(`${saved.count} lignes enregistrées dans SQLite.`);
    } catch (error) {
        $('log').textContent = error.message;

        notify(
            `Enregistrement interrompu : ${error.message}`,
            true
        );

    } finally {
        button.disabled = false;
        $('build').disabled = false;
        button.textContent = 'Enregistrer';
    }
};
$('build').onclick = async () => {
    if (dirty) {
        notify('Enregistre les modifications avant de générer la carte.', true);
        return;
    }
    const button = $('build');
    const saveButton = $('publish');
    button.disabled = true;
    saveButton.disabled = true;
    try {
        const built = await request('/api/build', 'POST', {});
        $('log').textContent = built.output;
        notify('Carte locale générée. Recharge la carte pour voir les modifications.');
    } catch (error) {
        $('log').textContent = error.message;
        notify('La génération de la carte a échoué.', true);
    } finally {
        button.disabled = false;
        saveButton.disabled = false;
    }
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
init();
