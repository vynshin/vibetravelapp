import Constants from 'expo-constants';
import { Coordinates } from '../types';

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

interface GeocodeResult {
  coords: Coordinates;
  formattedAddress: string;
}

/**
 * Geocode a location string to coordinates
 * Biases results toward the user's current location for ambiguous queries
 */
export const geocodeLocation = async (
  location: string,
  biasLocation?: Coordinates
): Promise<GeocodeResult | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('API key not found');
    return null;
  }

  try {
    console.log('🌍 Geocoding location:', location);
    const params = new URLSearchParams({
      address: location,
      key: apiKey,
    });

    // Add location bias if available (helps disambiguate "cambridge" → closest one)
    if (biasLocation) {
      params.append('location', `${biasLocation.latitude},${biasLocation.longitude}`);
      params.append('radius', '50000'); // 50km bias radius
    }

    const response = await fetch(`${GEOCODING_API_URL}?${params.toString()}`);
    const data = await response.json();

    console.log('📍 Geocoding response:', data.status, data.results?.[0]?.formatted_address);

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0];
      const geocoded = {
        coords: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
        },
        formattedAddress: result.formatted_address,
      };
      console.log('✅ Geocoded to:', geocoded.formattedAddress, geocoded.coords);
      return geocoded;
    }

    console.warn('❌ Geocoding failed:', data.status, data.error_message);
    return null;
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    return null;
  }
};

/**
 * Parse a search query for location keywords
 * Returns { query: "croissants", location: "italy" } or { query: "pizza", location: null }
 */
export const parseLocationFromQuery = (
  searchQuery: string
): { query: string; location: string | null } => {
  const trimmed = searchQuery.trim();
  
  // Match patterns like "X in Y", "X near Y", "X around Y"
  const patterns = [
    /(.+?)\s+in\s+(.+)/i,
    /(.+?)\s+near\s+(.+)/i,
    /(.+?)\s+around\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        query: match[1].trim(),
        location: match[2].trim(),
      };
    }
  }

  // No location found
  return { query: trimmed, location: null };
};

/**
 * Reverse geocode coordinates to get city/location name
 */
export const reverseGeocode = async (coords: Coordinates): Promise<string | null> => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('API key not found');
    return null;
  }

  try {
    const params = new URLSearchParams({
      latlng: `${coords.latitude},${coords.longitude}`,
      key: apiKey,
      result_type: 'locality|sublocality', // Prioritize city-level results
    });

    const response = await fetch(`${GEOCODING_API_URL}?${params.toString()}`);
    const data = await response.json();

    console.log('🌍 Reverse geocoding:', coords, '→', data.results?.[0]?.formatted_address);

    if (data.status === 'OK' && data.results.length > 0) {
      // Look through results to find the most specific locality
      for (const result of data.results) {
        // Prioritize results with 'locality' type (city/town)
        if (result.types.includes('locality')) {
          const locality = result.address_components?.find(
            (component: any) => component.types.includes('locality')
          );
          if (locality) {
            const state = result.address_components?.find(
              (component: any) => component.types.includes('administrative_area_level_1')
            );
            const cityName = state ? `${locality.long_name}, ${state.short_name}` : locality.long_name;
            console.log('✅ Found city:', cityName);
            return cityName;
          }
        }
      }
      
      // Fallback: try sublocality or neighborhood
      for (const result of data.results) {
        const sublocality = result.address_components?.find(
          (component: any) => component.types.includes('sublocality') || component.types.includes('neighborhood')
        );
        if (sublocality) {
          return sublocality.long_name;
        }
      }
      
      // Last resort: use formatted address
      return data.results[0].formatted_address;
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};
