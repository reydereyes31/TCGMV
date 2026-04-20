// js/api.js

const API_KEY = '87c51e43d0ad030821add2c09bc0768628d9747e94c04ce419eea3d2a4741532'; 
const BASE_URL = 'https://api.pokemontcg.io/v2';

export async function fetchAllSets() {
    console.log("API: Solicitando lista de sets con API Key...");
    try {
        const response = await fetch(`${BASE_URL}/sets?orderBy=-releaseDate`, {
            headers: {
                'X-Api-Key': API_KEY
            }
        });
        
        if (!response.ok) throw new Error(`Error API: ${response.status}`);
        
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error("API Error (Sets):", error);
        return null;
    }
}

export async function fetchSetData(setId) {
    console.log(`API: Buscando cartas del set ${setId} con API Key...`);
    
    const cacheKey = `set_cache_${setId}`;
    const cachedData = localStorage.getItem(cacheKey);

    if (cachedData) {
        console.log(`API: Datos de ${setId} recuperados del caché local.`);
        return JSON.parse(cachedData);
    }

    try {
        const response = await fetch(`${BASE_URL}/cards?q=set.id:${setId}`, {
            headers: {
                'X-Api-Key': API_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error(`Error API: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.data) {
            try {
                localStorage.setItem(cacheKey, JSON.stringify(data.data));
            } catch (e) {
                // Si el localStorage se llena, limpiamos los cachés viejos
                console.warn("LocalStorage lleno, limpiando cachés antiguos...");
                Object.keys(localStorage)
                    .filter(key => key.startsWith('set_cache_'))
                    .forEach(key => localStorage.removeItem(key));
                
                // Intentamos guardar de nuevo después de limpiar
                localStorage.setItem(cacheKey, JSON.stringify(data.data));
            }
            return data.data;
        }
        
        return data.data || data;

    } catch (error) {
        console.error(`API Error (Cards ${setId}):`, error);
        return null;
    }
}