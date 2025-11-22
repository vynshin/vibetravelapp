import Constants from 'expo-constants';
import { getCachedPlaceDetails, savePlaceDetailsToCache } from './storage';

// New Places API endpoint
const PLACES_API_BASE = 'https://places.googleapis.com/v1';

interface PlacePhoto {
  name: string; // Photo resource name (used in new API)
  widthPx: number;
  heightPx: number;
}

interface PlaceResult {
  id: string; // New API uses 'id' instead of 'place_id'
  displayName?: { text: string };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  businessStatus?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  priceLevel?: string;
  types?: string[];
  reviews?: Array<{
    name: string;
    authorAttribution?: {
      displayName: string;
    };
    rating: number;
    text?: { text: string };
    publishTime: string;
  }>;
  googleMapsUri?: string;
  photos?: PlacePhoto[];
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

/**
 * Check business status for a place by name (lightweight - only fetches businessStatus field)
 * Cost: ~$0.017 per call (Text Search with minimal field mask)
 */
export const checkBusinessStatus = async (placeName: string, latitude: number, longitude: number): Promise<string | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${PLACES_API_BASE}/places:searchText`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.businessStatus' // Minimal fields
      },
      body: JSON.stringify({
        textQuery: placeName,
        locationBias: {
          circle: {
            center: { latitude, longitude },
            radius: 5000 // 5km search radius
          }
        }
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      // Verify it's the same place by checking name similarity
      const nameMatch = place.displayName?.text?.toLowerCase().includes(placeName.toLowerCase().split(/\s+/)[0]);
      if (nameMatch) {
        return place.businessStatus || 'OPERATIONAL';
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking business status:', error);
    return null;
  }
};

/**
 * Search for a place by name using New Places API Text Search
 */
export const searchPlaceByName = async (name: string, latitude: number, longitude: number, radiusMeters: number = 10000): Promise<any | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    return await fetchWithRetry(async () => {
      const url = `${PLACES_API_BASE}/places:searchText`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus'
        },
        body: JSON.stringify({
          textQuery: name,
          locationBias: {
            circle: {
              center: {
                latitude,
                longitude
              },
              radius: radiusMeters
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.places && data.places.length > 0) {
        return data.places[0];
      }

      return null;
    });
  } catch (error) {
    console.error('Places API Error after retries:', error);
    return null;
  }
};

/**
 * Get photo URL from new Places API photo resource name
 */
export const getPlacePhotoUrl = (photoName: string, maxWidth: number = 800): string => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  return `${PLACES_API_BASE}/${photoName}/media?key=${apiKey}&maxWidthPx=${maxWidth}`;
};

/**
 * Get comprehensive place details using New Places API
 * Returns all available information for a place including reviews, photos, hours, contact info
 */
export const getPlaceFullDetails = async (name: string, latitude: number, longitude: number, radiusMeters: number = 10000): Promise<any | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    // First, find the place to get its ID
    const searchResult = await searchPlaceByName(name, latitude, longitude, radiusMeters);
    if (!searchResult || !searchResult.id) {
      return null;
    }

    // COST OPTIMIZATION: Check cache before fetching details (24-hour expiration)
    const cached = await getCachedPlaceDetails(searchResult.id);
    if (cached) {
      return cached; // Cache hit - no additional API call needed
    }

    // Then fetch full details with all fields
    const result = await fetchWithRetry(async () => {
      const url = `${PLACES_API_BASE}/places/${searchResult.id}`;

      // OPTIMIZED field mask: Includes photos (for visual UX) but excludes reviews
      // Photos are needed for card thumbnails (app is visual-first)
      // Reviews are lazy-loaded on-demand in PlacePopup only
      const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'rating',
        'userRatingCount',
        // 'reviews', // REMOVED: Lazy-load on detail view to save costs
        'currentOpeningHours',
        'photos', // RESTORED: Essential for visual UX (thumbnails)
        'priceLevel',
        'types',
        'websiteUri',
        'googleMapsUri',
        'businessStatus',
        'nationalPhoneNumber',
        'internationalPhoneNumber'
      ].join(',');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Transform to match old format for compatibility
      return {
        place_id: data.id,
        name: data.displayName?.text || name,
        formatted_address: data.formattedAddress,
        formatted_phone_number: data.nationalPhoneNumber,
        international_phone_number: data.internationalPhoneNumber,
        geometry: data.location ? {
          location: {
            lat: data.location.latitude,
            lng: data.location.longitude
          }
        } : undefined,
        rating: data.rating,
        user_ratings_total: data.userRatingCount,
        reviews: data.reviews?.map((r: any) => ({
          author_name: r.authorAttribution?.displayName || 'Anonymous',
          rating: r.rating,
          text: r.text?.text || '',
          time: new Date(r.publishTime).getTime() / 1000,
          relative_time_description: ''
        })),
        opening_hours: data.currentOpeningHours ? {
          open_now: data.currentOpeningHours.openNow,
          weekday_text: data.currentOpeningHours.weekdayDescriptions
        } : undefined,
        photos: data.photos?.map((p: PlacePhoto) => ({
          photo_reference: p.name,
          width: p.widthPx,
          height: p.heightPx
        })),
        price_level: data.priceLevel,
        types: data.types,
        website: data.websiteUri,
        url: data.googleMapsUri,
        business_status: data.businessStatus
      };
    });

    // Save to cache for future requests
    if (result && searchResult.id) {
      await savePlaceDetailsToCache(searchResult.id, result);
    }

    return result;
  } catch (error) {
    console.error('Place Full Details API Error after retries:', error);
    return null;
  }
};

/**
 * Get comprehensive place details by ID (when ID is already known)
 * Skips the searchPlaceByName step for cost optimization
 * Uses 24-hour cache to avoid repeated API calls
 */
export const getPlaceDetailsByIdDirect = async (placeId: string): Promise<any | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  // COST OPTIMIZATION: Check cache first (24-hour expiration)
  const cached = await getCachedPlaceDetails(placeId);
  if (cached) {
    return cached; // Cache hit - no API call needed
  }

  try {
    const result = await fetchWithRetry(async () => {
      const url = `${PLACES_API_BASE}/places/${placeId}`;

      // OPTIMIZED field mask: Includes photos (for visual UX) but excludes reviews
      // Photos are needed for card thumbnails (app is visual-first)
      // Reviews are lazy-loaded on-demand in PlacePopup only
      const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'location',
        'rating',
        'userRatingCount',
        // 'reviews', // REMOVED: Lazy-load on detail view to save costs
        'currentOpeningHours',
        'photos', // RESTORED: Essential for visual UX (thumbnails)
        'priceLevel',
        'types',
        'websiteUri',
        'googleMapsUri',
        'businessStatus',
        'nationalPhoneNumber',
        'internationalPhoneNumber'
      ].join(',');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Transform to match old format for compatibility
      return {
        place_id: data.id,
        name: data.displayName?.text || '',
        formatted_address: data.formattedAddress,
        formatted_phone_number: data.nationalPhoneNumber,
        international_phone_number: data.internationalPhoneNumber,
        geometry: data.location ? {
          location: {
            lat: data.location.latitude,
            lng: data.location.longitude
          }
        } : undefined,
        rating: data.rating,
        user_ratings_total: data.userRatingCount,
        reviews: data.reviews?.map((r: any) => ({
          author_name: r.authorAttribution?.displayName || 'Anonymous',
          rating: r.rating,
          text: r.text?.text || '',
          time: new Date(r.publishTime).getTime() / 1000,
          relative_time_description: ''
        })),
        opening_hours: data.currentOpeningHours ? {
          open_now: data.currentOpeningHours.openNow,
          weekday_text: data.currentOpeningHours.weekdayDescriptions
        } : undefined,
        photos: data.photos?.map((p: PlacePhoto) => ({
          photo_reference: p.name,
          width: p.widthPx,
          height: p.heightPx
        })),
        price_level: data.priceLevel,
        types: data.types,
        website: data.websiteUri,
        url: data.googleMapsUri,
        business_status: data.businessStatus
      };
    });

    // Save to cache for future requests
    if (result) {
      await savePlaceDetailsToCache(placeId, result);
    }

    return result;
  } catch (error) {
    console.error('Place Details by ID API Error after retries:', error);
    return null;
  }
};

export const getPlaceLocation = async (name: string, latitude: number, longitude: number): Promise<{ lat: number; lng: number } | null> => {
  try {
    const place = await searchPlaceByName(name, latitude, longitude);

    if (!place || !place.location) return null;

    return {
      lat: place.location.latitude,
      lng: place.location.longitude
    };
  } catch (error) {
    console.error('Error fetching place location:', error);
    return null;
  }
};

export const getPlacePhotos = async (name: string, latitude: number, longitude: number): Promise<string[]> => {
  try {
    const place = await getPlaceFullDetails(name, latitude, longitude);

    if (!place || !place.photos) return [];

    // Filter photos
    const filteredPhotos = place.photos.filter((photo: any) => {
      const aspectRatio = photo.width / photo.height;
      return aspectRatio >= 0.5 && aspectRatio <= 2.5;
    });

    // Sort by width
    const sortedPhotos = filteredPhotos.sort((a: any, b: any) => b.width - a.width);

    // Return up to 8 photo URLs
    return sortedPhotos.slice(0, 8).map((photo: any) => getPlacePhotoUrl(photo.photo_reference));
  } catch (error) {
    console.error('Error fetching place photos:', error);
    return [];
  }
};

/**
 * Search for highly-rated places using Google Places API Text Search
 * Uses relevance ranking to prioritize top-rated local favorites
 */
/**
 * Generate search query based on categories
 */
const getCategoryQuery = (categories?: string[]): string => {
  if (!categories || categories.length === 0) {
    return 'best restaurants near me'; // Default to food
  }

  const queries: string[] = [];
  if (categories.includes('EAT')) queries.push('top restaurants');
  if (categories.includes('DRINK')) queries.push('best bars cocktail lounges');
  if (categories.includes('SIGHT')) queries.push('top attractions landmarks museums');
  if (categories.includes('DO')) queries.push('activities things to do entertainment');

  return queries.length > 0 ? queries.join(' ') + ' near me' : 'best places near me';
};

export const getNearbyPlaces = async (
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000,
  categories?: string[]
): Promise<any[]> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    return await fetchWithRetry(async () => {
      // Use Text Search instead of Nearby Search for better relevance ranking
      const url = `${PLACES_API_BASE}/places:searchText`;

      const requestBody: any = {
        textQuery: getCategoryQuery(categories), // Category-specific query
        locationBias: {
          circle: {
            center: {
              latitude,
              longitude
            },
            radius: radiusMeters
          }
        },
        rankPreference: 'DISTANCE', // Prioritize nearby places
        maxResultCount: 20 // Max allowed by API
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.businessStatus'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const places = data.places || [];

      // Assign categories to each place based on their types
      const placesWithCategories = places.map((place: any) => {
        const types = place.types || [];

        // Determine category from types - FOOD takes priority over bars
        const isFoodPlace = types.some((t: string) =>
          t.includes('restaurant') || t.includes('cafe') || t.includes('bakery') ||
          t.includes('meal') || t.includes('food'));

        const isDrinkPlace = types.some((t: string) =>
          t.includes('bar') || t.includes('night_club') || t.includes('liquor_store'));

        const isSight = types.some((t: string) =>
          t.includes('museum') || t.includes('art_gallery') || t.includes('landmark') ||
          t.includes('place_of_worship') || t.includes('park') ||
          (t.includes('tourist_attraction') && !t.includes('cafe') && !t.includes('restaurant')));

        const isDo = types.some((t: string) =>
          t.includes('amusement') || t.includes('aquarium') || t.includes('bowling') ||
          t.includes('casino') || t.includes('movie') || t.includes('spa') || t.includes('gym') ||
          t.includes('shopping') || t.includes('store'));

        // Priority: If it serves food (restaurant/cafe), it's EAT even if it has a bar
        // Only pure bars/nightclubs without food service are DRINK
        let category = 'EAT'; // Default
        if (isFoodPlace) {
          category = 'EAT';
        } else if (isDrinkPlace) {
          category = 'DRINK';
        } else if (isSight) {
          category = 'SIGHT';
        } else if (isDo) {
          category = 'DO';
        }

        return { ...place, detectedCategory: category };
      });

      // Filter for highly-rated places (3.5+ stars to catch more local favorites)
      const filteredPlaces = placesWithCategories.filter((place: any) => {
        const rating = place.rating || 0;

        // Skip closed businesses
        if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
          console.log(`🚫 Skipping closed business: ${place.displayName?.text || 'Unknown'} (${place.businessStatus})`);
          return false;
        }

        // If no categories selected, show all
        if (!categories || categories.length === 0) {
          return rating >= 3.5;
        }

        // Check if place matches the requested category
        const matchesCategory = categories.includes(place.detectedCategory);

        return rating >= 3.5 && matchesCategory;
      });

      console.log(`🔍 Text Search: ${places.length} total → ${filteredPlaces.length} highly-rated places (3.5+ stars, category: ${categories?.join(', ') || 'all'})`);
      if (filteredPlaces.length > 0) {
        console.log(`📊 Top results by review count:`);
        filteredPlaces.slice(0, 5).forEach((p: any, i: number) => {
          console.log(`   ${i + 1}. ${p.displayName?.text} - ${p.rating}⭐ (${p.userRatingCount || 0} reviews)`);
        });
      }
      return filteredPlaces;
    }) || [];
  } catch (error) {
    console.error('Nearby Places API Error after retries:', error);
    return [];
  }
};

/**
 * Get opening hours status for a place
 */
export const getPlaceOpenStatus = async (name: string, latitude: number, longitude: number): Promise<{ isOpen: boolean; openingHours?: any } | null> => {
  try {
    const place = await getPlaceFullDetails(name, latitude, longitude);

    if (!place) return null;

    if (!place.opening_hours) {
      if (place.business_status === 'OPERATIONAL') {
        return { isOpen: true };
      }
      return null;
    }

    return {
      isOpen: place.opening_hours.open_now || false,
      openingHours: place.opening_hours
    };
  } catch (error) {
    console.error('Error fetching place open status:', error);
    return null;
  }
};

// Legacy function - kept for compatibility but not used
export const getPlaceDetails = async (placeId: string): Promise<any | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    return await fetchWithRetry(async () => {
      const url = `${PLACES_API_BASE}/places/${placeId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'photos'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return {
        photos: data.photos?.map((p: PlacePhoto) => ({
          photo_reference: p.name,
          width: p.widthPx,
          height: p.heightPx
        }))
      };
    });
  } catch (error) {
    console.error('Place Details API Error after retries:', error);
    return null;
  }
};
