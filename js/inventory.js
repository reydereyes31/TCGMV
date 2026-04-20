// js/inventory.js


// Función interna para asegurar que siempre haya datos válidos
function initializeIfNeeded() {
    if (!localStorage.getItem('pokesim_data')) {
        const initialData = {
            wallet: 50.00,
            owned_cards: {},
            last_income_check: Date.now() // <--- AÑADE ESTA LÍNEA
        };
        localStorage.setItem('pokesim_data', JSON.stringify(initialData));
    }
}

export function getInventoryData() {
    initializeIfNeeded();
    try {
        const data = JSON.parse(localStorage.getItem('pokesim_data'));
        return data;
    } catch (e) {
        console.error("Error leyendo inventario, reseteando...");
        const resetData = { wallet: 50.00, owned_cards: {} };
        localStorage.setItem('pokesim_data', JSON.stringify(resetData));
        return resetData;
    }
}

export function saveInventoryData(data) {
    // UNIFICADO: Siempre usamos 'pokesim_data'
    localStorage.setItem('pokesim_data', JSON.stringify(data));
}

export function addCardToInventory(cardId, price) {
    let data = getInventoryData();
    
    // Si el precio es 0 aquí, el álbum NUNCA tendrá los 45$
    const safePrice = (price && price > 0) ? price : 0.15; 

    if (data.owned_cards[cardId]) {
        data.owned_cards[cardId].quantity += 1;
        data.owned_cards[cardId].lastPrice = safePrice; 
    } else {
        data.owned_cards[cardId] = {
            quantity: 1,
            lastPrice: safePrice
        };
    }
    saveInventoryData(data);
}

export function updateWallet(amount) {
    const data = getInventoryData();
    data.wallet += amount;
    
    // CORREGIDO: Usamos saveInventoryData para no equivocarnos de llave
    saveInventoryData(data);
    
    console.log("Cartera actualizada. Nuevo saldo:", data.wallet);
}

export function getCardQuantity(cardId) {
    let data = getInventoryData();
    return data.owned_cards[cardId] || 0;
}


export function sellCard(cardId, price, quantityToSell = 1) {
    const data = getInventoryData();
    const cardEntry = data.owned_cards[cardId];

    if (cardEntry && cardEntry.quantity >= quantityToSell) {
        // Restamos la cantidad decidida
        cardEntry.quantity -= quantityToSell;
        
        // Sumamos el dinero (precio unitario * cantidad)
        data.wallet += (price * quantityToSell);

        // Si ya no quedan copias, eliminamos la entrada
        if (cardEntry.quantity <= 0) {
            delete data.owned_cards[cardId];
        }

        saveInventoryData(data);
        console.log(`Venta exitosa: ${quantityToSell} copias de ${cardId} por $${(price * quantityToSell).toFixed(2)}`);
        return true;
    }
    
    alert("No tienes suficientes copias para vender esa cantidad.");
    return false;
}

// --- SISTEMA DE GRADUACIÓN PASO A PASO ---
const GRADING_COST = 50.00;

export function gradeCard(card) { // <-- Ahora recibe el objeto 'card' completo
    let data = getInventoryData();
    const GRADING_COST = 50;
    const cardId = card.id; 
    
    // 1. Verificaciones básicas
    if (data.wallet < GRADING_COST) return { success: false, msg: "Dinero insuficiente ($50)" };
    const cardEntry = data.owned_cards[cardId];
    if (!cardEntry || cardEntry.quantity <= 0) return { success: false, msg: "No tienes esta carta" };

    // 2. Cobrar y quitar 1 unidad
    data.wallet -= GRADING_COST;
    cardEntry.quantity -= 1;
    
    // Guardamos el precio que tenía la carta en el álbum para la base del PSA
    const marketPrice = cardEntry.lastPrice || 1.50;

    if (cardEntry.quantity <= 0) delete data.owned_cards[cardId];

    // 3. Generar la nota
    const rand = Math.random() * 100;
    const resultGrade = rand > 95 ? 10 : rand > 80 ? 9 : rand > 50 ? 8 : Math.floor(Math.random() * 7) + 1;
    
    // 4. Guardar en 'psa_cards' con los detalles para que sea GLOBAL
    if (!data.psa_cards) data.psa_cards = [];
    
    const newSlab = {
        cardId: card.id,
        grade: resultGrade,
        certNumber: Math.floor(Math.random() * 90000000) + 10000000,
        basePrice: card.cardmarket?.prices?.averageSellPrice || 1.50,
        attempts: 1,
        
        // --- AQUÍ VA EL BLOQUE ---
        cardDetails: {
            name: card.name,
            setName: card.set.name, // Usamos card.set.name que viene directo de la API
            images: { 
                small: card.images.small, 
                large: card.images.large 
            }
        }
    };
    

    data.psa_cards.push(newSlab);
    saveInventoryData(data);

    return { success: true, grade: resultGrade };
}
