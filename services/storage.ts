import AsyncStorage from '@react-native-async-storage/async-storage';
import { Place } from '../types';

const SAVED_PLACES_KEY = '@vibecheck:saved_places';
const HIDDEN_PLACES_KEY = '@vibecheck:hidden_places';

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
