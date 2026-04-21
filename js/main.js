// js/main.js

window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('ERROR GLOBAL:', msg, 'en línea:', lineNo);
    return false;
};

import { getPackPrice, generatePack } from './data/pack-prices.js';
import { fetchSetData, fetchAllSets } from './api.js';
import { openBooster } from './booster.js';
import { updateWallet, addCardToInventory, getInventoryData, sellCard, saveInventoryData, gradeCard } from './inventory.js';

const packContainer = document.getElementById('pack-container');
const openBtn = document.getElementById('open-button');
const setSelector = document.getElementById('set-selector');

const balanceDisplay = document.getElementById('balance');
const modalOverlay = document.getElementById('modal-overlay');
const zoomedCard = document.getElementById('zoomed-card');

let currentPackPrice = 5.00;
let currentSetData = null;
let currentPackProfit = 0;
let packHistory = []; // historial de los últimos sobres abiertos

// --- AUTO-REVEAL & SPACEBAR ---
let autoRevealActive = false;   // toggle del botón
let autoRevealTimeout = null;   // referencia al timeout actual para cancelarlo
let flipNextCard = null;        // función que expone renderPack al exterior

// Elementos del Álbum
const viewAlbumBtn = document.getElementById('view-album-btn');
const backToGameBtn = document.getElementById('back-to-game');
const albumScreen = document.getElementById('album-screen');
const albumGrid = document.getElementById('album-grid');
const collectionProgress = document.getElementById('collection-progress');
const viewValuableBtn = document.getElementById('view-valuable-btn'); // Botón Top 50

const orderSelector = document.getElementById('order-selector'); // Nuevo
const albumSearch = document.getElementById('album-search');
const globalSearchBtn = document.getElementById('global-search-btn');

globalSearchBtn.addEventListener('click', async () => {
    const term = albumSearch.value.trim();
    if (term.length < 3) {
        alert("Escribe al menos 3 letras para buscar en toda la base de datos.");
        return;
    }

    albumGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Buscando en todos los sets del mundo...</p>';

    try {
        // Llamada a la API buscando por nombre en todos los sets
        const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${term}"&orderBy=releaseDate`, {
            headers: { 'X-Api-Key': '87c51e43d0ad030821add2c09bc0768628d9747e94c04ce419eea3d2a4741532' }
        });
        const data = await response.json();
        renderGlobalResults(data.data);
    } catch (error) {
        console.error("Error en búsqueda global:", error);
    }
});

function renderGlobalResults(cards) {
    const data = getInventoryData();
    const inventory = data.owned_cards;
    const psaCards  = data.psa_cards || [];
    albumGrid.innerHTML = '';

    collectionProgress.innerText = `Resultados encontrados: ${cards.length}`;

    cards.forEach(card => {
        const isOwned = inventory[card.id];  // entrada normal (puede ser null)

        // Buscar todas las slabs PSA de esta carta y quedarnos con la de mejor nota
        const psaSlabs = psaCards.filter(s => s.cardId === card.id);
        const bestPSA  = psaSlabs.length
            ? psaSlabs.reduce((best, s) => s.grade > best.grade ? s : best)
            : null;

        const hasAny = isOwned || bestPSA;
        const slot = document.createElement('div');
        slot.className = `album-card-slot ${hasAny ? 'owned' : 'missing'}`;

        // ── Imagen (gris si no la tienes de ninguna forma) ──
        const imgDiv = document.createElement('div');
        imgDiv.className = 'album-card-img';
        imgDiv.style.backgroundImage = `url('${card.images.small}')`;
        if (!hasAny) imgDiv.style.filter = 'brightness(0.2) grayscale(1)';

        // Contador de copias normales (esquina inferior derecha)
        if (isOwned && isOwned.quantity > 0) {
            const countBadge = document.createElement('div');
            countBadge.className = 'card-count';
            countBadge.innerText = `x${isOwned.quantity}`;
            imgDiv.appendChild(countBadge);
        }

        // Etiqueta PSA (esquina superior derecha, solo si tiene alguna en PSA)
        if (bestPSA) {
            const psaBadge = document.createElement('div');
            const isGem = bestPSA.grade === 10;
            psaBadge.innerText = `PSA ${bestPSA.grade}`;
            psaBadge.style.cssText = `
                position: absolute;
                top: 4px;
                right: 4px;
                background: ${isGem
                    ? 'linear-gradient(45deg,#bf953f,#fcf6ba,#b38728)'
                    : '#d10000'};
                color: ${isGem ? '#000' : '#fff'};
                font-size: 9px;
                font-weight: bold;
                padding: 2px 5px;
                border-radius: 4px;
                box-shadow: 0 1px 4px rgba(0,0,0,0.6);
                z-index: 10;
                white-space: nowrap;
                letter-spacing: 0.5px;
            `;
            imgDiv.appendChild(psaBadge);
        }

        slot.appendChild(imgDiv);

        // ── Info inferior ──
        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'padding:5px; text-align:center;';
        infoDiv.innerHTML = `
            <div style="color:var(--gold);font-size:0.6rem;font-weight:bold;text-transform:uppercase;">
                ${card.set.name}
            </div>
            <div style="font-size:0.75rem;color:${hasAny ? '#fff' : '#888'};">
                ${card.name}
            </div>
            ${isOwned ? `
                <div style="color:var(--success);font-size:0.75rem;font-weight:bold;">
                    $${isOwned.lastPrice.toFixed(2)}
                </div>
            ` : ''}
            ${bestPSA && !isOwned ? `
                <div style="color:#d10000;font-size:0.7rem;font-weight:bold;">
                    solo en PSA
                </div>
            ` : ''}
        `;
        slot.appendChild(infoDiv);

        // Click: abre zoom solo si tiene copias normales en inventario
        if (isOwned && isOwned.quantity > 0) {
            slot.onclick = () => openZoom(card, isOwned.lastPrice, true);
        }

        albumGrid.appendChild(slot);
    });
}

const sfx = {
    flip:  new Audio('assets/sounds/flip.mp3'),
    hit:   new Audio('assets/sounds/hit.mp3'),
    rare:  new Audio('assets/sounds/rare_hit.mp3'),
    epic:  new Audio('assets/sounds/legendary_hit.mp3'),
    place: new Audio('assets/sounds/place.mp3'),

    // Desbloquea el contexto de audio con la primera interacción del usuario.
    // Los navegadores modernos bloquean audio hasta que hay un gesto humano.
    _unlocked: false,
    unlock() {
        if (this._unlocked) return;
        // Reproducimos todos los audios en volumen 0 para "despertar" el contexto
        Object.values(this).forEach(v => {
            if (v instanceof Audio) {
                const s = v.cloneNode();
                s.volume = 0;
                s.play().catch(() => {});
            }
        });
        this._unlocked = true;
    },

    play(sound) {
        if (this[sound]) {
            const s = this[sound].cloneNode();
            s.volume = 0.6;
            s.play().catch(e => console.warn("Audio bloqueado:", e));
        }
    }
};

// Desbloquear audio con el primer click en cualquier parte de la página
document.addEventListener('click', () => sfx.unlock(), { once: true });

// --- NAVEGACIÓN ---

viewAlbumBtn.addEventListener('click', () => {
    packContainer.style.display = 'none';
    albumScreen.style.display = 'block';
    renderAlbum(); 
});

backToGameBtn.addEventListener('click', () => {
    albumScreen.style.display = 'none';
    packContainer.style.display = 'flex';
});

if (viewValuableBtn) {
    viewValuableBtn.addEventListener('click', () => {
        renderTopValuableCards();
    });
}

async function initSet() {
    const setId = setSelector.value;
    if (!setId) return;

    // Bloqueamos AMBOS controles mientras carga para evitar condición de carrera
    openBtn.disabled = true;
    openBtn.innerHTML = `Cargando...`;
    setSelector.disabled = true;
    orderSelector.disabled = true;

    // Mostrar spinner en el tapete mientras carga
    packContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:16px;color:#aaa;">
            <div class="loader" style="width:36px;height:36px;border-width:4px;"></div>
            <div style="font-size:0.9rem;">Cargando colección...</div>
        </div>
    `;
    packContainer.style.display = 'flex';
    albumScreen.style.display = 'none';

    try {
        const response = await fetchSetData(setId);

        if (setSelector.value !== setId) {
            console.warn("initSet: set cambiado durante la carga, abortando.");
            packContainer.innerHTML = '<p class="placeholder-text">Selecciona una colección y pulsa el botón para empezar.</p>';
            return;
        }

        currentSetData = response.data || response;

        // Obtenemos todos los sets para calcular precio
        const allSetsRaw = await fetchAllSets();
        const allSets = Array.isArray(allSetsRaw) ? allSetsRaw : (allSetsRaw.data || []);
        const setDetails = allSets.find(s => s.id === setId);

        if (setDetails) {
            currentPackPrice = getPackPrice(setDetails);
        } else {
            const backupDetails = response.data || response;
            currentPackPrice = getPackPrice(backupDetails);
        }

        // Persistencia
        localStorage.setItem('pokesim_last_set', setId);

        openBtn.disabled = false;
        openBtn.innerText = `Abrir Sobre ($${currentPackPrice.toFixed(2)})`;

        const costDisplay = document.getElementById('current-pack-cost');
        if (costDisplay) costDisplay.innerText = `$${currentPackPrice.toFixed(2)}`;

        // Aplicar tema de color del header según la era del set
        applySetTheme(setDetails || {});

        // Limpiar el spinner y mostrar el tapete listo
        packContainer.innerHTML = '<p class="placeholder-text">¡Colección lista! Pulsa el botón para abrir un sobre 🎴</p>';

        // Actualizar botones multi con el precio correcto
        updateOpenButton();

        if (albumScreen.style.display === 'block') renderAlbum();
        refreshUI();

    } catch (error) {
        console.error("Error en initSet:", error);
        openBtn.innerText = "Error al cargar — reintenta";
        openBtn.disabled = false;
        packContainer.innerHTML = '<p class="placeholder-text">Error al cargar. Selecciona otra colección.</p>';
        showToast('❌ Error cargando la colección, reintenta', 'warning');
    } finally {
        setSelector.disabled = false;
        orderSelector.disabled = false;
    }

    refreshUI();
}

// ── Tema de color del header según la era/serie del set ──────
function applySetTheme(setDetails) {
    const series = (setDetails?.series || '').toLowerCase();
    const name   = (setDetails?.name   || '').toLowerCase();

    let bg1 = '#252525', bg2 = '#1a1a1a';
    let accentColor = '#ffcb05', btnText = '#1a1a1a';

    if (series.includes('scarlet') || series.includes('violet')) {
        bg1 = '#4a0a2a'; bg2 = '#2a0a4a';
        accentColor = '#e040fb'; btnText = 'white';
    } else if (series.includes('sword') || series.includes('shield')) {
        bg1 = '#0a1a3a'; bg2 = '#1a0a2a';
        accentColor = '#42a5f5'; btnText = 'white';
    } else if (series.includes('sun') || series.includes('moon')) {
        bg1 = '#3a1a00'; bg2 = '#1a0a00';
        accentColor = '#ff9800'; btnText = 'white';
    } else if (series.includes('xy')) {
        bg1 = '#0a1a3a'; bg2 = '#1a0a0a';
        accentColor = '#ef5350'; btnText = 'white';
    } else if (series.includes('black') || series.includes('white')) {
        bg1 = '#1a1a1a'; bg2 = '#0a0a0a';
        accentColor = '#eeeeee'; btnText = '#111';
    } else if (series.includes('heartgold') || series.includes('soulsilver')) {
        bg1 = '#2a1a00'; bg2 = '#0a1a0a';
        accentColor = '#ffd54f'; btnText = '#111';
    } else if (series.includes('platinum') || series.includes('diamond') || series.includes('pearl')) {
        bg1 = '#0a1a2a'; bg2 = '#1a1a2a';
        accentColor = '#b0bec5'; btnText = '#111';
    } else if (series.includes('ex')) {
        bg1 = '#2a0a0a'; bg2 = '#1a0a0a';
        accentColor = '#ef9a9a'; btnText = '#1a1a1a';
    } else if (series.includes('neo') || series.includes('base') || series.includes('gym') || series.includes('e-card')) {
        bg1 = '#0a2a0a'; bg2 = '#0a1a0a';
        accentColor = '#ffcb05'; btnText = '#1a1a1a';
    }

    const header = document.querySelector('header');
    if (header) {
        header.style.transition = 'background 0.7s ease, box-shadow 0.7s ease';
        header.style.background = `linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%)`;
        header.style.boxShadow  = `0 4px 20px rgba(0,0,0,0.7)`;
    }

    // Color del botón abrir según era
    openBtn.style.transition = 'background-color 0.5s ease, color 0.5s ease';
    openBtn.style.backgroundColor = accentColor;
    openBtn.style.color = btnText;

    // Título del tab con el nombre del set
    const setName = setDetails?.name || 'Simulador';
    document.title = `PokeVault — ${setName}`;
}


// --- LÓGICA DEL ÁLBUM ---

// Escuchar cuando el usuario escribe en el buscador
albumSearch.addEventListener('input', () => {
    if (albumScreen.style.display === 'block') {
        renderAlbum();
    }
});




function renderAlbum() {
    // Si estamos en normal, necesitamos el set. Si estamos en PSA, ya no.
    if (activeAlbum === 'normal' && !currentSetData) return;

    const psaFilters    = document.getElementById('psa-filters');
    const normalFilters = document.getElementById('normal-filters');
    if (activeAlbum === 'normal') {
        if (psaFilters)    psaFilters.style.display    = 'none';
        if (normalFilters) normalFilters.style.display = 'flex';
    } else {
        if (psaFilters)    psaFilters.style.display    = 'flex';
        if (normalFilters) normalFilters.style.display = 'none';
    }

    const data = getInventoryData();
    const searchTerm = albumSearch.value.toLowerCase();
    albumGrid.innerHTML = '';
    let ownedCount = 0;

    if (activeAlbum === 'normal') {

        // ── Inyectar barra de filtros del álbum normal (una sola vez) ──────
        if (!document.getElementById('normal-filters')) {
            const filtersDiv = document.createElement('div');
            filtersDiv.id = 'normal-filters';
            filtersDiv.style.cssText = `
                display: flex; gap: 8px; flex-wrap: wrap;
                margin-bottom: 18px; padding: 10px 12px;
                background: #1e1e1e; border-radius: 8px;
                border: 1px solid #333; width: 100%; box-sizing: border-box;
            `;
            filtersDiv.innerHTML = `
                <select id="nf-sort" style="background:#111;color:white;border:1px solid #444;padding:6px 8px;border-radius:5px;flex:1;min-width:130px;cursor:pointer;">
                    <option value="number">📋 Nº de carta</option>
                    <option value="price-desc">💰 Precio: Mayor a Menor</option>
                    <option value="price-asc">💰 Precio: Menor a Mayor</option>
                    <option value="rarity">✨ Rareza</option>
                    <option value="name">🔤 Nombre A-Z</option>
                    <option value="quantity">📦 Cantidad</option>
                </select>
                <select id="nf-show" style="background:#111;color:white;border:1px solid #444;padding:6px 8px;border-radius:5px;flex:1;min-width:130px;cursor:pointer;">
                    <option value="all">👁 Mostrar todas</option>
                    <option value="owned">✅ Solo obtenidas</option>
                    <option value="missing">❌ Solo pendientes</option>
                    <option value="dupes">🔁 Duplicadas (x2+)</option>
                </select>
            `;
            albumGrid.parentNode.insertBefore(filtersDiv, albumGrid);
            document.getElementById('nf-sort').onchange  = () => renderAlbum();
            document.getElementById('nf-show').onchange  = () => renderAlbum();
        }

        const sortMode = document.getElementById('nf-sort')?.value || 'number';
        const showMode = document.getElementById('nf-show')?.value || 'all';

        // Orden de rareza para la opción "rareza"
        const RARITY_ORDER = [
            'common','uncommon','rare','rare holo','rare holo ex',
            'rare holo gx','rare holo v','rare holo vmax','rare holo vstar',
            'rare ultra','rare secret','rare rainbow','rare shiny',
            'illustration rare','special illustration rare',
            'hyper rare','trainer gallery rare holo','shiny rare',
            'double rare','ace spec rare'
        ];
        const rarityRank = r => {
            const idx = RARITY_ORDER.indexOf((r || '').toLowerCase());
            return idx === -1 ? 99 : idx;
        };

        let allCardsInSet = Array.isArray(currentSetData)
            ? [...currentSetData]
            : [...(currentSetData.data || [])];

        // ── Ordenar ──────────────────────────────────────────────────────
        allCardsInSet.sort((a, b) => {
            const aItem = data.owned_cards[a.id];
            const bItem = data.owned_cards[b.id];
            switch (sortMode) {
                case 'price-desc':
                    return (bItem?.lastPrice || 0) - (aItem?.lastPrice || 0);
                case 'price-asc':
                    return (aItem?.lastPrice || 0) - (bItem?.lastPrice || 0);
                case 'rarity':
                    return rarityRank(b.rarity) - rarityRank(a.rarity);
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'quantity':
                    return (bItem?.quantity || 0) - (aItem?.quantity || 0);
                default: // number
                    return (parseInt(a.number) || 0) - (parseInt(b.number) || 0);
            }
        });

        // ── Filtrar y renderizar ──────────────────────────────────────────
        allCardsInSet.forEach(card => {
            if (!card.name.toLowerCase().includes(searchTerm)) return;

            const item     = data.owned_cards[card.id];
            const hasInPSA = data.psa_cards && data.psa_cards.some(s => s.cardId === card.id);
            const isOwned  = item && item.quantity > 0;
            const isDupe   = item && item.quantity >= 2;

            // Aplicar filtro de visibilidad
            if (showMode === 'owned'   && !isOwned && !hasInPSA) return;
            if (showMode === 'missing' && (isOwned || hasInPSA))  return;
            if (showMode === 'dupes'   && !isDupe)                 return;

            if (isOwned) {
                ownedCount++;
                albumGrid.appendChild(createNormalSlot(card, item));
            } else if (hasInPSA) {
                ownedCount++;
                const slot = createMissingSlot(card);
                slot.style.opacity = "1";
                slot.style.position = "relative";
                slot.style.border = "2px solid #ffcb05";
                slot.style.boxShadow = "0 0 10px rgba(255,203,5,0.3)";
                const imgDiv = slot.querySelector('.album-card-img');
                if (imgDiv) imgDiv.style.filter = "none";
                const badge = document.createElement('div');
                badge.innerText = "EN PSA";
                badge.style.cssText = `
                    position:absolute; top:5px; right:5px;
                    background:#ffcb05; color:#000;
                    font-size:10px; font-weight:bold;
                    padding:2px 6px; border-radius:4px;
                    box-shadow:0 2px 4px rgba(0,0,0,0.5);
                    z-index:10; border:1px solid black;
                `;
                slot.appendChild(badge);
                albumGrid.appendChild(slot);
            } else {
                albumGrid.appendChild(createMissingSlot(card));
            }
        });

        // Valor total del set (sumando lastPrice de todas las cartas poseídas)
        const setTotalValue = allCardsInSet.reduce((sum, card) => {
            const it = data.owned_cards[card.id];
            return sum + (it ? it.lastPrice * it.quantity : 0);
        }, 0);
        const pct = allCardsInSet.length > 0 ? Math.round((ownedCount / allCardsInSet.length) * 100) : 0;

        collectionProgress.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:12px;flex-wrap:wrap;">
                <span>${ownedCount} / ${allCardsInSet.length} cartas</span>
                <span style="color:var(--gold);font-weight:bold;">💰 $${setTotalValue.toFixed(2)}</span>
            </div>
            <div style="background:#333;border-radius:10px;height:6px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#2a75bb,var(--gold));border-radius:10px;transition:width 0.4s ease;"></div>
            </div>
            <div style="font-size:0.65rem;color:#888;margin-top:3px;">${pct}% completado</div>
        `;
    } 
    else {
        // --- MODO CÁMARA PSA ---
        
        if (!document.getElementById('psa-filters')) {
            const filtersDiv = document.createElement('div');
            filtersDiv.id = 'psa-filters';
            filtersDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 20px; padding: 10px; background: #252525; border-radius: 8px; border: 1px solid gold; width: 100%; box-sizing: border-box;';
            
            filtersDiv.innerHTML = `
                <select id="psa-filter-set" style="background:#1a1a1a; color:white; border:1px solid gold; padding:5px; border-radius:4px; flex:1; cursor:pointer;">
                    <option value="all">Todos los Sets</option>
                </select>
                <select id="psa-order" style="background:#1a1a1a; color:white; border:1px solid gold; padding:5px; border-radius:4px; flex:1; cursor:pointer;">
                    <option value="recent">Más recientes</option>
                    <option value="price-desc">Precio (Mayor a Menor)</option>
                    <option value="price-asc">Precio (Menor a Mayor)</option>
                    <option value="grade-desc">Nota (10 a 1)</option>
                    <option value="grade-asc">Nota (1 a 10)</option>
                    <option value="roi">💸 Más rentable vender</option>
                </select>
            `;
            albumGrid.parentNode.insertBefore(filtersDiv, albumGrid);

            document.getElementById('psa-filter-set').onchange = () => renderAlbum();
            document.getElementById('psa-order').onchange = () => renderAlbum();
        }

        const psaCards = [...(data.psa_cards || [])];
        const filterSetSelect = document.getElementById('psa-filter-set');
        const orderType = document.getElementById('psa-order').value;

        const setsEnColeccion = [...new Set(psaCards.map(slab => slab.cardDetails?.setName).filter(Boolean))];
        const valorAntesDeLimpiar = filterSetSelect.value;
        
        filterSetSelect.innerHTML = '<option value="all">Todos los Sets</option>';
        setsEnColeccion.forEach(setName => {
            const opt = document.createElement('option');
            opt.value = setName;
            opt.innerText = setName;
            if (setName === valorAntesDeLimpiar) opt.selected = true;
            filterSetSelect.appendChild(opt);
        });

        let selectedSet = filterSetSelect ? filterSetSelect.value : 'all';
        if (selectedSet === 'all' && currentSetData && valorAntesDeLimpiar === 'all') {
            if (setsEnColeccion.includes(currentSetData.name)) {
                selectedSet = currentSetData.name;
                filterSetSelect.value = selectedSet;
            }
        }

        let filteredPSA = psaCards.filter(slab => {
            const matchesSearch = slab.cardDetails.name.toLowerCase().includes(searchTerm);          
            const matchesSet = (selectedSet === 'all') || (slab.cardDetails?.setName === selectedSet);            
            return matchesSearch && matchesSet;
        });

        filteredPSA.sort((a, b) => {
            // Multiplicadores idénticos a los de openZoomPSA
            const getMulti = (grade) => {
                if (grade === 10) return 10;
                if (grade === 9)  return 3;
                if (grade === 8)  return 1.5;
                if (grade === 7)  return 1;
                if (grade === 6)  return 0.85;
                if (grade === 5)  return 0.7;
                if (grade === 4)  return 0.5;
                return 0.3; // <= 3
            };
            const getVal = (s) => s.basePrice * getMulti(s.grade);
            const getRoi = (s) => getVal(s) - s.basePrice;
            if (orderType === 'price-desc') return getVal(b) - getVal(a);
            if (orderType === 'price-asc')  return getVal(a) - getVal(b);
            if (orderType === 'grade-desc') return b.grade - a.grade;
            if (orderType === 'grade-asc')  return a.grade - b.grade;
            if (orderType === 'roi')        return getRoi(b) - getRoi(a);
            return 0;
        });

        filteredPSA.forEach((slab) => {
            ownedCount++;
            const originalIndex = data.psa_cards.indexOf(slab);
            albumGrid.appendChild(createPSASlot(slab.cardDetails, slab, originalIndex));
        });

        // Valor total cámara PSA
        const psaTotalValue = filteredPSA.reduce((sum, slab) => {
            const multi = slab.grade === 10 ? 10 : slab.grade === 9 ? 3 : slab.grade === 8 ? 1.5 : slab.grade === 7 ? 1 : 0.5;
            return sum + slab.basePrice * multi;
        }, 0);

        collectionProgress.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                <span>🏆 ${ownedCount} cartas gradeadas</span>
                <span style="color:var(--gold);font-weight:bold;">💰 $${psaTotalValue.toFixed(2)}</span>
            </div>
        `;
    }
}

function createPSASlot(card, slab, index) {
    const slot = document.createElement('div');
    const isGrade10 = slab.grade === 10;
    
    slot.className = `album-card-slot owned psa-slab ${isGrade10 ? 'grade-10' : ''}`;

    let multi = isGrade10 ? 10 : slab.grade === 9 ? 3 : slab.grade === 8 ? 1.5 : 1;
    if (slab.grade <= 6) multi = 0.8;
    const psaPrice = slab.basePrice * multi;

    // Definimos el color del nombre: dorado para PSA 10, gris claro para el resto
    const nameColor = isGrade10 ? '#ffcb05' : '#aaa';
    const nameWeight = isGrade10 ? 'bold' : 'normal';
    const nameShadow = isGrade10 ? '0 0 5px rgba(255, 203, 5, 0.5)' : 'none';

    slot.innerHTML = `
        <div class="psa-card-header">
            <span>PSA</span><span class="psa-grade-value">${slab.grade}</span>
        </div>
        <div class="album-card-img" style="background-image: url('${card.images.small}')"></div>
        <div class="album-card-info">
            <p style="font-size: 11px; color: ${nameColor}; font-weight: ${nameWeight}; text-shadow: ${nameShadow}; margin: 5px 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                ${card.name}
            </p>
            <p style="color: gold; font-weight: bold; margin: 0; font-size: 14px;">$${psaPrice.toFixed(2)}</p>
        </div>
    `;
    
    slot.onclick = () => openZoomPSA(card, slab, index);
    return slot;
}

// Dibuja una carta que NO tienes (en gris)
function createMissingSlot(card) {
    const slot = document.createElement('div');
    slot.className = 'album-card-slot missing';
    slot.innerHTML = `
        <div class="album-card-img" style="background-image: url('${card.images.small}'); filter: brightness(0.3) grayscale(1);"></div>
        <div class="album-card-info">
            <p style="color: #666; font-size: 12px;">#${card.number}</p>
        </div>
    `;
    return slot;
}

// Dibuja una carta NORMAL que SÍ tienes
function createNormalSlot(card, item) {
    const slot = document.createElement('div');
    slot.className = 'album-card-slot owned';

    const dupes = item.quantity - 1; // copias extra vendibles

    slot.innerHTML = `
        <div class="album-card-img" style="background-image: url('${card.images.small}'); position:relative;">
            <div class="card-count">x${item.quantity}</div>
        </div>
        <div class="album-card-info" style="text-align:center;padding:5px;">
            <p style="font-size:0.7rem;margin:0;color:white;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${card.name}</p>
            <p style="font-size:0.8rem;margin:2px 0;color:var(--success);font-weight:bold;">
                $${item.lastPrice.toFixed(2)}
            </p>
            ${dupes >= 1 ? `
            <button class="sell-dupes-btn"
                data-card-id="${card.id}"
                data-price="${item.lastPrice}"
                data-dupes="${dupes}"
                style="
                    margin-top:4px;width:100%;padding:3px 0;
                    background:#c0392b;color:white;
                    border:none;border-radius:4px;
                    font-size:0.65rem;font-weight:bold;
                    cursor:pointer;
                ">Vender x${dupes} ($${(item.lastPrice * dupes).toFixed(2)})</button>
            ` : ''}
        </div>
    `;

    // Click en la carta abre zoom (pero no si le dan al botón de vender)
    slot.onclick = (e) => {
        if (e.target.classList.contains('sell-dupes-btn')) return;
        openZoom(card, item.lastPrice, true);
    };

    // Evento del botón vender duplicadas
    const sellBtn = slot.querySelector('.sell-dupes-btn');
    if (sellBtn) {
        sellBtn.onclick = (e) => {
            e.stopPropagation();
            const dupeCount = parseInt(sellBtn.dataset.dupes);
            const price     = parseFloat(sellBtn.dataset.price);
            const total     = (price * dupeCount).toFixed(2);
            if (!confirm(`¿Vender ${dupeCount} copia${dupeCount > 1 ? 's' : ''} extra de "${card.name}" por $${total}?`)) return;
            if (sellCard(card.id, price, dupeCount)) {
                refreshUI();
                renderAlbum();
            }
        };
    }

    return slot;
}

async function renderTopValuableCards() {
    const data = getInventoryData();
    const ownedCards = data.owned_cards || {};
    
    albumGrid.innerHTML = '<p class="loading-state">Buscando tus joyas en el inventario...</p>';
    collectionProgress.innerText = "Top 50 Cartas más Valiosas";

    const cardIds = Object.keys(ownedCards);
    if (cardIds.length === 0) {
        albumGrid.innerHTML = '<p class="placeholder-text">Aún no tienes cartas valiosas.</p>';
        return;
    }

    // Buscamos los datos de las imágenes en el caché de los sets
    const allCardsData = [];
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('set_cache_')) {
            const setCards = JSON.parse(localStorage.getItem(key));
            setCards.forEach(c => {
                if (ownedCards[c.id]) {
                    allCardsData.push({
                        ...c,
                        currentInventoryPrice: ownedCards[c.id].lastPrice,
                        quantity: ownedCards[c.id].quantity
                    });
                }
            });
        }
    });

    // Eliminar duplicados y ordenar
    const uniqueCards = Array.from(new Map(allCardsData.map(item => [item.id, item])).values());
    uniqueCards.sort((a, b) => b.currentInventoryPrice - a.currentInventoryPrice);
    
    const top50 = uniqueCards.slice(0, 50);

    albumGrid.innerHTML = '';
    top50.forEach(card => {
        const cardSlot = document.createElement('div');
        cardSlot.className = 'album-card-slot owned';
        
        cardSlot.innerHTML = `
            <div class="album-card-img" style="background-image: url('${card.images.small}')">
                <span class="card-count">x${card.quantity}</span>
            </div>
            <div class="album-card-info">
                <p>${card.name}</p>
                <span class="card-rarity" style="color: #00ff00; font-weight: bold;">
                    $${card.currentInventoryPrice.toFixed(2)}
                </span>
            </div>
        `;

        cardSlot.onclick = () => openZoom(card, card.currentInventoryPrice, true);
        albumGrid.appendChild(cardSlot);
    });
}

// --- ECONOMÍA Y APERTURA ---

// Función central de apertura, recibe cuántos sobres abrir
function doOpenPacks(cantidad) {
    if (!currentSetData) return;
    const cardsArray = Array.isArray(currentSetData) ? currentSetData : (currentSetData.data || []);
    if (cardsArray.length === 0) return;

    const data = getInventoryData();
    const totalCost = currentPackPrice * cantidad;

    if (data.wallet < totalCost) {
        alert(`¡Saldo insuficiente! Necesitas $${totalCost.toFixed(2)} para ${cantidad} sobre${cantidad > 1 ? 's' : ''}.`);
        return;
    }

    // Confirmación para x5 y x10 (anti-missclick)
    if (cantidad > 1) {
        if (!confirm(`¿Abrir ${cantidad} sobres por $${totalCost.toFixed(2)}?`)) return;
    }

    // Bloquear TODOS los controles
    openBtn.disabled = true;
    openBtn.innerText = cantidad === 1 ? "Abriendo..." : `Abriendo ${cantidad}...`;
    const multiBtns = document.querySelectorAll('.multi-open-btn');
    multiBtns.forEach(b => b.disabled = true);
    setSelector.disabled = true;
    orderSelector.disabled = true;

    updateWallet(-totalCost);
    refreshUI();

    currentPackProfit = 0;
    const profitDisplay = document.getElementById('current-profit');
    if (profitDisplay) profitDisplay.innerText = "0.00";

    const setId = document.getElementById('set-selector').value;
    albumScreen.style.display = 'none';
    packContainer.style.display = 'flex';

    if (cantidad === 1) {
        // Apertura normal con animación carta a carta
        // Los selectores se desbloquean en renderPack cuando se voltea la última carta
        const newPack = generatePack(cardsArray, setId);
        renderPack(newPack);

        // Guardar en historial — el profit real se actualiza en flipCard,
        // así que guardamos una entrada provisional que actualizamos al terminar
        const histEntry = {
            cantidad: 1,
            setId,
            cost: totalCost,
            profit: 0,      // se rellena al terminar
            net: 0,
            date: new Date().toLocaleTimeString()
        };
        packHistory.unshift(histEntry);
        if (packHistory.length > 20) packHistory.pop();
        // Guardar referencia para actualizar profit cuando acabe el sobre
        window._currentHistEntry = histEntry;

    } else {
        // Apertura múltiple: abre todos en silencio, muestra resumen
        let totalProfit = 0;
        const resumen = { total: 0, hits: [], porRareza: {} };

        for (let i = 0; i < cantidad; i++) {
            const pack = generatePack(cardsArray, setId);
            pack.forEach(card => {
                const price = getBestPrice(card);
                totalProfit += price;
                addCardToInventory(card.id, price);
                if (price >= 5) {
                    resumen.hits.push({ name: card.name, price, rarity: card.rarity || '' });
                }
                const r = (card.rarity || 'Unknown');
                resumen.porRareza[r] = (resumen.porRareza[r] || 0) + 1;
            });
        }
        resumen.total = totalProfit;

        packHistory.unshift({
            cantidad,
            setId,
            cost: totalCost,
            profit: totalProfit,
            net: totalProfit - totalCost,
            date: new Date().toLocaleTimeString()
        });
        if (packHistory.length > 20) packHistory.pop();

        refreshUI();
        renderMultiPackSummary(resumen, cantidad, totalCost);

        // Desbloquear todo (los selectores también)
        openBtn.disabled = false;
        updateOpenButton();
        multiBtns.forEach(b => b.disabled = false);
        setSelector.disabled = false;
        orderSelector.disabled = false;
    }
}

openBtn.addEventListener('click', () => doOpenPacks(1));

// Inyectar botones x5 y x10 junto al botón principal (una sola vez)
(function injectMultiButtons() {
    const btn5 = document.createElement('button');
    btn5.className = 'multi-open-btn';
    btn5.id = 'open-5-btn';
    btn5.innerText = 'Abrir x5';
    btn5.disabled = true;
    btn5.style.cssText = 'background:#1a5276; color:white; font-weight:bold;';
    btn5.addEventListener('click', () => doOpenPacks(5));

    const btn10 = document.createElement('button');
    btn10.className = 'multi-open-btn';
    btn10.id = 'open-10-btn';
    btn10.innerText = 'Abrir x10';
    btn10.disabled = true;
    btn10.style.cssText = 'background:#1a3a4a; color:white; font-weight:bold;';
    btn10.addEventListener('click', () => doOpenPacks(10));

    const btnHistory = document.createElement('button');
    btnHistory.id = 'history-btn';
    btnHistory.innerText = '📜';
    btnHistory.title = 'Historial de sobres';
    btnHistory.style.cssText = 'background:#333; color:white; font-weight:bold; padding:10px 12px;';
    btnHistory.addEventListener('click', showPackHistory);

    openBtn.insertAdjacentElement('afterend', btn5);
    btn5.insertAdjacentElement('afterend', btn10);
    btn10.insertAdjacentElement('afterend', btnHistory);
})();

function editPriceManually(cardId, modalPriceTag, sellBtn) {
    const val = prompt("Nuevo precio ($):");
    if (val === null) return;
    const newPrice = parseFloat(val);

    if (!isNaN(newPrice) && newPrice >= 0) {
        modalPriceTag.innerText = `Market Value: $${newPrice.toFixed(2)}`;
        if (sellBtn) {
            sellBtn.innerText = `VENDER POR $${newPrice.toFixed(2)}`;
            sellBtn.onclick = () => ejecutarVenta({id: cardId}, newPrice);
        }

        const inv = getInventoryData();
        if (inv.owned_cards[cardId]) {
            inv.owned_cards[cardId].lastPrice = newPrice;
            saveInventoryData(inv);
            if (document.getElementById('album-screen').style.display === 'block') {
                // Si estamos en el álbum normal o en el top, refrescamos
                if (collectionProgress.innerText.includes("Top")) renderTopValuableCards();
                else renderAlbum();
            }
        }
    }
}

// --- CARGA DE DATOS (API) ---

async function loadSetsIntoSelector() {
    const sets = await fetchAllSets();
    if (!sets) return;

    const resetToPlaceholder = () => {
        // Resetea el set actual y deshabilita el boton hasta que el usuario elija
        currentSetData = null;
        currentPackPrice = 5.00;
        openBtn.disabled = true;
        openBtn.innerText = 'Selecciona una promo';
        const profitDisplay = document.getElementById('current-profit');
        if (profitDisplay) profitDisplay.innerText = '0.00';
    };

    const applyOrder = (isInitialLoad = false) => {
        const order = orderSelector.value;
        let sortedSets = [...sets];

        if (order === 'alphabetical') {
            sortedSets.sort((a, b) => a.name.localeCompare(b.name));
        } 
        else if (order === 'price-asc' || order === 'price-desc') {
            sortedSets.sort((a, b) => {
                const priceA = getPackPrice(a);
                const priceB = getPackPrice(b);
                return order === 'price-asc' ? priceA - priceB : priceB - priceA;
            });
        } 
        else if (order === 'date-old') {
            sortedSets.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
        } 
        else {
            sortedSets.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
        }

        const lastSet = localStorage.getItem('pokesim_last_set');

        setSelector.innerHTML = 
            '<option value="" disabled>--- Selecciona una promo ---</option>' +
            sortedSets.map(set => 
                `<option value="${set.id}"${set.id === lastSet ? ' selected' : ''}>${set.name} - $${getPackPrice(set).toFixed(2)}</option>`
            ).join('');

        // En la carga inicial, si hay un set guardado NO reseteamos — lo restauramos
        // En cambios de orden posteriores sí reseteamos para forzar re-selección
        if (isInitialLoad && lastSet && sortedSets.find(s => s.id === lastSet)) {
            // No llamamos resetToPlaceholder — initSet lo cargará desde startApp
        } else if (!isInitialLoad) {
            resetToPlaceholder();
        } else {
            resetToPlaceholder();
        }
    };

    orderSelector.addEventListener('change', () => applyOrder(false));
    applyOrder(true); // Carga inicial
}




// ── Resumen apertura múltiple ────────────────────────────────
function renderMultiPackSummary(resumen, cantidad, totalCost) {
    const net = resumen.total - totalCost;
    const netColor = net >= 0 ? '#4caf50' : '#ff5252';
    const netSign  = net >= 0 ? '+' : '';

    // Top hits ordenados por precio
    const topHits = resumen.hits
        .sort((a, b) => b.price - a.price)
        .slice(0, 8);

    const hitsHTML = topHits.length
        ? topHits.map(h => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #222;">
                <span style="color:#ddd;font-size:0.8rem;">${h.name}</span>
                <span style="color:#4caf50;font-weight:bold;font-size:0.8rem;">$${h.price.toFixed(2)}</span>
            </div>`).join('')
        : '<div style="color:#666;font-size:0.8rem;">Sin hits destacados esta vez.</div>';

    packContainer.innerHTML = `
        <div style="
            max-width:420px; width:90%; margin:auto;
            background:#1a1a1a; border:1px solid #333; border-radius:12px;
            padding:24px; display:flex; flex-direction:column; gap:14px;
        ">
            <div style="text-align:center;">
                <div style="font-size:1.5rem;font-weight:bold;color:white;">
                    ${cantidad} Sobres Abiertos
                </div>
                <div style="font-size:0.8rem;color:#aaa;margin-top:4px;">
                    ${cantidad * 11} cartas añadidas al álbum
                </div>
            </div>

            <!-- Resumen económico -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center;">
                <div style="background:#111;border-radius:8px;padding:10px;">
                    <div style="color:#aaa;font-size:0.65rem;text-transform:uppercase;">Coste</div>
                    <div style="color:#ff5252;font-weight:bold;font-size:1.1rem;">-$${totalCost.toFixed(2)}</div>
                </div>
                <div style="background:#111;border-radius:8px;padding:10px;">
                    <div style="color:#aaa;font-size:0.65rem;text-transform:uppercase;">Valor</div>
                    <div style="color:#4caf50;font-weight:bold;font-size:1.1rem;">$${resumen.total.toFixed(2)}</div>
                </div>
                <div style="background:#111;border:1px solid ${netColor}44;border-radius:8px;padding:10px;">
                    <div style="color:#aaa;font-size:0.65rem;text-transform:uppercase;">Neto</div>
                    <div style="color:${netColor};font-weight:bold;font-size:1.1rem;">${netSign}$${net.toFixed(2)}</div>
                </div>
            </div>

            <!-- Top hits -->
            <div>
                <div style="color:#ffcb05;font-size:0.75rem;font-weight:bold;text-transform:uppercase;margin-bottom:8px;">
                    ⭐ Mejores cartas obtenidas
                </div>
                <div style="max-height:160px;overflow-y:auto;">${hitsHTML}</div>
            </div>

            <!-- Botón continuar -->
            <button id="multi-continue-btn" style="
                width:100%;padding:12px;
                background:var(--gold);color:#000;
                border:none;border-radius:8px;
                font-weight:bold;font-size:1rem;cursor:pointer;
            ">Continuar</button>
        </div>
    `;

    // Event listener del botón continuar (no puede ir en el template literal)
    const continueBtn = document.getElementById('multi-continue-btn');
    if (continueBtn) {
        continueBtn.onclick = () => {
            packContainer.innerHTML = '';
            packContainer.style.display = 'flex';
            updateOpenButton();
            const multiBtns = document.querySelectorAll('.multi-open-btn');
            multiBtns.forEach(b => b.disabled = false);
            setSelector.disabled = false;
            orderSelector.disabled = false;
        };
    }

    // Guardar en historial
    packHistory.unshift({
        cantidad,
        cost: totalCost,
        profit: resumen.total,
        net,
        hits: topHits.length,
        date: new Date().toLocaleTimeString()
    });
    if (packHistory.length > 20) packHistory.pop();
}

// ── Historial de sobres ──────────────────────────────────────
function showPackHistory() {
    if (packHistory.length === 0) {
        alert('Aún no has abierto ningún sobre en esta sesión.');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:3000;
        background:rgba(0,0,0,0.95);
        display:flex;align-items:center;justify-content:center;
        padding:20px;box-sizing:border-box;
    `;

    const totalGastado = packHistory.reduce((s, h) => s + h.cost, 0);
    const totalGanado  = packHistory.reduce((s, h) => s + h.profit, 0);
    const netTotal     = totalGanado - totalGastado;
    const netColor     = netTotal >= 0 ? '#4caf50' : '#ff5252';

    const rowsHTML = packHistory.map((h, i) => {
        const nc = h.net >= 0 ? '#4caf50' : '#ff5252';
        const ns = h.net >= 0 ? '+' : '';
        return `
            <tr style="border-bottom:1px solid #222;">
                <td style="padding:6px 8px;color:#aaa;font-size:0.75rem;">${h.date}</td>
                <td style="padding:6px 8px;text-align:center;color:white;font-size:0.75rem;">x${h.cantidad}</td>
                <td style="padding:6px 8px;text-align:right;color:#ff5252;font-size:0.75rem;">-$${h.cost.toFixed(2)}</td>
                <td style="padding:6px 8px;text-align:right;color:#4caf50;font-size:0.75rem;">$${h.profit.toFixed(2)}</td>
                <td style="padding:6px 8px;text-align:right;color:${nc};font-weight:bold;font-size:0.75rem;">${ns}$${h.net.toFixed(2)}</td>
            </tr>`;
    }).join('');

    overlay.innerHTML = `
        <div style="max-width:500px;width:100%;background:#1a1a1a;border-radius:12px;border:1px solid #333;overflow:hidden;">
            <div style="padding:16px 20px;background:#252525;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:bold;color:white;">📜 Historial de Sobres</span>
                <button id="close-history" style="background:none;border:none;color:#aaa;font-size:1.3rem;cursor:pointer;">✕</button>
            </div>

            <!-- Resumen sesión -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#333;">
                <div style="background:#1a1a1a;padding:12px;text-align:center;">
                    <div style="color:#aaa;font-size:0.6rem;text-transform:uppercase;">Gastado</div>
                    <div style="color:#ff5252;font-weight:bold;">$${totalGastado.toFixed(2)}</div>
                </div>
                <div style="background:#1a1a1a;padding:12px;text-align:center;">
                    <div style="color:#aaa;font-size:0.6rem;text-transform:uppercase;">Obtenido</div>
                    <div style="color:#4caf50;font-weight:bold;">$${totalGanado.toFixed(2)}</div>
                </div>
                <div style="background:#1a1a1a;padding:12px;text-align:center;">
                    <div style="color:#aaa;font-size:0.6rem;text-transform:uppercase;">Neto sesión</div>
                    <div style="color:${netColor};font-weight:bold;">${netTotal >= 0 ? '+' : ''}$${netTotal.toFixed(2)}</div>
                </div>
            </div>

            <!-- Tabla -->
            <div style="max-height:320px;overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#252525;">
                            <th style="padding:8px;text-align:left;color:#888;font-size:0.7rem;">Hora</th>
                            <th style="padding:8px;color:#888;font-size:0.7rem;">Sobres</th>
                            <th style="padding:8px;text-align:right;color:#888;font-size:0.7rem;">Coste</th>
                            <th style="padding:8px;text-align:right;color:#888;font-size:0.7rem;">Valor</th>
                            <th style="padding:8px;text-align:right;color:#888;font-size:0.7rem;">Neto</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHTML}</tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('close-history').onclick = () => overlay.remove();
}


// ── Sistema de toasts ────────────────────────────────────────
// showToast unificada más abajo


// ─────────────────────────────────────────────────────────────
//  Sistema de toasts (notificaciones flotantes)
// ─────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed; bottom: 24px; right: 24px;
            z-index: 9999; display: flex; flex-direction: column;
            gap: 10px; pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const colors = {
        info:    { bg: '#1a1a2e', border: '#2a75bb', icon: 'ℹ️' },
        success: { bg: '#1a2e1a', border: '#4caf50', icon: '✅' },
        gold:    { bg: '#2e2a0a', border: '#ffcb05', icon: '💰' },
        warning: { bg: '#2e1a0a', border: '#ff9800', icon: '⚠️' },
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${c.bg}; border: 1px solid ${c.border};
        color: white; padding: 12px 18px; border-radius: 10px;
        font-size: 0.88rem; font-weight: bold;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        opacity: 0; transform: translateX(40px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none; max-width: 280px; line-height: 1.4;
    `;
    toast.innerHTML = `${c.icon} ${msg}`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// --- UTILIDADES ---

function refreshUI() {
    const data = getInventoryData();
    // Actualizar dinero
    if (balanceDisplay) balanceDisplay.innerText = data.wallet.toFixed(2);
    
    // ACTUALIZAR PRECIO DEL SOBRE EN EL CENTRO
    const costDisplay = document.getElementById('current-pack-cost');
    if (costDisplay) {
        costDisplay.innerText = `$${currentPackPrice.toFixed(2)}`;
    }
}


// ─────────────────────────────────────────────────────────────
//  getBestPrice(card)
//  Extrae el mejor precio disponible de TODAS las fuentes de la
//  API y aplica un suelo inteligente por rareza cuando el precio
//  real parece incorrecto (0, null, o demasiado bajo).
// ─────────────────────────────────────────────────────────────
function getBestPrice(card) {
    const tcg  = card.tcgplayer?.prices  || {};
    const cmkt = card.cardmarket?.prices || {};

    // 1. Recogemos TODOS los campos de precio disponibles
    const candidates = [
        // CardMarket
        cmkt.averageSellPrice,
        cmkt.avg1,
        cmkt.avg7,
        cmkt.avg30,
        cmkt.lowPrice,
        cmkt.trendPrice,
        // TCGPlayer — todas las variantes
        tcg.holofoil?.market,       tcg.holofoil?.mid,
        tcg.reverseHolofoil?.market,tcg.reverseHolofoil?.mid,
        tcg.normal?.market,         tcg.normal?.mid,
        tcg.unlimitedHolofoil?.market,
        tcg['1stEditionHolofoil']?.market,
        tcg['1stEdition']?.market,
        tcg.unlimitedNormal?.market,
    ].filter(p => typeof p === 'number' && p > 0);

    // 2. Suelos mínimos por rareza (para detectar precios "raro-bajos")
    const r = (card.rarity || '').toLowerCase();
    let rarityFloor = 0.10;   // common/unknown
    if      (r.includes('hyper') || r.includes('secret'))            rarityFloor = 20.00;
    else if (r.includes('special illustration') || r.includes('special ill')) rarityFloor = 40.00;
    else if (r.includes('illustration rare'))                        rarityFloor = 15.00;
    else if (r.includes('ultra') || r.includes('vmax') || (r.includes('rare') && r.includes('ex'))) rarityFloor = 8.00;
    else if (r.includes('rare holo') || r.includes('rare v'))       rarityFloor = 3.00;
    else if (r.includes('rare'))                                     rarityFloor = 1.00;
    else if (r.includes('uncommon'))                                 rarityFloor = 0.20;

    // 3. Filtramos candidatos que estén por encima del suelo de rareza
    //    (evita aceptar un $0.05 para una ultra rare)
    const validCandidates = candidates.filter(p => p >= rarityFloor);

    if (validCandidates.length > 0) {
        // Usamos la mediana en lugar del máximo para evitar picos extremos
        const sorted = [...validCandidates].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // 4. Fallback final por rareza (ningún precio pasó el filtro)
    if      (r.includes('hyper') || r.includes('secret'))            return 50.00;
    else if (r.includes('special illustration') || r.includes('special ill')) return 80.00;
    else if (r.includes('illustration rare'))                        return 25.00;
    else if (r.includes('ultra') || r.includes('vmax') || (r.includes('rare') && r.includes('ex'))) return 15.00;
    else if (r.includes('rare holo') || r.includes('rare v'))       return 5.00;
    else if (r.includes('rare'))                                     return 1.50;
    else if (r.includes('uncommon'))                                 return 0.25;
    return 0.10;
}

function renderPack(pack) {
    packContainer.innerHTML = '';
    packContainer.style.position = 'relative';
    let cartasReveladas = 0;
    const cardDivs = [];
    let gridScheduled = false;   // evita que mostrarGridFinal se llame más de una vez
    let gridTimeout   = null;

    // ── FASE 1: Mazo apilado en el centro ─────────────────────────────────
    // Todas las cartas se colocan apiladas ligeramente rotadas (efecto baraja)
    // Solo la carta del top (última en el array = index más alto) es clickable

    function actualizarMazo() {
        cardDivs.forEach(({ div }, i) => {
            const sinVoltear = cardDivs.filter(c => !c.div.classList.contains('flipped'));
            const posEnMazo  = sinVoltear.indexOf(cardDivs[i]);
            if (posEnMazo === -1) return; // ya volteada, no tocar

            const esTop = posEnMazo === sinVoltear.length - 1;
            const rot   = (posEnMazo - sinVoltear.length / 2) * 2.5;
            const yOff  = posEnMazo * -1.5;

            div.style.transition  = 'transform 0.3s ease, box-shadow 0.3s ease';
            div.style.transform   = `translate(-50%, -50%) rotate(${rot}deg) translateY(${yOff}px)`;
            div.style.left        = '50%';
            div.style.top         = '50%';
            div.style.zIndex      = posEnMazo + 1;
            div.style.cursor      = esTop ? 'pointer' : 'default';
            div.style.pointerEvents = esTop ? 'auto' : 'none';

            // Resaltar la carta del top con un brillo suave
            div.style.boxShadow = esTop
                ? '0 0 20px rgba(255,203,5,0.5), 0 10px 30px rgba(0,0,0,0.6)'
                : '0 5px 15px rgba(0,0,0,0.4)';
        });
    }

    // ── Función de volteo ──────────────────────────────────────────────────
    function flipCard(cardDiv, card, index, realPrice) {
        if (cardDiv.classList.contains('flipped')) return;

        // Quitar el brillo del mazo al voltear
        cardDiv.style.boxShadow = '';
        cardDiv.classList.add('flipped');
        sfx.play('flip');

        let tiempoDeEspera = 800;

        if (realPrice >= 100) {
            sfx.play('epic');
            cardDiv.classList.add('hit-legendary');
            tiempoDeEspera = 3000;
            document.body.style.transition = "background-color 0.1s";
            document.body.style.backgroundColor = "#fff70044";
            setTimeout(() => document.body.style.backgroundColor = "", 250);
        } else if (realPrice >= 50) {
            sfx.play('rare');
            cardDiv.classList.add('hit-rare');
            tiempoDeEspera = 1500;
        } else if (realPrice >= 5) {
            sfx.play('hit');
            cardDiv.classList.add('hit-normal');
            tiempoDeEspera = 1000;
        }

        cartasReveladas++;

        currentPackProfit += realPrice;
        const profitDisplay = document.getElementById('current-profit');
        if (profitDisplay) profitDisplay.innerText = currentPackProfit.toFixed(2);

        addCardToInventory(card.id, realPrice);
        refreshUI();

        // Actualizar el mazo (la siguiente carta sube al top)
        setTimeout(() => actualizarMazo(), 200);

        setTimeout(() => {
            cardDiv.style.pointerEvents = 'none';
            cardDiv.classList.add('aside');
            // Mover al lateral igual que antes, para que no tapen el mazo
            moveToSide(cardDiv, index);
            setTimeout(() => { cardDiv.style.pointerEvents = 'auto'; }, 800);

            if (autoRevealActive) scheduleNextAutoFlip(cardDivs, pack);

            // ── FASE 2: Última carta → mostrar grid (una sola vez) ──────
            if (cartasReveladas === pack.length && !gridScheduled) {
                gridScheduled = true;
                if (gridTimeout) clearTimeout(gridTimeout);
                gridTimeout = setTimeout(() => mostrarGridFinal(cardDivs), 600);
            }
        }, tiempoDeEspera);
    }

    // ── Grid final con todas las cartas ───────────────────────────────────
    function mostrarGridFinal(cardDivs) {
        // Limpiar el contenedor y cambiar a modo grid
        packContainer.innerHTML = '';
        packContainer.style.flexDirection  = 'column';
        packContainer.style.alignItems     = 'center';
        packContainer.style.justifyContent = 'center';
        packContainer.style.padding        = '20px';
        packContainer.style.overflowY      = 'auto';

        // Wrapper grid
        const grid = document.createElement('div');
        grid.id = 'pack-result-grid';
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 16px;
            width: 100%;
            max-width: 800px;
            margin-bottom: 20px;
            padding: 0 8px;
            box-sizing: border-box;
        `;

        // Ordenar: hits primero (mayor precio)
        const sorted = [...cardDivs].sort((a, b) => b.realPrice - a.realPrice);

        sorted.forEach(({ card, realPrice }, i) => {
            const slot = document.createElement('div');
            slot.style.cssText = `
                display: flex; flex-direction: column; align-items: center;
                opacity: 0; transform: translateY(20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                cursor: pointer;
            `;

            // Color del precio según valor
            const priceColor = realPrice >= 100 ? '#ffcb05'
                : realPrice >= 50 ? '#ffffff'
                : realPrice >= 5  ? '#00d4ff'
                : '#4caf50';

            const glowStyle = realPrice >= 100
                ? 'box-shadow: 0 0 18px gold, 0 4px 12px rgba(0,0,0,0.6);'
                : realPrice >= 50
                ? 'box-shadow: 0 0 14px white, 0 4px 12px rgba(0,0,0,0.6);'
                : realPrice >= 5
                ? 'box-shadow: 0 0 10px #00d4ff, 0 4px 12px rgba(0,0,0,0.5);'
                : 'box-shadow: 0 4px 12px rgba(0,0,0,0.5);';

            slot.innerHTML = `
                <div style="
                    width:110px; height:154px;
                    background-image: url('${card.images.small}');
                    background-size: cover; background-position: center;
                    border-radius: 8px;
                    ${glowStyle}
                "></div>
                <div style="
                    margin-top: 6px;
                    background: rgba(0,0,0,0.75);
                    border: 1px solid ${priceColor}88;
                    border-radius: 12px;
                    padding: 2px 8px;
                    font-size: 0.78rem;
                    font-weight: bold;
                    color: ${priceColor};
                    font-family: 'Courier New', monospace;
                    white-space: nowrap;
                ">$${realPrice.toFixed(2)}</div>
            `;

            slot.onclick = () => openZoom(card, realPrice, false);
            grid.appendChild(slot);

            // Animación de entrada en cascada
            setTimeout(() => {
                slot.style.opacity   = '1';
                slot.style.transform = 'translateY(0)';
            }, i * 60);
        });

        packContainer.appendChild(grid);

        // Botón guardar en álbum
        const saveBtn = document.createElement('button');
        saveBtn.id = 'save-to-album-btn';
        saveBtn.innerHTML = '📦 Guardar en Álbum';
        saveBtn.style.cssText = `
            margin-top: 8px;
            padding: 14px 40px;
            background: var(--gold);
            color: #000;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            opacity: 0;
            transform: translateY(10px);
            transition: opacity 0.4s ease, transform 0.4s ease;
            box-shadow: 0 4px 20px rgba(255,203,5,0.4);
        `;

        packContainer.appendChild(saveBtn);

        // Aparecer el botón tras las cartas
        setTimeout(() => {
            saveBtn.style.opacity   = '1';
            saveBtn.style.transform = 'translateY(0)';
        }, sorted.length * 60 + 200);

        // Click en guardar → animación de salida hacia arriba
        saveBtn.onclick = () => {
            saveBtn.style.display = 'none';
            const slots = grid.querySelectorAll('div');

            slots.forEach((slot, i) => {
                setTimeout(() => {
                    slot.style.transition = 'transform 0.4s ease, opacity 0.4s ease';
                    slot.style.transform  = 'translateY(-120vh) rotate(10deg)';
                    slot.style.opacity    = '0';
                }, i * 50);
            });

            // Limpiar tras la animación y desbloquear
            setTimeout(() => {
                packContainer.innerHTML = '';
                packContainer.style.flexDirection  = '';
                packContainer.style.alignItems     = '';
                packContainer.style.justifyContent = '';
                packContainer.style.padding        = '50px';
                packContainer.style.overflowY      = '';

                openBtn.disabled = false;
                updateOpenButton();
                setSelector.disabled  = false;
                orderSelector.disabled = false;

                if (window._currentHistEntry) {
                    window._currentHistEntry.profit = currentPackProfit;
                    window._currentHistEntry.net    = currentPackProfit - window._currentHistEntry.cost;
                    window._currentHistEntry = null;
                }
            }, slots.length * 50 + 500);
        };

        // Si auto-reveal ON → guardar automáticamente tras 3s
        if (autoRevealActive) {
            setTimeout(() => { if (saveBtn.parentNode) saveBtn.click(); }, 3000);
        }
    }

    // ── Exponer flipNextCard para spacebar ────────────────────────────────
    flipNextCard = () => {
        // El TOP del mazo es el ÚLTIMO sin voltear, igual que en auto-reveal
        const sinVoltear = cardDivs.filter(({ div }) => !div.classList.contains('flipped'));
        const top = sinVoltear[sinVoltear.length - 1];
        if (top) flipCard(top.div, top.card, top.index, top.realPrice);
    };

    // ── Repartir cartas al mazo ───────────────────────────────────────────
    pack.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card dealing';
        cardDiv.style.position = 'absolute';
        cardDiv.style.zIndex   = index + 1;

        const realPrice = getBestPrice(card);

        cardDiv.innerHTML = `
            <div class="card-inner">
                <div class="card-back"></div>
                <div class="card-front" style="background-image: url('${card.images.large}')"></div>
            </div>
            <div class="price-tag">$${realPrice.toFixed(2)}</div>
        `;

        cardDivs.push({ div: cardDiv, card, index, realPrice });

        // Handler unificado para click manual y auto-reveal
        function handleFlip() {
            if (!cardDiv.classList.contains('flipped')) {
                const sinVoltear = cardDivs.filter(c => !c.div.classList.contains('flipped'));
                const esTop = sinVoltear[sinVoltear.length - 1]?.div === cardDiv;
                if (esTop) flipCard(cardDiv, card, index, realPrice);
            }
        }
        // Evento 'flipme' usado por auto-reveal (sin restricción de esTop)
        function handleAutoFlip() {
            if (!cardDiv.classList.contains('flipped')) {
                flipCard(cardDiv, card, index, realPrice);
            }
        }
        cardDiv.addEventListener('click', handleFlip);
        cardDiv.addEventListener('flipme', handleAutoFlip);

        setTimeout(() => {
            packContainer.appendChild(cardDiv);
            // Reproducir place.mp3 cortado a 0.35s para que no se solape
            {
                const s = sfx.place.cloneNode();
                s.volume = 0.5;
                s.play().catch(() => {});
                setTimeout(() => { s.pause(); s.currentTime = 0; }, 350);
            }

            // Colocar en el mazo apilado
            actualizarMazo();

            if (autoRevealActive && index === pack.length - 1) {
                setTimeout(() => scheduleNextAutoFlip(cardDivs, pack), 400);
            }
        }, index * 80);
    });
}

// Programa el volteo automático de la siguiente carta sin voltear
function scheduleNextAutoFlip(cardDivs, pack) {
    if (autoRevealTimeout) clearTimeout(autoRevealTimeout);
    if (!autoRevealActive) return;

    // El TOP del mazo es la ÚLTIMA carta sin voltear (mayor índice en el array)
    const sinVoltear = cardDivs.filter(({ div }) => !div.classList.contains('flipped'));
    if (sinVoltear.length === 0) return; // todas volteadas

    const top = sinVoltear[sinVoltear.length - 1]; // último = encima del mazo

    autoRevealTimeout = setTimeout(() => {
        if (!autoRevealActive) return;
        if (!top.div.classList.contains('flipped')) {
            top.div.dispatchEvent(new CustomEvent('flipme'));
        }
    }, 900);
}

function moveToSide(cardEl, index) {
    const isLeft = index < 5;
    const containerW = packContainer.offsetWidth;
    const cardW = cardEl.offsetWidth || 120;

    // En móvil (contenedor < 600px) usamos posicionamiento proporcional
    const isMobile = containerW < 600;

    let xPos, yPos, rotation, scale;

    if (isMobile) {
        // Desplazamiento lateral: ~30% del ancho del contenedor + pequeño escalonado
        const sideOffset = containerW * 0.30 + (index % 5) * 4;
        xPos = isLeft ? -sideOffset : sideOffset;
        // Escalonado vertical compacto para que no se salgan por arriba/abajo
        yPos = (index % 5) * (cardW * 0.45) - (cardW * 0.9);
        rotation = isLeft ? -8 : 8;
        scale = 0.48;
    } else {
        // PC: comportamiento original
        xPos = isLeft ? -350 - (index * 20) : 350 + ((index - 5) * 20);
        yPos = (index % 5) * 30 - 60;
        rotation = isLeft ? -10 : 10;
        scale = 0.7;
    }

    cardEl.style.transform = `translate(${xPos}px, ${yPos}px) scale(${scale}) rotate(${rotation}deg)`;
}

async function updatePriceLive(cardId, modalPriceTag, sellBtn, backupPrice) {
    console.log(`API: Actualizando precio para ${cardId}...`);
    modalPriceTag.innerText = "Buscando...";
    const refreshBtn = document.getElementById('refresh-price-btn');
    if (refreshBtn) {
        refreshBtn.style.opacity = "0.5";
        refreshBtn.disabled = true;
    }

    try {
        const response = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`, {
            headers: { 'X-Api-Key': '87c51e43d0ad030821add2c09bc0768628d9747e94c04ce419eea3d2a4741532' }
        });
        const json = await response.json();
        const card = json.data;

        // Usamos getBestPrice para tener la misma lógica que al abrir el sobre
        let newPrice = getBestPrice(card);

        // Si getBestPrice devuelve el fallback y tenemos backupPrice razonable, comparamos
        // y nos quedamos con el mayor para no degradar un precio que ya teníamos bien
        if (backupPrice && backupPrice > newPrice) {
            // Solo aceptamos el backup si es coherente con la rareza (no sospechoso)
            const r = (card.rarity || '').toLowerCase();
            const isSuspicious = (
                (r.includes('secret') || r.includes('ultra') || r.includes('illustration')) 
                && backupPrice > 500
            );
            if (!isSuspicious) newPrice = backupPrice;
        }

        modalPriceTag.innerText = `$${newPrice.toFixed(2)}`;
        modalPriceTag.style.color = "#00ff00";

        if (sellBtn) {
            sellBtn.innerText = `VENDER POR $${newPrice.toFixed(2)}`;
            sellBtn.onclick = () => ejecutarVenta(card, newPrice);
        }

        // Guardamos el precio actualizado en el inventario
        const inv = getInventoryData();
        if (inv.owned_cards[cardId]) {
            inv.owned_cards[cardId].lastPrice = newPrice;
            saveInventoryData(inv);
        }

        console.log(`Precio actualizado para ${cardId}: $${newPrice.toFixed(2)}`);

    } catch (e) {
        console.error("Error actualizando precio:", e);
        // Si falla la red, mantenemos el precio que tenía
        modalPriceTag.innerText = `$${backupPrice.toFixed(2)}`;
        modalPriceTag.style.color = "#ffeb3b"; // amarillo = dato viejo
    } finally {
        if (refreshBtn) {
            refreshBtn.style.opacity = "1";
            refreshBtn.disabled = false;
        }
    }
}

function updateOpenButton() {
    if (openBtn) {
        openBtn.disabled = false;
        openBtn.innerText = `Abrir Sobre ($${currentPackPrice.toFixed(2)})`;
    }
    const btn5  = document.getElementById('open-5-btn');
    const btn10 = document.getElementById('open-10-btn');
    if (btn5)  { btn5.disabled  = false; btn5.innerText  = `Abrir x5 ($${(currentPackPrice * 5).toFixed(2)})`; }
    if (btn10) { btn10.disabled = false; btn10.innerText = `Abrir x10 ($${(currentPackPrice * 10).toFixed(2)})`; }
}

function openZoom(card, price, canSell) {

    // Limpiar partículas PSA si quedaron de un zoom anterior
    removePSAParticles();
    document.querySelector('.modal-content')?.classList.remove('psa-10-zoom-effect');

    // Limpiar elementos del zoom anterior
    const psaActions = document.getElementById('psa-actions');
    if (psaActions) psaActions.remove();

    // Restaurar scroll normal del overlay (PSA lo cambia)
    modalOverlay.style.overflowY = '';
    modalOverlay.style.alignItems = 'center';

    zoomedCard.style.backgroundImage = `url('${card.images.large}')`;
    modalOverlay.style.display = 'flex';
    
    let currentPrice = price || 0;
    if (currentPrice === 0) {
        const data = getInventoryData();
        currentPrice = data.owned_cards[card.id]?.lastPrice || 1.50;
    }


    // --- ETIQUETA PEQUEÑA (TAMAÑO AJUSTADO TOTAL) ---
    const oldTag = document.getElementById('modal-price-tag');
    if (oldTag) oldTag.remove();

    let modalPriceTag = document.createElement('div');
    modalPriceTag.id = 'modal-price-tag';
    modalPriceTag.innerText = `$${currentPrice.toFixed(2)}`;

    Object.assign(modalPriceTag.style, {
        position: 'absolute',
        top: '-50px',
        left: '-90px',          // Fuera de la carta a la izquierda
        
        // Ajuste de tamaño (Fit total)
        width: 'fit-content',
        height: 'fit-content',  // Forzamos que no se estire hacia abajo
        minHeight: 'auto',      // Resetea cualquier mínimo que pueda heredar
        
        backgroundColor: '#28a745',
        color: 'white',
        padding: '4px 8px',     // Espaciado interno pequeño
        borderRadius: '4px',
        fontSize: '20px',
        fontWeight: 'bold',
        zIndex: '1000',
        
        boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
        display: 'block',
        lineHeight: '1',        // Asegura que el alto sea solo el de la línea de texto
        alignSelf: 'flex-start' // IMPORTANTE: Evita que el Flexbox padre lo estire
    });

    document.querySelector('.modal-content').appendChild(modalPriceTag);


    // 2. Tools (Lápiz y Refresh)
    let toolsContainer = document.getElementById('modal-tools') || document.createElement('div');
    toolsContainer.id = 'modal-tools';
    if (!toolsContainer.parentNode) document.querySelector('.modal-content').appendChild(toolsContainer);
    toolsContainer.innerHTML = '';

    // 3. Botón de Vender
    let sellBtn = document.getElementById('sell-button') || document.createElement('button');
    sellBtn.id = 'sell-button';
    if (!sellBtn.parentNode) document.querySelector('.modal-content').appendChild(sellBtn);

    let marketLink = document.getElementById('market-link-btn');

    if (canSell) {
        sellBtn.style.display = 'block';
        sellBtn.innerText = `VENDER POR $${currentPrice.toFixed(2)}`;
        sellBtn.onclick = () => ejecutarVenta(card, currentPrice);
        sellBtn.style.marginBottom = "10px"; // Separación del botón de PSA

        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-price-btn';
        refreshBtn.innerHTML = '↻';
        refreshBtn.onclick = (e) => { e.stopPropagation(); updatePriceLive(card.id, modalPriceTag, sellBtn, currentPrice); };
        toolsContainer.appendChild(refreshBtn);

        // Botón de edición manual eliminado (opción D: precios automáticos)

        // Link de CardMarket
        if (card.cardmarket?.url) {
            if (!marketLink) {
                marketLink = document.createElement('a');
                marketLink.id = 'market-link-btn';
                marketLink.target = "_blank";
                document.querySelector('.modal-content').appendChild(marketLink);
            }
            marketLink.href = card.cardmarket.url;
            marketLink.innerText = "Ver en CardMarket ↗";
            marketLink.style.display = 'block';
            marketLink.style.marginTop = "15px"; // Lo alejamos de los botones de acción
        } else if (marketLink) {
            marketLink.style.display = 'none';
        }
        
    } else {
        sellBtn.style.display = 'none';
        if (marketLink) marketLink.style.display = 'none';
    }

    // --- BOTÓN DE GRADEO PSA ---
    if (canSell) {
        const oldBtn = document.getElementById('grade-psa-btn');
        if (oldBtn) oldBtn.remove();

        const gradeBtn = document.createElement('button');
        gradeBtn.id = 'grade-psa-btn';
        gradeBtn.innerText = "ENVIAR A PSA ($15.00)";
        
        gradeBtn.style.cssText = `
            background: #d10000; 
            color: white; 
            width: 100%; 
            padding: 10px; 
            margin-top: 5px; 
            border: none; 
            border-radius: 5px; 
            font-weight: bold; 
            cursor: pointer;
            text-transform: uppercase;
        `;

        gradeBtn.onclick = () => {
            if (confirm("¿Quieres enviar esta carta a PSA por $15.00?")) {
                const res = gradeCard(card);
                if (res.success) {
                    alert(`¡Resultado: PSA ${res.grade}!`);
                    modalOverlay.style.display = 'none';
                    refreshUI();
                    renderAlbum();
                } else {
                    alert(res.msg);
                }
            }
        };

        // TRUCO: Lo insertamos justo después del botón de Vender para que no se pierda al final
        sellBtn.insertAdjacentElement('afterend', gradeBtn);
    }
}

window.openZoomPSA = function(card, slab, index) {

    zoomedCard.style.backgroundImage = `url('${card.images.large}')`;
    modalOverlay.style.display = 'flex';

    // Activar scroll para PSA (la info es más larga que la pantalla en móvil)
    modalOverlay.style.overflowY = 'auto';
    modalOverlay.style.alignItems = 'flex-start';
    modalOverlay.style.paddingTop = '30px';
    modalOverlay.style.paddingBottom = '60px';

    const modalContent = document.querySelector('.modal-content');

    // Limpieza total
    modalContent.classList.remove('psa-10-zoom-effect');
    removePSAParticles();

    const elementsToRemove = ['modal-price-tag', 'modal-tools', 'psa-actions', 'normal-actions',
        'grade-psa-btn', 'sell-button', 'market-link-btn', 'regrade-tools-container'];
    elementsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    // 2. ACTIVAR EFECTOS SI ES UN 10 (Partículas en el fondo)
    if (slab.grade === 10) {
        modalContent.classList.add('psa-10-zoom-effect');
        createPSAParticles(); // Activamos el polvo de estrellas dorado
    }

    // Nueva lógica de multiplicadores PSA
    let multi = 1;
    if (slab.grade === 10) multi = 10;
    else if (slab.grade === 9) multi = 3;
    else if (slab.grade === 8) multi = 1.5;
    else if (slab.grade === 7) multi = 1;
    else if (slab.grade === 6) multi = 0.85; // Empieza a valer menos
    else if (slab.grade === 5) multi = 0.7;
    else if (slab.grade === 4) multi = 0.5;
    else if (slab.grade <= 3) multi = 0.3;  // Nota muy baja, gran penalización

    const currentPrice = slab.basePrice * multi;

    const psaContainer = document.createElement('div');
    psaContainer.id = 'psa-actions';
    psaContainer.style.cssText = "width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 15px;";
    
    // MANTENEMOS TU DISEÑO DORADO DE CABECERA
    const headerStyle = slab.grade === 10 
        ? "background: linear-gradient(45deg, #bf953f, #fcf6ba, #b38728, #fcf6ba, #aa771c); box-shadow: 0 0 15px rgba(212, 175, 55, 0.8);" 
        : "background: #d10000;";

    psaContainer.innerHTML = `
        <div style="${headerStyle} color: ${slab.grade === 10 ? '#000' : '#fff'}; padding: 10px; border-radius: 5px; display: flex; justify-content: center; align-items: center; position: relative;">
            <div style="text-align: center;">
                <span style="font-size: 0.7rem; display: block; opacity: 0.9; text-transform: uppercase; font-weight: bold;">Certificación Máxima</span>
                <b style="font-size: 1.6rem; letter-spacing: 1px;">PSA ${slab.grade}</b>
            </div>

            ${slab.attempts < 3 ? `
                <button onclick="event.stopPropagation(); handleRegradePSA(${index})" 
                    style="position: absolute; right: 10px; background: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    🔄
                </button>
            ` : ''}
        </div>

        <div style="background: #1a1a1a; border: 1px solid ${slab.grade === 10 ? '#bf953f' : '#444'}; padding: 12px; border-radius: 5px; text-align: center;">
            <div style="color: #28a745; font-weight: bold; font-size: 1.2rem; margin-bottom: 5px;">
                Valor de Colección: $${currentPrice.toFixed(2)}
            </div>
            <div style="color: gold; font-size: 0.65rem; border-top: 1px solid #333; margin-top: 5px; padding-top: 8px; display: flex; justify-content: space-around;">
                <span>CERT: #${slab.certNumber}</span>
                <span>INTENTOS: ${slab.attempts}/3</span>
            </div>
        </div>
        
        <button onclick="handleAuctionPSA(${index})" style="background: gold; color: black; width: 100%; padding: 12px; font-weight: bold; border-radius: 5px; cursor: pointer; border: none; text-transform: uppercase;">
            Subastar Gema Mint
        </button>
    `;

    modalContent.appendChild(psaContainer);
};

// --- SISTEMA DE PARTÍCULAS DORADAS PSA 10 ---
function createPSAParticles() {
    const overlay = document.getElementById('modal-overlay');

    const particleContainer = document.createElement('div');
    particleContainer.id = 'psa-particle-container';
    particleContainer.style.cssText = `
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none; z-index: 2001;
        overflow: hidden;
    `;
    overlay.appendChild(particleContainer);

    const NUM_PARTICLES = 80;

    for (let i = 0; i < NUM_PARTICLES; i++) {
        const particle = document.createElement('div');

        // Tipos variados: punto, diamante, estrella
        const tipo = Math.random();
        if (tipo < 0.6) {
            // Punto dorado (mayoría)
            particle.className = 'psa-particle';
            const size = Math.random() * 5 + 2; // más grande: 2-7px
            particle.style.width  = size + 'px';
            particle.style.height = size + 'px';
            particle.style.borderRadius = '50%';
        } else if (tipo < 0.85) {
            // Destello alargado (rayo de luz)
            particle.className = 'psa-particle';
            particle.style.width  = (Math.random() * 2 + 1) + 'px';
            particle.style.height = (Math.random() * 12 + 6) + 'px';
            particle.style.borderRadius = '50%';
            particle.style.transform = `rotate(${Math.random() * 360}deg)`;
        } else {
            // Brillo grande difuso
            particle.className = 'psa-particle';
            const size = Math.random() * 8 + 4;
            particle.style.width  = size + 'px';
            particle.style.height = size + 'px';
            particle.style.borderRadius = '50%';
            particle.style.filter = 'blur(2px)';
        }

        particle.style.left   = Math.random() * 100 + '%';
        particle.style.top    = Math.random() * 110 + '%'; // algunas empiezan fuera de pantalla
        particle.style.opacity = (Math.random() * 0.6 + 0.2).toString(); // 0.2 - 0.8

        // Velocidad variada: partículas lentas y rápidas
        const speed = Math.random() * 8 + 4; // 4s - 12s
        particle.style.animation      = `psa-particle-float ${speed}s ease-in-out infinite`;
        particle.style.animationDelay = (Math.random() * 6) + 's';

        particleContainer.appendChild(particle);
    }
}

function removePSAParticles() {
    const container = document.getElementById('psa-particle-container');
    if (container) container.remove();
}

function ejecutarVenta(card, precio) {
    const data = getInventoryData();
    const cantPoseida = data.owned_cards[card.id]?.quantity || 0;
    if (cantPoseida <= 0) return;

    let cantidadAVender = 1;
    if (cantPoseida > 1) {
        const input = prompt(`Tienes ${cantPoseida} copias. ¿Cuántas quieres vender?`, cantPoseida);
        if (input === null) return;
        cantidadAVender = parseInt(input);
    } else {
        if (!confirm(`¿Vender esta carta por $${precio.toFixed(2)}?`)) return;
    }

    if (isNaN(cantidadAVender) || cantidadAVender <= 0 || cantidadAVender > cantPoseida) {
        alert("Cantidad no válida."); return;
    }

    if (sellCard(card.id, precio, cantidadAVender)) {
        modalOverlay.style.display = 'none';
        refreshUI();
        if (collectionProgress.innerText.includes("Top")) renderTopValuableCards();
        else renderAlbum();
    }
}


// Eventos Finales
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        modalOverlay.style.display = 'none';
        // Limpiar partículas y restaurar overlay a estado neutro
        removePSAParticles();
        document.querySelector('.modal-content')?.classList.remove('psa-10-zoom-effect');
        modalOverlay.style.overflowY = '';
        modalOverlay.style.alignItems = '';
        modalOverlay.style.paddingTop = '';
        modalOverlay.style.paddingBottom = '';
    }
});
modalOverlay.addEventListener('mousemove', (e) => {
    if (modalOverlay.style.display !== 'flex') return;
    const xRotation = ((e.clientY / window.innerHeight) - 0.5) * -30;
    const yRotation = ((e.clientX / window.innerWidth) - 0.5) * 30;
    zoomedCard.style.transform = `rotateX(${xRotation}deg) rotateY(${yRotation}deg)`;
});

setSelector.addEventListener('change', initSet);

async function startApp() {
    await loadSetsIntoSelector();
    refreshUI();

    // Restaurar el último set usado si existe
    const lastSet = localStorage.getItem('pokesim_last_set');
    if (lastSet && setSelector) {
        // Buscar la opción en el selector
        const opt = [...setSelector.options].find(o => o.value === lastSet);
        if (opt) {
            setSelector.value = lastSet;
            // Lanzar initSet para cargar los datos
            setTimeout(() => initSet(), 100);
        }
    }
}

startApp();

applyPassiveIncome();

function applyPassiveIncome() {
    const data = getInventoryData();
    const ahora = Date.now();
    
    // Si por alguna razón no existe el registro del tiempo, lo creamos
    if (!data.last_income_check) {
        data.last_income_check = ahora;
        saveInventoryData(data);
        return;
    }

    // 1. CALCULO OFFLINE (Cuando vuelves a la web)
    const diferenciaMs = ahora - data.last_income_check;
    let minutosPasados = Math.floor(diferenciaMs / 60000);

    if (minutosPasados >= 1) {
        // Ponemos un tope de 180 minutos (3 horas = $180) para evitar excesos
        if (minutosPasados > 180) minutosPasados = 180;

        const dineroGanado = minutosPasados * 1.00;
        updateWallet(dineroGanado);
        
        // Actualizamos la marca de tiempo al momento actual
        data.last_income_check = ahora;
        saveInventoryData(data);
        
        console.log(`Ingreso pasivo: +$${dineroGanado} por ${minutosPasados} min.`);
        refreshUI();
        // Toast de bienvenida con el ingreso offline
        setTimeout(() => {
            showToast(`💰 +$${dineroGanado.toFixed(2)} — bienvenido de vuelta (${minutosPasados} min)`, 'gold', 5000);
        }, 1500); // pequeño delay para que la UI esté lista
    }

    // 2. CALCULO ONLINE (Mientras tienes la pestaña abierta)
    setInterval(() => {
        updateWallet(1.00);
        const currentData = getInventoryData();
        currentData.last_income_check = Date.now();
        saveInventoryData(currentData);
        refreshUI();
        showToast('+$1.00 ingreso pasivo', 'gold', 2000);
    }, 60000);
}

let activeAlbum = 'normal'; // Empezamos viendo el normal

document.getElementById('btn-view-normal').onclick = () => {
    activeAlbum = 'normal';
    document.getElementById('btn-view-normal').style.background = '#2a75bb';
    document.getElementById('btn-view-psa').style.background = '#333';
    renderAlbum();
};

document.getElementById('btn-view-psa').onclick = () => {
    activeAlbum = 'psa';
    document.getElementById('btn-view-psa').style.background = '#d10000';
    document.getElementById('btn-view-normal').style.background = '#333';
    renderAlbum();
};

// --- FUNCIONES DE INTERACCIÓN CÁMARA PSA ---

// --- FUNCIONES DE INTERACCIÓN CÁMARA PSA ---

window.handleAuctionPSA = function(index) {
    const data = getInventoryData();
    const slab = data.psa_cards[index];
    if (!slab) { console.error("No se encontró la carta PSA:", index); return; }

    // ── Confirmación previa (anti-missclick) ──────────────────────────────
    if (!confirm(`¿Seguro que quieres subastar el PSA ${slab.grade} de "${slab.cardDetails.name}"?\n\nUna vez iniciada la subasta no hay vuelta atrás.`)) return;

    // ── Calcular precio final ANTES de mostrar la cuenta atrás ────────────
    let multi = slab.grade === 10 ? 10 : slab.grade === 9 ? 3 : slab.grade === 8 ? 1.5 : slab.grade === 7 ? 1 : (slab.grade / 10 + 0.2);
    const baseValue = slab.basePrice * multi;

    // Resultado aleatorio con las probabilidades pedidas:
    //   5%  → x2 (guerra de pujas)
    //  25%  → entre 0.7 y 0.9  (salió barata)
    //  70%  → entre 0.9 y 1.2  (precio normal)
    const roll = Math.random();
    let finalBid;
    let outcome; // para el mensaje final
    if (roll < 0.05) {
        finalBid = baseValue * (1.8 + Math.random() * 0.4); // ~x2
        outcome = 'jackpot';
    } else if (roll < 0.30) {
        finalBid = baseValue * (0.7 + Math.random() * 0.2);
        outcome = 'bajo';
    } else {
        finalBid = baseValue * (0.9 + Math.random() * 0.3);
        outcome = 'normal';
    }

    // ── Eliminar carta del inventario YA (la subasta es irrevocable) ──────
    data.psa_cards.splice(index, 1);
    saveInventoryData(data);

    // ── Cerrar el modal de zoom y mostrar la pantalla de subasta ─────────
    modalOverlay.style.display = 'none';

    // Crear overlay de subasta
    const auctionOverlay = document.createElement('div');
    auctionOverlay.id = 'auction-overlay';
    auctionOverlay.style.cssText = `
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(0,0,0,0.96);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 20px; padding: 30px; box-sizing: border-box;
    `;

    const isGem = slab.grade === 10;
    const gradeColor = isGem ? '#fcf6ba' : '#fff';
    const accentColor = isGem ? '#bf953f' : '#d10000';

    auctionOverlay.innerHTML = `
        <div style="text-align:center; max-width:380px; width:100%;">
            <div style="font-size:0.75rem; color:#aaa; text-transform:uppercase; letter-spacing:2px; margin-bottom:6px;">
                Subasta en curso
            </div>
            <div style="font-size:1.1rem; color:${gradeColor}; font-weight:bold; margin-bottom:4px;">
                PSA ${slab.grade} — ${slab.cardDetails.name}
            </div>

            <!-- Imagen de la carta -->
            <div style="
                width:160px; height:224px; margin:16px auto;
                background-image:url('${slab.cardDetails.images.large}');
                background-size:cover; background-position:center;
                border-radius:10px;
                box-shadow: 0 0 30px ${isGem ? 'rgba(212,175,55,0.6)' : 'rgba(209,0,0,0.4)'};
                border: 2px solid ${accentColor};
            "></div>

            <!-- Barra de progreso de la subasta -->
            <div style="background:#222; border-radius:20px; height:8px; width:100%; margin-bottom:12px; overflow:hidden;">
                <div id="auction-progress-bar" style="
                    height:100%; width:100%;
                    background: linear-gradient(90deg, ${accentColor}, #ffcb05);
                    border-radius:20px;
                    transition: width 1s linear;
                "></div>
            </div>

            <!-- Cuenta atrás -->
            <div style="display:flex; align-items:baseline; justify-content:center; gap:8px; margin-bottom:8px;">
                <span style="font-size:3.5rem; font-weight:bold; color:#fff; line-height:1;" id="auction-countdown">8</span>
                <span style="color:#aaa; font-size:0.9rem;">segundos</span>
            </div>

            <!-- Mensajes de pujas en tiempo real -->
            <div id="auction-bids" style="
                font-size:0.8rem; color:#aaa; min-height:48px;
                border: 1px solid #333; border-radius:6px;
                padding:8px 12px; background:#111;
                text-align:left; line-height:1.6;
            ">Esperando pujadores...</div>
        </div>
    `;

    document.body.appendChild(auctionOverlay);

    // ── Mensajes falsos de puja para ambientar ────────────────────────────
    const bidMessages = [
        `🔔 Trainer_99 ha pujado $${(finalBid * 0.55).toFixed(2)}`,
        `🔔 CollectorX ha pujado $${(finalBid * 0.68).toFixed(2)}`,
        `🔔 PokéMaster ha pujado $${(finalBid * 0.79).toFixed(2)}`,
        `🔔 Trainer_99 ha subido a $${(finalBid * 0.88).toFixed(2)}`,
        `🔔 NuevoPujador ha entrado: $${(finalBid * 0.94).toFixed(2)}`,
        outcome === 'jackpot'
            ? `🔥 ¡GUERRA DE PUJAS! Múltiples pujadores`
            : `🔔 Puja final: $${finalBid.toFixed(2)}`,
    ];

    const countdownEl  = document.getElementById('auction-countdown');
    const bidsEl       = document.getElementById('auction-bids');
    const progressBar  = document.getElementById('auction-progress-bar');
    const DURATION     = 8; // segundos totales
    let secondsLeft    = DURATION;

    // Animar la barra vaciándose
    requestAnimationFrame(() => {
        progressBar.style.transition = `width ${DURATION}s linear`;
        progressBar.style.width = '0%';
    });

    const interval = setInterval(() => {
        secondsLeft--;
        if (countdownEl) countdownEl.innerText = secondsLeft;

        // Mostrar mensaje de puja según el segundo
        const msgIndex = DURATION - 1 - secondsLeft;
        if (msgIndex >= 0 && msgIndex < bidMessages.length) {
            if (bidsEl) bidsEl.innerHTML = bidMessages.slice(0, msgIndex + 1)
                .map(m => `<div>${m}</div>`).join('');
            // Scroll al último mensaje
            if (bidsEl) bidsEl.scrollTop = bidsEl.scrollHeight;
        }

        if (secondsLeft <= 0) {
            clearInterval(interval);
            finishAuction();
        }
    }, 1000);

    function finishAuction() {
        // Cobrar al jugador
        const freshData = getInventoryData();
        freshData.wallet += finalBid;
        saveInventoryData(freshData);
        refreshUI();

        // Transformar overlay en pantalla de resultado
        const outcomeColor  = outcome === 'jackpot' ? '#ffcb05' : outcome === 'bajo' ? '#ff7043' : '#4caf50';
        const outcomeLabel  = outcome === 'jackpot' ? '🔥 ¡GUERRA DE PUJAS!' : outcome === 'bajo' ? '📉 Subasta tranquila' : '🏆 ¡Vendida!';
        const outcomeDetail = outcome === 'jackpot'
            ? 'Dos coleccionistas se disputaron tu carta. ¡Precio histórico!'
            : outcome === 'bajo'
            ? 'Poca demanda hoy. Se vendió por menos de lo esperado.'
            : 'Subasta completada con normalidad.';

        auctionOverlay.innerHTML = `
            <div style="text-align:center; max-width:380px; width:100%;">
                <div style="font-size:2rem; margin-bottom:10px;">${outcomeLabel}</div>
                <div style="font-size:0.9rem; color:#aaa; margin-bottom:20px;">${outcomeDetail}</div>

                <div style="
                    background:#111; border:2px solid ${outcomeColor};
                    border-radius:12px; padding:20px; margin-bottom:20px;
                    box-shadow: 0 0 20px ${outcomeColor}44;
                ">
                    <div style="font-size:0.7rem; color:#aaa; text-transform:uppercase; letter-spacing:1px;">Precio final</div>
                    <div style="font-size:3rem; font-weight:bold; color:${outcomeColor}; line-height:1.1;">
                        $${finalBid.toFixed(2)}
                    </div>
                    <div style="font-size:0.8rem; color:#888; margin-top:6px;">
                        PSA ${slab.grade} · ${slab.cardDetails.name}
                    </div>
                </div>

                <button id="auction-close-btn" style="
                    width:100%; padding:14px;
                    background:var(--gold); color:#000;
                    border:none; border-radius:8px;
                    font-weight:bold; font-size:1rem;
                    cursor:pointer; text-transform:uppercase;
                ">Cobrar y continuar</button>
            </div>
        `;

        document.getElementById('auction-close-btn').onclick = () => {
            auctionOverlay.remove();
            renderAlbum();
        };
    }
};

window.handleRegradePSA = function(index) {
    const data = getInventoryData();
    const slab = data.psa_cards[index];
    const REGRADE_COST = 15.00;

    if (data.wallet < REGRADE_COST) {
        alert("No tienes suficiente dinero para re-gradear ($15.00)");
        return;
    }

    if (confirm(`¿Quieres intentar re-gradear esta carta por $15.00?\nIntentos actuales: ${slab.attempts}/3`)) {
        // 1. Cobrar
        data.wallet -= REGRADE_COST;
        slab.attempts += 1;

        // 2. Nueva nota (Usando los porcentajes que ajustamos antes)
        const rand = Math.random() * 100;
        let newGrade;
        if (rand > 90) newGrade = 10;
        else if (rand > 70) newGrade = 9;
        else if (rand > 40) newGrade = 8;
        else newGrade = Math.floor(Math.random() * 7) + 1;

        // 3. Solo actualizamos si la nota es igual o mejor (PSA nunca baja la nota en re-grade por cortesía aquí)
        if (newGrade > slab.grade) {
            alert(`¡ INCREÍBLE ! La nota ha subido de PSA ${slab.grade} a PSA ${newGrade}`);
            slab.grade = newGrade;
        } else {
            alert(`La oficina de PSA mantiene la nota en PSA ${slab.grade}. No ha habido suerte.`);
        }

        saveInventoryData(data);
        modalOverlay.style.display = 'none';
        refreshUI();
        renderAlbum();
    }
};

async function initializeApp() {
    console.log("Inicializando aplicación...");
    const sets = await fetchAllSets();
    
    if (sets) {
            // 1. Insertamos la opción por defecto primero
            setSelector.innerHTML = '<option value="" disabled selected>-- Selecciona un Set --</option>';
            setSelector.innerHTML += sets.map(set => 
            `<option value="${set.id}">${set.name}</option>`
        ).join('');

        // 3. (Opcional) Si quieres que NO cargue el primero por defecto:
        currentSetData = null; 
        openBtn.disabled = true;
        openBtn.innerText = "Selecciona un set";
        
        // El resto de tu lógica (event listeners, etc.)
        setSelector.addEventListener('change', async (e) => {
            const setId = e.target.value;
            if (!setId) return; // No hace nada si elige la opción neutra
            
            openBtn.innerText = "Cargando set...";
            openBtn.disabled = true;
            
            const data = await fetchSetData(setId);
            if (data) {
                currentSetData = data;
                currentPackPrice = getPackPrice(setId);
                openBtn.innerText = `Abrir sobre ($${currentPackPrice.toFixed(2)})`;
                openBtn.disabled = false;
                renderAlbum();
            }
        });
    }
}

// ═══════════════════════════════════════════
//  SPACEBAR + AUTO-REVEAL
// ═══════════════════════════════════════════

// Barra espaciadora → voltea la siguiente carta
document.addEventListener('keydown', (e) => {
    // Solo actúa si el modal está cerrado y hay cartas en el tapete
    if (e.code !== 'Space') return;
    if (modalOverlay.style.display === 'flex') return;
    if (albumScreen.style.display === 'block') return;

    e.preventDefault(); // evita scroll de página
    if (flipNextCard) flipNextCard();
});

// Botón Auto-Reveal: se inyecta junto al botón de abrir sobre
(function createAutoRevealButton() {
    const btn = document.createElement('button');
    btn.id = 'auto-reveal-btn';
    btn.innerText = '⚡ Auto: OFF';
    btn.title = 'Activar/desactivar volteo automático de cartas';
    btn.style.cssText = `
        background: #333;
        color: #aaa;
        border: 1px solid #555;
        padding: 10px 15px;
        border-radius: 8px;
        font-size: 0.85rem;
        font-weight: bold;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
    `;

    btn.addEventListener('click', () => {
        autoRevealActive = !autoRevealActive;

        if (autoRevealActive) {
            btn.innerText = '⚡ Auto: ON';
            btn.style.background = '#2a75bb';
            btn.style.color = 'white';
            btn.style.border = '1px solid #4a95db';
            btn.style.boxShadow = '0 0 10px rgba(42,117,187,0.4)';
            // Si ya hay cartas en el tapete sin voltear, arrancamos ya
            if (flipNextCard) flipNextCard();
        } else {
            btn.innerText = '⚡ Auto: OFF';
            btn.style.background = '#333';
            btn.style.color = '#aaa';
            btn.style.border = '1px solid #555';
            btn.style.boxShadow = 'none';
            if (autoRevealTimeout) {
                clearTimeout(autoRevealTimeout);
                autoRevealTimeout = null;
            }
        }
    });

    // Insertamos el botón justo después del botón de abrir sobre
    openBtn.insertAdjacentElement('afterend', btn);
})();
