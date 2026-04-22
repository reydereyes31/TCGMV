// js/api.js

const API_KEY = '87c51e43d0ad030821add2c09bc0768628d9747e94c04ce419eea3d2a4741532'; 
const BASE_URL = 'https://api.pokemontcg.io/v2';

// ── Caché en memoria (dura mientras la pestaña está abierta) ──────────────
// Evita llamadas repetidas a la API cuando múltiples usuarios o funciones
// piden la misma lista de sets en la misma sesión.
let _setsMemoryCache = null;
let _setsMemoryCacheTime = 0;
const SETS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos en memoria

// Caché en localStorage (persiste entre sesiones, dura 24h)
const SETS_LS_KEY     = 'pokesim_sets_cache';
const SETS_LS_TTL_MS  = 24 * 60 * 60 * 1000; // 24 horas

export async function fetchAllSets() {
    // 1. Memoria: la más rápida, sin parseo
    const now = Date.now();
    if (_setsMemoryCache && (now - _setsMemoryCacheTime) < SETS_CACHE_TTL_MS) {
        console.log("API: Sets desde caché en memoria.");
        return _setsMemoryCache;
    }

    // 2. localStorage: evita la llamada de red entre sesiones
    try {
        const ls = localStorage.getItem(SETS_LS_KEY);
        if (ls) {
            const { ts, data } = JSON.parse(ls);
            if ((now - ts) < SETS_LS_TTL_MS) {
                console.log("API: Sets desde caché localStorage.");
                _setsMemoryCache     = data;
                _setsMemoryCacheTime = now;
                return data;
            }
        }
    } catch (_) {}

    // 3. Red: solo si los cachés están vacíos o caducados
    console.log("API: Solicitando lista de sets a la red...");
    try {
        const response = await fetch(`${BASE_URL}/sets?orderBy=-releaseDate`, {
            headers: { 'X-Api-Key': API_KEY }
        });
        if (!response.ok) throw new Error(`Error API: ${response.status}`);

        const data = await response.json();
        const sets = data.data;

        // Guardar en ambos cachés
        _setsMemoryCache     = sets;
        _setsMemoryCacheTime = now;
        try {
            localStorage.setItem(SETS_LS_KEY, JSON.stringify({ ts: now, data: sets }));
        } catch (_) {}

        return sets;
    } catch (error) {
        console.error("API Error (Sets):", error);
        // Si la red falla, intentar devolver el localStorage aunque esté caducado
        try {
            const ls = localStorage.getItem(SETS_LS_KEY);
            if (ls) return JSON.parse(ls).data;
        } catch (_) {}
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