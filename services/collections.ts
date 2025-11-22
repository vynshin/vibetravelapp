import AsyncStorage from '@react-native-async-storage/async-storage';
import { Place, Collection, HistoryEntry } from '../types';

const FAVORITES_KEY = '@vibecheck_favorites';
const COLLECTIONS_KEY = '@vibecheck_collections';
const HISTORY_KEY = '@vibecheck_history';

/**
 * FAVORITES
 */

export const getFavorites = async (): Promise<Place[]> => {
  try {
    const stored = await AsyncStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading favorites:', error);
    return [];
  }
};

export const savePlaceToFavorites = async (place: Place): Promise<void> => {
  try {
    const favorites = await getFavorites();
    // Check if already favorited (by ID)
    if (favorites.some(p => p.id === place.id)) {
      console.log(`Place ${place.name} is already in favorites`);
      return;
    }
    favorites.push(place);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    console.log(`Saved ${place.name} to favorites`);
  } catch (error) {
    console.error('Error saving favorite:', error);
  }
};

export const removePlaceFromFavorites = async (placeId: string): Promise<void> => {
  try {
    const favorites = await getFavorites();
    const updated = favorites.filter(p => p.id !== placeId);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
    console.log(`Removed place ${placeId} from favorites`);
  } catch (error) {
    console.error('Error removing favorite:', error);
  }
};

export const isPlaceFavorited = async (placeId: string): Promise<boolean> => {
  try {
    const favorites = await getFavorites();
    return favorites.some(p => p.id === placeId);
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return false;
  }
};

/**
 * COLLECTIONS
 */

export const getCollections = async (): Promise<Collection[]> => {
  try {
    const stored = await AsyncStorage.getItem(COLLECTIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading collections:', error);
    return [];
  }
};

export const createCollection = async (name: string, icon?: string): Promise<Collection> => {
  try {
    const collections = await getCollections();
    const newCollection: Collection = {
      id: `collection-${Date.now()}`,
      name,
      icon,
      placeIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    collections.push(newCollection);
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    console.log(`Created collection: ${name}`);
    return newCollection;
  } catch (error) {
    console.error('Error creating collection:', error);
    throw error;
  }
};

export const deleteCollection = async (collectionId: string): Promise<void> => {
  try {
    const collections = await getCollections();
    const updated = collections.filter(c => c.id !== collectionId);
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(updated));
    console.log(`Deleted collection ${collectionId}`);
  } catch (error) {
    console.error('Error deleting collection:', error);
  }
};

export const addPlaceToCollection = async (collectionId: string, placeId: string): Promise<void> => {
  try {
    const collections = await getCollections();
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) {
      console.error(`Collection ${collectionId} not found`);
      return;
    }
    // Check if already in collection
    if (collection.placeIds.includes(placeId)) {
      console.log(`Place ${placeId} is already in collection ${collection.name}`);
      return;
    }
    collection.placeIds.push(placeId);
    collection.updatedAt = Date.now();
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    console.log(`Added place ${placeId} to collection ${collection.name}`);
  } catch (error) {
    console.error('Error adding place to collection:', error);
  }
};

export const removePlaceFromCollection = async (collectionId: string, placeId: string): Promise<void> => {
  try {
    const collections = await getCollections();
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) {
      console.error(`Collection ${collectionId} not found`);
      return;
    }
    collection.placeIds = collection.placeIds.filter(id => id !== placeId);
    collection.updatedAt = Date.now();
    await AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    console.log(`Removed place ${placeId} from collection ${collection.name}`);
  } catch (error) {
    console.error('Error removing place from collection:', error);
  }
};

export const getPlacesInCollection = async (collectionId: string): Promise<Place[]> => {
  try {
    const collections = await getCollections();
    const collection = collections.find(c => c.id === collectionId);
    if (!collection) return [];

    // Get all favorites to find the actual Place objects
    const favorites = await getFavorites();
    const history = await getHistory();

    // Combine favorites and history to get all known places
    const allPlaces = new Map<string, Place>();
    favorites.forEach(p => allPlaces.set(p.id, p));
    history.forEach(h => allPlaces.set(h.place.id, h.place));

    // Filter to only places in this collection
    return collection.placeIds
      .map(id => allPlaces.get(id))
      .filter((p): p is Place => p !== undefined);
  } catch (error) {
    console.error('Error getting places in collection:', error);
    return [];
  }
};

/**
 * HISTORY
 */

export const getHistory = async (): Promise<HistoryEntry[]> => {
  try {
    const stored = await AsyncStorage.getItem(HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
};

export const addToHistory = async (place: Place, searchQuery?: string, location?: string): Promise<void> => {
  try {
    let history = await getHistory();

    // Check if this place is already in history (avoid duplicates)
    const existingIndex = history.findIndex(h => h.place.id === place.id);
    if (existingIndex !== -1) {
      // Update the viewed timestamp and move to front
      history[existingIndex].viewedAt = Date.now();
      const [entry] = history.splice(existingIndex, 1);
      history.unshift(entry);
    } else {
      // Add new entry to front of history
      const entry: HistoryEntry = {
        place,
        viewedAt: Date.now(),
        searchQuery,
        location: location || place.address?.split(',').slice(-2).join(',').trim() || 'Unknown',
      };
      history.unshift(entry);
    }

    // Keep only last 100 entries to avoid unbounded growth
    history = history.slice(0, 100);

    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error adding to history:', error);
  }
};

export const clearHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
    console.log('History cleared');
  } catch (error) {
    console.error('Error clearing history:', error);
  }
};
