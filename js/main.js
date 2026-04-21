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
const invCountDisplay = document.getElementById('inventory-count');
const balanceDisplay = document.getElementById('balance');
const modalOverlay = document.getElementById('modal-overlay');
const zoomedCard = document.getElementById('zoomed-card');

let currentPackPrice = 5.00;
let currentSetData = null;
let currentPackProfit = 0;

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
    flip: new Audio('assets/sounds/flip.mp3'),
    hit: new Audio('assets/sounds/hit.mp3'),           // +$5
    rare: new Audio('assets/sounds/rare_hit.mp3'),     // +$50
    epic: new Audio('assets/sounds/legendary_hit.mp3'), // +$100
    
    play(sound) {
        if (this[sound]) {
            const s = this[sound].cloneNode(); // Clonamos para permitir sonidos simultáneos
            s.volume = 0.6;
            s.play().catch(e => console.warn("Audio bloqueado por el navegador:", e));
        }
    }
};

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

    try {
        const response = await fetchSetData(setId);

        // Verificación anti-carrera: si el selector ya tiene otro valor
        // (el usuario consiguió cambiarlo antes de que bloqueáramos), abortamos
        // esta carga y dejamos que el nuevo 'change' lo gestione.
        if (setSelector.value !== setId) {
            console.warn("initSet: set cambiado durante la carga, abortando.");
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

        openBtn.disabled = false;
        openBtn.innerText = `Abrir Sobre ($${currentPackPrice.toFixed(2)})`;

        const costDisplay = document.getElementById('current-pack-cost');
        if (costDisplay) costDisplay.innerText = `$${currentPackPrice.toFixed(2)}`;

        if (albumScreen.style.display === 'block') renderAlbum();
        refreshUI();

    } catch (error) {
        console.error("Error en initSet:", error);
        openBtn.innerText = "Error al cargar — reintenta";
        openBtn.disabled = false;
    } finally {
        // Siempre desbloqueamos los selectores al terminar (bien o mal)
        setSelector.disabled = false;
        orderSelector.disabled = false;
    }

    updateOpenButton();
    refreshUI();
}


// --- LÓGICA DEL ÁLBUM ---

// Escuchar cuando el usuario escribe en el buscador
albumSearch.addEventListener('input', () => {
    if (albumScreen.style.display === 'block') {
        renderAlbum();
    }
});


// Escuchar cuando el usuario escribe en el buscador
albumSearch.addEventListener('input', () => {
    if (albumScreen.style.display === 'block') {
        renderAlbum();
    }
});

function renderAlbum() {
    // Si estamos en normal, necesitamos el set. Si estamos en PSA, ya no.
    if (activeAlbum === 'normal' && !currentSetData) return;

    const psaFilters = document.getElementById('psa-filters');
    if (activeAlbum === 'normal') {
        if (psaFilters) psaFilters.style.display = 'none';
    } else {
        if (psaFilters) psaFilters.style.display = 'flex';
    }

    const data = getInventoryData();
    const searchTerm = albumSearch.value.toLowerCase();
    albumGrid.innerHTML = '';
    let ownedCount = 0;

    if (activeAlbum === 'normal') {
        const allCardsInSet = Array.isArray(currentSetData) ? currentSetData : (currentSetData.data || []);
        
        allCardsInSet.forEach(card => {
            if (!card.name.toLowerCase().includes(searchTerm)) return;
            
            // --- LÓGICA PARA EL BUSCADOR GLOBAL ---

            // Cuando recorras las cartas en tu buscador:
            const item = data.owned_cards[card.id];
            // ESTO ES LO QUE FALTA EN LA BÚSQUEDA GLOBAL:
            const hasInPSA = data.psa_cards && data.psa_cards.some(slab => slab.cardId === card.id);

            if (item && item.quantity > 0) {
                // Si la tienes normal
                albumGrid.appendChild(createNormalSlot(card, item));
            } else if (hasInPSA) {
                // CASO: LA TIENES EN PSA
                ownedCount++; 
                const slot = createMissingSlot(card);
                
                // --- AJUSTES PARA PERTENENCIA (COLOR TOTAL) ---
                slot.style.opacity = "1";
                slot.style.position = "relative";
                slot.style.border = "2px solid #ffcb05"; // Marco dorado para que resalte
                slot.style.boxShadow = "0 0 10px rgba(255, 203, 5, 0.3)";
                
                // Localizamos la imagen dentro del slot y le quitamos el filtro gris
                const imgDiv = slot.querySelector('.album-card-img');
                if (imgDiv) {
                    imgDiv.style.filter = "none";      // <--- ESTO QUITA EL GRIS
                    imgDiv.style.brightness = "1";    // <--- ESTO LE DA LUZ TOTAL
                }

                // Mantenemos la etiqueta dorada para saber que es PSA
                const badge = document.createElement('div');
                badge.innerText = "EN PSA";
                badge.style.cssText = `
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    background: #ffcb05;
                    color: #000;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 4px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    z-index: 10;
                    border: 1px solid black;
                `;
                slot.appendChild(badge);
                
                albumGrid.appendChild(slot);
            } else {
                // Si no la tienes de ninguna forma
                albumGrid.appendChild(createMissingSlot(card));
            }
        });
        collectionProgress.innerText = `${ownedCount} / ${allCardsInSet.length}`;
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
            const getVal = (s) => s.basePrice * (s.grade === 10 ? 10 : s.grade === 9 ? 3 : s.grade === 8 ? 1.5 : 1);
            if (orderType === 'price-desc') return getVal(b) - getVal(a);
            if (orderType === 'price-asc') return getVal(a) - getVal(b);
            if (orderType === 'grade-desc') return b.grade - a.grade;
            if (orderType === 'grade-asc') return a.grade - b.grade;
            return 0; 
        });

        filteredPSA.forEach((slab) => {
            ownedCount++;
            const originalIndex = data.psa_cards.indexOf(slab);
            albumGrid.appendChild(createPSASlot(slab.cardDetails, slab, originalIndex));
        });

        collectionProgress.innerText = `Total Graded: ${ownedCount}`;
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
    slot.innerHTML = `
        <div class="album-card-img" style="background-image: url('${card.images.small}')">
            <div class="card-count">x${item.quantity}</div>
        </div>
        <div class="album-card-info" style="text-align: center; padding: 5px;">
            <p style="font-size: 0.7rem; margin: 0; color: white;">${card.name}</p>
            <p style="font-size: 0.8rem; margin: 2px 0; color: var(--success); font-weight: bold;">
                $${item.lastPrice.toFixed(2)}
            </p>
        </div>
    `;
    // Al hacer click, abre tu zoom original (el que tiene el lápiz y el refresh)
    slot.onclick = () => openZoom(card, item.lastPrice, true);
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

openBtn.addEventListener('click', () => {
    if (!currentSetData) return;

    // Obtenemos las cartas disponibles
    const cardsArray = Array.isArray(currentSetData) ? currentSetData : (currentSetData.data || []);
    if (cardsArray.length === 0) return;

    const data = getInventoryData();
    
    // Usamos el precio dinámico calculado en initSet
    const PRECIO_SOBRE = currentPackPrice; 

    if (data.wallet < PRECIO_SOBRE) {
        alert(`¡No tienes suficiente saldo! Necesitas $${PRECIO_SOBRE.toFixed(2)} para este sobre.`);
        return;
    }

    // --- BLOQUEO DE SEGURIDAD ---
    openBtn.disabled = true; 
    openBtn.innerText = "Abriendo sobre..."; 
    // ----------------------------

    updateWallet(-PRECIO_SOBRE); 
    refreshUI();
    
    currentPackProfit = 0; 
    const profitDisplay = document.getElementById('current-profit');
    if (profitDisplay) profitDisplay.innerText = "0.00";

    // --- CAMBIO CLAVE AQUÍ ---
    // Obtenemos el ID del set actual desde el selector
    const setId = document.getElementById('set-selector').value; 
    
    // Pasamos el ID a generatePack para que el filtro sea estricto
    const newPack = generatePack(cardsArray, setId);
    // --------------------------
    
    albumScreen.style.display = 'none';
    packContainer.style.display = 'flex';

    renderPack(newPack);

    // Arrancar auto-reveal si estaba activo
    // (scheduleNextAutoFlip se llama solo desde renderPack al terminar de repartir)
});

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

    const applyOrder = () => {
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

        // Siempre ponemos el placeholder primero
        setSelector.innerHTML = 
            '<option value="" disabled selected>--- Selecciona una promo ---</option>' +
            sortedSets.map(set => 
                `<option value="${set.id}">${set.name} - $${getPackPrice(set).toFixed(2)}</option>`
            ).join('');

        // Al reordenar, forzamos que el jugador vuelva a elegir conscientemente
        resetToPlaceholder();
    };

    orderSelector.addEventListener('change', applyOrder);
    applyOrder(); // Carga inicial: empieza siempre con el placeholder
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

function renderPack(pack) {
    packContainer.innerHTML = '';
    let cartasReveladas = 0;
    const cardDivs = []; // guardamos referencia a todos los divs para spacebar/auto

    // Función reutilizable que voltea UNA carta dado su div y datos
    function flipCard(cardDiv, card, index, realPrice) {
        if (cardDiv.classList.contains('flipped')) return; // ya volteada, nada que hacer

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
        if (cartasReveladas === pack.length) {
            openBtn.disabled = false;
            updateOpenButton();
        }

        currentPackProfit += realPrice;
        const profitDisplay = document.getElementById('current-profit');
        if (profitDisplay) profitDisplay.innerText = currentPackProfit.toFixed(2);

        addCardToInventory(card.id, realPrice);
        refreshUI();

        setTimeout(() => {
            cardDiv.style.pointerEvents = 'none';
            cardDiv.classList.add('aside');
            cardDiv.style.zIndex = "5";
            moveToSide(cardDiv, index);
            setTimeout(() => { cardDiv.style.pointerEvents = 'auto'; }, 800);

            // Si auto-reveal está activo, programamos la siguiente carta
            if (autoRevealActive) {
                scheduleNextAutoFlip(cardDivs, pack);
            }
        }, tiempoDeEspera);
    }

    // Expone al scope externo la función para voltear la próxima carta sin voltear
    flipNextCard = () => {
        const next = cardDivs.find(({ div }) => !div.classList.contains('flipped'));
        if (next) flipCard(next.div, next.card, next.index, next.realPrice);
    };

    pack.forEach((card, index) => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card dealing';
        cardDiv.style.zIndex = 100 - index;

        // --- CÁLCULO DE PRECIO ---
        const tcg = card.tcgplayer?.prices;
        const cmkt = card.cardmarket?.prices;
        const allPossiblePrices = [
            cmkt?.averageSellPrice, cmkt?.lowPrice,
            tcg?.holofoil?.market, tcg?.reverseHolofoil?.market,
            tcg?.normal?.market, tcg?.unlimitedHolofoil?.market
        ].filter(p => p !== undefined && p !== null && p > 0);

        let realPrice = allPossiblePrices.length > 0 ? Math.max(...allPossiblePrices) : 0;
        if (realPrice === 0) {
            const r = card.rarity ? card.rarity.toLowerCase() : "";
            if (r.includes('illustration') || r.includes('special') || r.includes('secret')) realPrice = 45.00;
            else if (r.includes('ultra') || r.includes('vmax') || r.includes('ex')) realPrice = 15.00;
            else if (r.includes('rare holo')) realPrice = 4.00;
            else if (r.includes('rare')) realPrice = 1.50;
            else realPrice = 0.15;
        }

        cardDiv.innerHTML = `
            <div class="card-inner">
                <div class="card-back"></div>
                <div class="card-front" style="background-image: url('${card.images.large}')"></div>
            </div>
            <div class="price-tag">$${realPrice.toFixed(2)}</div>
        `;

        // Guardamos referencia para spacebar y auto-reveal
        cardDivs.push({ div: cardDiv, card, index, realPrice });

        cardDiv.addEventListener('click', function () {
            if (!this.classList.contains('flipped')) {
                flipCard(this, card, index, realPrice);
            } else if (this.classList.contains('aside')) {
                openZoom(card, realPrice, false);
            }
        });

        setTimeout(() => {
            packContainer.appendChild(cardDiv);
            sfx.play('place');

            // Si auto-reveal estaba activo cuando se abrió el sobre, arrancamos tras repartir
            if (autoRevealActive && index === pack.length - 1) {
                scheduleNextAutoFlip(cardDivs, pack);
            }
        }, index * 100);
    });
}

// Programa el volteo automático de la siguiente carta sin voltear
function scheduleNextAutoFlip(cardDivs, pack) {
    if (autoRevealTimeout) clearTimeout(autoRevealTimeout);
    if (!autoRevealActive) return;

    const next = cardDivs.find(({ div }) => !div.classList.contains('flipped'));
    if (!next) return; // todas volteadas

    // Delay base entre cartas: 900ms. Se alarga si la anterior era hit legendario (ya gestionado en flipCard)
    autoRevealTimeout = setTimeout(() => {
        if (autoRevealActive) next.div.click();
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
    console.log(`API: Buscando precio para ${cardId}...`);
    modalPriceTag.innerText = "Buscando...";
    const refreshBtn = document.getElementById('refresh-price-btn');
    if (refreshBtn) refreshBtn.style.opacity = "0.5";

    try {
        const response = await fetch(`https://api.pokemontcg.io/v2/cards/${cardId}`, {
            headers: { 'X-Api-Key': '87c51e43d0ad030821add2c09bc0768628d9747e94c04ce419eea3d2a4741532' }
        });
        const json = await response.json();
        const card = json.data;
        const tcg = card.tcgplayer?.prices;
        const cmkt = card.cardmarket?.prices;
        const prices = [tcg?.holofoil?.market, tcg?.normal?.market, cmkt?.averageSellPrice].filter(p => p > 0);

        let newPrice = prices.length > 0 ? Math.max(...prices) : backupPrice;
        if (!newPrice || newPrice <= 0) newPrice = 1.50;

        modalPriceTag.innerText = `Market Value: $${newPrice.toFixed(2)}`;
        modalPriceTag.style.color = "#00ff00"; 

        if (sellBtn) {
            sellBtn.innerText = `VENDER POR $${newPrice.toFixed(2)}`;
            sellBtn.onclick = () => ejecutarVenta(card, newPrice);
        }

        const inv = getInventoryData();
        if (inv.owned_cards[cardId]) {
            inv.owned_cards[cardId].lastPrice = newPrice;
            saveInventoryData(inv);
        }
    } catch (e) {
        modalPriceTag.innerText = `Market Value: $${backupPrice.toFixed(2)}`;
    } finally {
        if (refreshBtn) refreshBtn.style.opacity = "1";
    }
}

function updateOpenButton() {
    if (openBtn) {
        openBtn.disabled = false;
        openBtn.innerText = `Abrir Sobre ($${currentPackPrice.toFixed(2)})`;
    }
}

function openZoom(card, price, canSell) {

    const psaActions = document.getElementById('psa-actions');
    if (psaActions) psaActions.remove();

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

        const editBtn = document.createElement('button');
        editBtn.id = 'edit-price-btn';
        editBtn.innerHTML = '✏️';
        editBtn.onclick = (e) => { e.stopPropagation(); editPriceManually(card.id, modalPriceTag, sellBtn); };
        toolsContainer.appendChild(editBtn);

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
    const modalContent = document.querySelector('.modal-content');

    // --- LIMPIEZA DE BOTONES DE VENTA NORMAL ---
    const sellBtn = document.getElementById('sell-button');
    if (sellBtn) sellBtn.style.display = 'none'; // Ocultamos el botón azul

    const toolsBtn = document.getElementById('modal-tools');
    if (toolsBtn) toolsBtn.style.display = 'none'; // Ocultamos herramientas (lápiz/refresh)
    
    const priceTag = document.getElementById('modal-price-tag');
    if (priceTag) priceTag.style.display = 'none';
    // 1. LIMPIEZA TOTAL Y QUITAR PARTÍCULAS PREVIAS
    modalContent.classList.remove('psa-10-zoom-effect');
    removePSAParticles(); // Limpiamos las partículas del fondo si las hubiera

    const elementsToRemove = ['modal-price-tag', 'modal-tools', 'psa-actions', 'grade-psa-btn', 'market-link-btn', 'regrade-tools-container'];
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
    const modalOverlay = document.getElementById('modal-overlay');
    
    // Creamos un contenedor para las partículas (para borrarlas fácil)
    const particleContainer = document.createElement('div');
    particleContainer.id = 'psa-particle-container';
    particleContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1;";
    modalOverlay.appendChild(particleContainer);

    const NUM_PARTICLES = 50;

    for (let i = 0; i < NUM_PARTICLES; i++) {
        const particle = document.createElement('div');
        particle.className = 'psa-particle';
        
        // Posición inicial aleatoria
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        
        // Tamaño aleatorio
        const size = Math.random() * 4 + 1;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        
        // Opacidad aleatoria
        particle.style.opacity = Math.random();
        
        // Animación aleatoria (velocidad y retraso)
        particle.style.animation = `psa-particle-float ${Math.random() * 10 + 5}s linear infinite`;
        particle.style.animationDelay = Math.random() * 5 + 's';

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
modalOverlay.addEventListener('click', (e) => { if(e.target === modalOverlay) modalOverlay.style.display = 'none'; });
modalOverlay.addEventListener('mousemove', (e) => {
    if (modalOverlay.style.display !== 'flex') return;
    const xRotation = ((e.clientY / window.innerHeight) - 0.5) * -30;
    const yRotation = ((e.clientX / window.innerWidth) - 0.5) * 30;
    zoomedCard.style.transform = `rotateX(${xRotation}deg) rotateY(${yRotation}deg)`;
});

setSelector.addEventListener('change', initSet);

async function startApp()
 { await loadSetsIntoSelector(); 
    refreshUI();
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
    }

    // 2. CALCULO ONLINE (Mientras tienes la pestaña abierta)
    setInterval(() => {
        updateWallet(1.00);
        
        // Actualizamos el tiempo en cada dólar para que si cierras justo después, esté al día
        const currentData = getInventoryData();
        currentData.last_income_check = Date.now();
        saveInventoryData(currentData);
        
        refreshUI();
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
    // Accedemos a la carta usando el índice que nos llega
    const slab = data.psa_cards[index];
    
    if (!slab) {
        console.error("No se encontró la carta PSA en el índice:", index);
        return;
    }

    // 1. Calcular el valor de la subasta (el multi que ya tenías)
    let multi = slab.grade >= 7 ? (slab.grade === 10 ? 10 : slab.grade === 9 ? 3 : 1.5) : (slab.grade / 10 + 0.2);
    if (slab.grade === 7) multi = 1;

    const baseValue = slab.basePrice * multi;
    const finalBid = baseValue * (0.9 + Math.random() * 0.3); // Variación de puja entre -10% y +20%

    // 2. Confirmación del usuario
    if (confirm(`La mejor puja actual por este PSA ${slab.grade} de ${slab.cardDetails.name} es de $${finalBid.toFixed(2)}.\n\n¿Aceptas la oferta?`)) {
        
        // 3. ACTUALIZACIÓN DEL INVENTARIO
        // Sumamos el dinero a la wallet
        data.wallet += finalBid;
        
        // Eliminamos la carta del array psa_cards usando el índice
        data.psa_cards.splice(index, 1);
        
        // 4. GUARDAR CAMBIOS
        saveInventoryData(data);
        
        // 5. REFRESCAR LA INTERFAZ
        alert(`¡Vendido! Has recibido $${finalBid.toFixed(2)} por tu PSA ${slab.grade}.`);
        
        // Cerramos el modal de zoom si estaba abierto
        modalOverlay.style.display = 'none';
        
        // Actualizamos los números en pantalla (dinero, etc)
        if (typeof refreshUI === 'function') refreshUI(); 
        
        // Refrescamos el álbum para que la carta desaparezca de la vista
        renderAlbum();
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