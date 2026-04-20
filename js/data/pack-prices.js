// data/pack-prices.js

const specialPrices = {
    // --- EL TOP 30 HISTÓRICO ---
    
    // 1. Base Set (Charizard 1st Edition, Blastoise, Venusaur)
    "base1": 3500.00, 
    
    // 2. Skyridge (Celesteela, Charizard Crystal, Ho-Oh Crystal)
    "ecard3": 2800.00, 
    
    // 3. Aquapolis (Lugia Crystal, Entei Crystal)
    "ecard2": 1500.00,
    
    // 4. Team Rocket Returns (Mewtwo ex, Mudkip Star, Torchic Star)
    // Es donde salen las "Gold Stars" más buscadas de la era EX
    "ex7": 1800.00,
    
    // 5. Dragon Frontiers (Charizard Gold Star Delta Species)
    // Probablemente la carta más buscada de la era EX después de los Umbreon
    "ex15": 2200.00,
    
    // 6. Deoxys (Rayquaza Gold Star - Una de las cartas más caras de la historia)
    "ex8": 1600.00,
    
    // 7. Neo Destiny (Shining Charizard, Shining Mewtwo)
    "neo4": 1200.00,
    
    // 8. Expedition Base Set (Mew, Charizard Holos de la era E-Reader)
    "ecard1": 900.00,
    
    // 9. Unseen Forces (Lugia ex, Celebi ex y más Gold Stars)
    "ex10": 850.00,
    
    // 10. Holon Phantoms (Mew Gold Star)
    "ex13": 750.00,

    // 11. Evolving Skies (Umbreon VMAX Alt Art / "Moonbreon")
    // Es el set moderno más caro porque esa carta sola vale miles en PSA 10
    "swsh7": 120.00,

    // 12. Team Up (Latias & Latios GX Alt Art)
    // El set de Sun & Moon más caro por su baja tirada
    "sm9": 95.00,

    // 13. Legendary Collection (Charizard Reverse Holo)
    // Los fuegos artificiales de este set son legendarios
    "base6": 1400.00,

    // 14. Phantom Forces (Gengar EX Secret Rare / Dialga Silver)
    "xy4": 65.00,

    // 15. Flashfire (Charizard EX variantes)
    "xy2": 80.00,

    // SETS ESPECIALES / PROMOS DE ALTO VALOR
    "sv3pt5": 12.50,  //151
    "swsh12pt5gg": 600.00,  //Crown Zenith (Galarian Gallery)
    "svp": 600.00,      //Scarlet & Violet Promos   
    "swsh12tg": 100.00,  //Silver Tempest (Trainer Gallery)   
    "swsh11tg": 200.00,  //Lost Origin (Trainer Gallery)   
    "swsh10tg": 300.00,  //Astral Radiance (Trainer Gallery)    
    "swsh9tg": 300.00,     
    "cel25c": 150.00,     
    "swsh45sv": 50.00,     
    "fut20": 400.00,     // ID técnico para Futsal / Destiny (ajusta según tu selector)
    "swshp": 150.00,      // Sword & Shield Black Star Promos
    "sma": 500.00,        // Hidden Fates: Shiny Vault
    "sm115": 80.00,       // Hidden Fates (Set base)
    "smp": 200.00,        // Sun & Moon Black Star Promos (Tag Teams, GX, etc.)
    "dc1": 100.00,         // Double Crisis (Team Aqua vs Team Magma)
    "xyp": 500.00,        // XY Black Star Promos (Mega-Evoluciones, Charizard EX, etc.)
    "si1": 1500.00,       // Southern Islands (Solo 18 cartas, profit asegurado si es barato)
    "det1": 35.00,       // Detective Pikachu (Set corto, hay que vigilarlo)
    "mcd11": 100.00,       // McDonald's Collection 2011 (Primer Confetti Holo)
    "mcd12": 250.00,       // McDonald's Collection 2012
    "mcd16": 100.00,       // McDonald's Collection 2016
    "mcd19": 125.00,       // McDonald's Collection 2019 
    "mcd21": 15.00,      // McDonald's 25th Anniversary (Cartas con Holo Foil especial)
    "cel25": 25.00,      // Celebrations (Mucho hit de cartas clásicas)
    "g1": 80.00,         // Generations (Era XY, mucha Radiant Collection)
    "tk1a": 40.00, "tk1b": 40.00, // Trainer Kits (Latias/Latios - raros de ver)
    
    // RUMBLE (Cartas con diseño único, muy buscadas)
    "ru1": 300.00,

    // EX Trainer Kit 2 (Minun y Plusle)
    "tk2a": 25.00,  // Minun
    "tk2b": 25.00,  // Plusle

    // --- SETS PROMOCIONALES DE ALTO VALOR ---
    "bw5": 500.00,        // Dark Explorers (Darkrai EX, Gardevoir Secret, etc.)
    "bwp": 500.00,     // Black & White Black Star Promos
    "hsp": 500.00,    // HGSS Black Star Promos
    "dpp": 1000.00,    // DP Black Star Promos
    "pop3": 350.00,    // por tener blastoise de 150
    "pop4": 1000.00,   // por tener cartas de mas de 500
    "pop5": 2000.00,   // Por el Umbreon y Espeon Gold Star (extremadamente raros)
    "pop6": 500.00,   // Por el Lucario
    "basep":1000.00,   // Wizards Promos (Mewtwo, Pikachu Movie)
    "ru1": 3000.00,   // Set pequenio muchos hits

    "bp": 1500.00, //Best of Game (bp)
    "np": 5000.00, // Nintendo Black Star Promos

};

export function getPackPrice(set) {
    if (!set) return 5.00;
    if (specialPrices[set.id]) return specialPrices[set.id];

    const series = (set.series || "").toLowerCase();
    const name = (set.name || "").toLowerCase();

    // LÓGICA DE ESCALADA POR ANTIGÜEDAD (INFLADA)
    
    // 1. Era Wizards (Base, Gym, Neo, Expedition)
    if (series.includes('base') || series.includes('neo') || series.includes('e-card') || series.includes('gym')) {
        return 750.00; // Precio base para cualquier Wizards "barato"
    }

    // 2. Era EX (Ruby & Sapphire hasta Power Keepers)
    if (series.includes('ex')) {
        return 550.00;
    }

    // 3. Era HeartGold SoulSilver / Call of Legends
    if (series.includes('heartgold') || series.includes('call of legends')) {
        return 350.00;
    }

    // 4. Era Platinum / Diamond & Pearl
    if (series.includes('platinum') || series.includes('diamond')) {
        return 200.00;
    }

    // 5. Era Black & White
    if (series.includes('black') || series.includes('white')) {
        return 120.00;
    }

    // 6. Era XY
    if (series.includes('xy')) {
        return 45.00;
    }

    // 7. Era Sun & Moon
    if (series.includes('sun') || series.includes('moon')) {
        return 25.00;
    }

    // 8. POP Series (Ajuste por escasez)
    if (name.includes('pop series')) {
        return 180.00; 
    }

    // 9. Moderno (Sword & Shield / Scarlet & Violet)
    if (series.includes('sword') || series.includes('shield')) return 6.00;
    if (series.includes('scarlet') || series.includes('violet')) return 5.50;

    return 10.00; 
}

// --- LÓGICA DE GENERACIÓN (Mantenemos tus 11 cartas) ---

export function generatePack(allCards, currentSetId) {
    const pack = [];
    
    // FILTRO CRÍTICO: Solo cartas que pertenezcan al ID del set actual
    const setCards = allCards.filter(c => c.set?.id === currentSetId || c.id.startsWith(currentSetId));

    const commons = setCards.filter(c => c.rarity?.toLowerCase().includes('common') && !c.rarity?.toLowerCase().includes('uncommon'));
    const uncommons = setCards.filter(c => c.rarity?.toLowerCase().includes('uncommon'));
    const rares = setCards.filter(c => 
        c.rarity?.toLowerCase().includes('rare') || 
        c.rarity?.toLowerCase().includes('promo') ||
        c.rarity?.toLowerCase().includes('special') ||
        c.rarity?.toLowerCase().includes('illustration') ||
        c.rarity?.toLowerCase().includes('ex') ||
        c.rarity?.toLowerCase().includes('vmax') ||
        c.rarity?.toLowerCase().includes('star')
    );

    // Si el set es muy pequeño (como algunas promos) y no hay suficientes comunes/raras, 
    // mezclamos lo que haya de ese set específico
    if (commons.length < 1 || rares.length < 1) {
        return [...setCards].sort(() => 0.5 - Math.random()).slice(0, 11);
    }

    // Rellenamos el sobre (11 cartas) solo con cartas de este set
    for (let i = 0; i < 6; i++) pack.push(commons[Math.floor(Math.random() * commons.length)]);
    for (let i = 0; i < 4; i++) pack.push(uncommons[Math.floor(Math.random() * uncommons.length)]);
    pack.push(rares[Math.floor(Math.random() * rares.length)]);

    return pack.sort(() => 0.5 - Math.random());
}