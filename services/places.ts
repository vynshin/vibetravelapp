import Constants from 'expo-constants';

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

interface PlacePhoto {
  photo_reference: string;
  height: number;
  width: number;
}

interface PlaceResult {
  place_id: string;
  photos?: PlacePhoto[];
  name: string;
  rating?: number;
  user_ratings_total?: number;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

interface PlacesResponse {
  results: PlaceResult[];
  status: string;
}

const fetchWithRetry = async <T,>(fetchFn: () => Promise<T>, maxRetries: number = 2): Promise<T | null> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchFn();
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = 500 * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`Retry attempt ${attempt + 1} after ${delay}ms`);
    }
  }
  return null;
};

export const searchPlaceByName = async (name: string, latitude: number, longitude: number, radiusMeters: number = 10000): Promise<PlaceResult | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    return await fetchWithRetry(async () => {
      // Use locationbias to strongly prefer nearby results
      const url = `${PLACES_API_BASE}/textsearch/json?query=${encodeURIComponent(name)}&locationbias=circle:${radiusMeters}@${latitude},${longitude}&key=${apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: PlacesResponse = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        return data.results[0];
      }
      
      // Treat ZERO_RESULTS as retriable since it might be a temporary issue
      if (data.status === 'ZERO_RESULTS') {
        throw new Error('No results found');
      }
      
      return null;
    });
  } catch (error) {
    console.error('Places API Error after retries:', error);
    return null;
  }
};

export const getPlacePhotoUrl = (photoReference: string, maxWidth: number = 800): string => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  return `${PLACES_API_BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`;
};

export const getPlaceDetails = async (placeId: string): Promise<PlaceResult | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    return await fetchWithRetry(async () => {
      const url = `${PLACES_API_BASE}/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();

      if (data.status === 'OK' && data.result) {
        return data.result;
      }
      
      return null;
    });
  } catch (error) {
    console.error('Place Details API Error after retries:', error);
    return null;
  }
};

export const getPlaceLocation = async (name: string, latitude: number, longitude: number): Promise<{ lat: number; lng: number } | null> => {
  try {
    const place = await searchPlaceByName(name, latitude, longitude);
    
    if (!place || !place.geometry?.location) return null;
    
    return {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng
    };
  } catch (error) {
    console.error('Error fetching place location:', error);
    return null;
  }
};

export const getPlacePhotos = async (name: string, latitude: number, longitude: number): Promise<string[]> => {
  try {
    const place = await searchPlaceByName(name, latitude, longitude);
    
    if (!place) return [];
    
    // Get additional photos from place details
    let allPhotos: PlacePhoto[] = [];
    
    if (place.photos) {
      allPhotos = [...place.photos];
    }
    
    // Fetch place details for more photos
    if (place.place_id) {
      const details = await getPlaceDetails(place.place_id);
      if (details && details.photos) {
        // Merge unique photos
        const existingRefs = new Set(allPhotos.map(p => p.photo_reference));
        details.photos.forEach(photo => {
          if (!existingRefs.has(photo.photo_reference)) {
            allPhotos.push(photo);
          }
        });
      }
    }
    
    if (allPhotos.length > 0) {
      // Filter photos:
      // 1. Prefer wider photos (likely interior/food shots) over tall ones (likely just people/cars)
      // 2. Prefer photos with reasonable aspect ratios
      const filteredPhotos = allPhotos.filter(photo => {
        const aspectRatio = photo.width / photo.height;
        // Keep photos with aspect ratio between 0.5 and 2.5 (filter out very tall/narrow images)
        return aspectRatio >= 0.5 && aspectRatio <= 2.5;
      });
      
      // Sort by width (larger images tend to be higher quality and more relevant)
      const sortedPhotos = filteredPhotos.sort((a, b) => b.width - a.width);
      
      // Return up to 8 photo URLs, prioritizing wider/larger images
      return sortedPhotos.slice(0, 8).map(photo => getPlacePhotoUrl(photo.photo_reference));
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching place photos:', error);
    return [];
  }
};
