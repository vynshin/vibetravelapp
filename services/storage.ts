import AsyncStorage from '@react-native-async-storage/async-storage';
import { Place } from '../types';

const SAVED_PLACES_KEY = '@vibecheck:saved_places';
const HIDDEN_PLACES_KEY = '@vibecheck:hidden_places';
const CACHED_RESULTS_KEY = '@vibecheck:cached_results';
const CACHED_PLACE_DETAILS_KEY = '@vibecheck:cached_place_details';
const GRID_CACHE_KEY = '@vibecheck:grid_cache';

export interface SavedPlace extends Place {
  savedAt: number; // timestamp
}

// SAVED PLACES
export const getSavedPlaces = async (): Promise<SavedPlace[]> => {
  try {
    const json = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error getting saved places:', error);
    return [];
  }
};

export const savePlace = async (place: Place): Promise<void> => {
  try {
    const saved = await getSavedPlaces();
    
    // Check if already saved
    if (saved.some(p => p.name === place.name)) {
      console.log(`${place.name} is already saved`);
      return;
    }
    
    const savedPlace: SavedPlace = {
      ...place,
      savedAt: Date.now(),
    };
    
    await AsyncStorage.setItem(
      SAVED_PLACES_KEY,
      JSON.stringify([savedPlace, ...saved])
    );
    
    console.log(`✅ Saved ${place.name}`);
  } catch (error) {
    console.error('Error saving place:', error);
    throw error;
  }
};

export const unsavePlace = async (placeName: string): Promise<void> => {
  try {
    const saved = await getSavedPlaces();
    const filtered = saved.filter(p => p.name !== placeName);
    await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(filtered));
    console.log(`🗑️ Unsaved ${placeName}`);
  } catch (error) {
    console.error('Error unsaving place:', error);
    throw error;
  }
};

// HIDDEN PLACES
export const getHiddenPlaces = async (): Promise<string[]> => {
  try {
    const json = await AsyncStorage.getItem(HIDDEN_PLACES_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Error getting hidden places:', error);
    return [];
  }
};

export const hidePlace = async (placeName: string): Promise<void> => {
  try {
    const hidden = await getHiddenPlaces();
    
    if (hidden.includes(placeName)) {
      console.log(`${placeName} is already hidden`);
      return;
    }
    
    await AsyncStorage.setItem(
      HIDDEN_PLACES_KEY,
      JSON.stringify([...hidden, placeName])
    );
    
    console.log(`👻 Hidden ${placeName}`);
  } catch (error) {
    console.error('Error hiding place:', error);
    throw error;
  }
};

export const unhidePlace = async (placeName: string): Promise<void> => {
  try {
    const hidden = await getHiddenPlaces();
    const filtered = hidden.filter(name => name !== placeName);
    await AsyncStorage.setItem(HIDDEN_PLACES_KEY, JSON.stringify(filtered));
    console.log(`👁️ Unhidden ${placeName}`);
  } catch (error) {
    console.error('Error unhiding place:', error);
    throw error;
  }
};

export const isPlaceHidden = async (placeName: string): Promise<boolean> => {
  const hidden = await getHiddenPlaces();
  return hidden.includes(placeName);
};

// CACHED SEARCH RESULTS
export interface CachedSearchResults {
  places: Place[];
  city: string;
  latitude: number;
  longitude: number;
  query?: string;
  timestamp: number;
}

export const saveCachedResults = async (
  places: Place[],
  city: string,
  latitude: number,
  longitude: number,
  query?: string
): Promise<void> => {
  try {
    const cached: CachedSearchResults = {
      places,
      city,
      latitude,
      longitude,
      query,
      timestamp: Date.now(),
    };

    await AsyncStorage.setItem(CACHED_RESULTS_KEY, JSON.stringify(cached));
    console.log(`💾 Cached ${places.length} places for ${city}`);
  } catch (error) {
    console.error('Error caching results:', error);
  }
};

export const getCachedResults = async (): Promise<CachedSearchResults | null> => {
  try {
    const json = await AsyncStorage.getItem(CACHED_RESULTS_KEY);
    if (!json) return null;

    const cached: CachedSearchResults = JSON.parse(json);

    // Check if cache is less than 24 hours old
    const ageInHours = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
    if (ageInHours > 24) {
      console.log('🗑️ Cache expired (>24 hours old), clearing...');
      await clearCachedResults();
      return null;
    }

    console.log(`📂 Loaded cached results: ${cached.places.length} places from ${cached.city} (${ageInHours.toFixed(1)}h old)`);
    return cached;
  } catch (error) {
    console.error('Error loading cached results:', error);
    return null;
  }
};

export const clearCachedResults = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CACHED_RESULTS_KEY);
    console.log('🗑️ Cleared cached results');
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
};

// PLACE DETAILS CACHE (24-hour expiration)
export interface CachedPlaceDetail {
  placeId: string;
  details: any; // Place details object
  timestamp: number;
}

export interface PlaceDetailsCache {
  [placeId: string]: CachedPlaceDetail;
}

/**
 * Get cached place details by place ID
 * Returns null if not cached or expired (>24 hours)
 */
export const getCachedPlaceDetails = async (placeId: string): Promise<any | null> => {
  try {
    const json = await AsyncStorage.getItem(CACHED_PLACE_DETAILS_KEY);
    if (!json) return null;

    const cache: PlaceDetailsCache = JSON.parse(json);
    const cached = cache[placeId];

    if (!cached) return null;

    // Check if cache is less than 24 hours old
    const ageInHours = (Date.now() - cached.timestamp) / (1000 * 60 * 60);
    if (ageInHours > 24) {
      console.log(`🗑️ Place details cache expired for ${placeId} (${ageInHours.toFixed(1)}h old)`);
      // Clean up this entry
      delete cache[placeId];
      await AsyncStorage.setItem(CACHED_PLACE_DETAILS_KEY, JSON.stringify(cache));
      return null;
    }

    console.log(`💾 Using cached place details for ${placeId} (${ageInHours.toFixed(1)}h old)`);
    return cached.details;
  } catch (error) {
    console.error('Error loading cached place details:', error);
    return null;
  }
};

/**
 * Save place details to cache
 */
export const savePlaceDetailsToCache = async (placeId: string, details: any): Promise<void> => {
  try {
    let cache: PlaceDetailsCache = {};

    // Load existing cache
    const json = await AsyncStorage.getItem(CACHED_PLACE_DETAILS_KEY);
    if (json) {
      cache = JSON.parse(json);
    }

    // Add new entry
    cache[placeId] = {
      placeId,
      details,
      timestamp: Date.now(),
    };

    // Clean up expired entries (older than 24 hours)
    const now = Date.now();
    Object.keys(cache).forEach(id => {
      const ageInHours = (now - cache[id].timestamp) / (1000 * 60 * 60);
      if (ageInHours > 24) {
        delete cache[id];
      }
    });

    await AsyncStorage.setItem(CACHED_PLACE_DETAILS_KEY, JSON.stringify(cache));
    console.log(`💾 Cached place details for ${placeId}`);
  } catch (error) {
    console.error('Error saving place details to cache:', error);
  }
};

/**
 * Clear all cached place details
 */
export const clearPlaceDetailsCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(CACHED_PLACE_DETAILS_KEY);
    console.log('🗑️ Cleared all cached place details');
  } catch (error) {
    console.error('Error clearing place details cache:', error);
  }
};

// GRID CACHE (Location-based search results caching)
export interface GridCacheEntry {
  gridKey: string;
  places: Place[];
  timestamp: number;
  searchCount: number;
  category?: string; // Optional category filter
  query?: string; // Optional search query
}

export interface GridCache {
  [gridKey: string]: GridCacheEntry;
}

/**
 * Get grid key from coordinates (rounds to 0.01° grid ~1.1km cells)
 * Includes category in key so different categories have separate cache entries
 */
export const getGridKey = (lat: number, lng: number, precision: number = 2, category?: string): string => {
  const factor = Math.pow(10, precision);
  const gridLat = Math.round(lat * factor) / factor;
  const gridLng = Math.round(lng * factor) / factor;
  const categoryKey = category ? `:${category}` : ':ALL';
  return `${gridLat},${gridLng}${categoryKey}`;
};

/**
 * Get cached results for grid cell
 * Returns null if not cached, expired (>6 hours), or category doesn't match
 */
export const getGridCachedResults = async (
  lat: number,
  lng: number,
  category?: string,
  query?: string
): Promise<Place[] | null> => {
  try {
    const gridKey = getGridKey(lat, lng, 2, category);
    const json = await AsyncStorage.getItem(GRID_CACHE_KEY);
    if (!json) return null;

    const cache: GridCache = JSON.parse(json);
    const entry = cache[gridKey];

    if (!entry) return null;

    // Check if cache is less than 6 hours old
    const ageInHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
    if (ageInHours > 6) {
      console.log(`🗑️ Grid cache expired for ${gridKey} (${ageInHours.toFixed(1)}h old)`);
      // Clean up expired entry
      delete cache[gridKey];
      await AsyncStorage.setItem(GRID_CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    // Check if category matches (if specified)
    // If a category is requested but cache has different/no category, cache miss
    if (category) {
      if (!entry.category) {
        console.log(`⚠️ Grid cache miss for ${gridKey}: category requested (${category}) but cache has no category filter`);
        return null;
      }
      if (entry.category !== category) {
        console.log(`⚠️ Grid cache miss for ${gridKey}: category mismatch (cached: ${entry.category}, requested: ${category})`);
        return null;
      }
    }

    // Check if query matches (if specified)
    // If both have queries and they don't match, cache miss
    if (query && entry.query && entry.query !== query) {
      console.log(`⚠️ Grid cache miss for ${gridKey}: query mismatch`);
      return null;
    }

    console.log(`💾 Grid cache HIT: ${gridKey} (${ageInHours.toFixed(1)}h old, ${entry.searchCount} searches)`);

    // Increment search count for popularity tracking
    entry.searchCount++;
    entry.timestamp = Date.now(); // Refresh timestamp on use
    cache[gridKey] = entry;
    await AsyncStorage.setItem(GRID_CACHE_KEY, JSON.stringify(cache));

    return entry.places;
  } catch (error) {
    console.error('Error loading grid cache:', error);
    return null;
  }
};

/**
 * Save results to grid cache
 * Automatically evicts old entries if cache grows too large (keeps top 100)
 */
export const saveGridCachedResults = async (
  lat: number,
  lng: number,
  places: Place[],
  category?: string,
  query?: string
): Promise<void> => {
  try {
    const gridKey = getGridKey(lat, lng, 2, category);
    let cache: GridCache = {};

    // Load existing cache
    const json = await AsyncStorage.getItem(GRID_CACHE_KEY);
    if (json) {
      cache = JSON.parse(json);
    }

    // Add/update entry
    cache[gridKey] = {
      gridKey,
      places,
      timestamp: Date.now(),
      searchCount: cache[gridKey]?.searchCount ? cache[gridKey].searchCount + 1 : 1,
      category,
      query,
    };

    // Evict old entries if cache too large (keep top 100 by search count)
    const entries = Object.values(cache);
    if (entries.length > 100) {
      // Sort by searchCount (descending) and keep top 100
      const sorted = entries.sort((a, b) => b.searchCount - a.searchCount);
      const top100 = sorted.slice(0, 100);
      cache = Object.fromEntries(top100.map(e => [e.gridKey, e]));
      console.log(`🗑️ Evicted ${entries.length - 100} old grid cache entries (LRU)`);
    }

    await AsyncStorage.setItem(GRID_CACHE_KEY, JSON.stringify(cache));
    console.log(`💾 Grid cache saved: ${gridKey} (${places.length} places, search #${cache[gridKey].searchCount})`);
  } catch (error) {
    console.error('Error saving grid cache:', error);
  }
};

/**
 * Clear all grid cache
 */
export const clearGridCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(GRID_CACHE_KEY);
    console.log('🗑️ Cleared all grid cache');
  } catch (error) {
    console.error('Error clearing grid cache:', error);
  }
};

/**
 * Get grid cache stats (for debugging/analytics)
 */
export const getGridCacheStats = async (): Promise<{
  totalCells: number;
  totalSearches: number;
  oldestEntry: number;
  newestEntry: number;
}> => {
  try {
    const json = await AsyncStorage.getItem(GRID_CACHE_KEY);
    if (!json) {
      return { totalCells: 0, totalSearches: 0, oldestEntry: 0, newestEntry: 0 };
    }

    const cache: GridCache = JSON.parse(json);
    const entries = Object.values(cache);

    const totalSearches = entries.reduce((sum, e) => sum + e.searchCount, 0);
    const timestamps = entries.map(e => e.timestamp);
    const oldestEntry = Math.min(...timestamps);
    const newestEntry = Math.max(...timestamps);

    return {
      totalCells: entries.length,
      totalSearches,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    console.error('Error getting grid cache stats:', error);
    return { totalCells: 0, totalSearches: 0, oldestEntry: 0, newestEntry: 0 };
  }
};
