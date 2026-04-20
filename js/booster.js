// js/booster.js

/**
 * Función para obtener una carta aleatoria de una lista filtrada
 */
function getRandomCard(filteredCards, fallbackCards) {
    if (filteredCards && filteredCards.length > 0) {
        return filteredCards[Math.floor(Math.random() * filteredCards.length)];
    }
    
    console.warn("Rareza no encontrada en este pool, usando carta de respaldo.");
    // Importante: fallbackCards debe ser el array completo de cartas
    return fallbackCards[Math.floor(Math.random() * fallbackCards.length)];
}

export function openBooster(cards) {
    const pack = [];
    
    // MEJORA: Algunos sets antiguos usan "Common" con mayúscula o minúscula. 
    // Usamos toLowerCase() para evitar que el sobre salga vacío de comunes.
    const commons = cards.filter(c => c.rarity && c.rarity.toLowerCase() === 'common');
    const uncommons = cards.filter(c => c.rarity && c.rarity.toLowerCase() === 'uncommon');
    
    // MEJORA: Filtro de Raras más amplio para incluir Illustration Rares, ACE SPEC, etc.
    const rares = cards.filter(c => {
        if (!c.rarity) return false;
        const r = c.rarity.toLowerCase();
        return r.includes('rare') || r.includes('promo') || r.includes('ultra') || r.includes('secret');
    });

    // 6 Comunes
    for (let i = 0; i < 6; i++) pack.push(getRandomCard(commons, cards));
    
    // 3 Poco Comunes
    for (let i = 0; i < 3; i++) pack.push(getRandomCard(uncommons, cards));
    
    // 1 Rara o superior
    pack.push(getRandomCard(rares, cards));

    return pack;
}