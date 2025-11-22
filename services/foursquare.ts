/**
 * Foursquare Places API Service
 *
 * Cost-effective alternative to Google Places:
 * - 10,000 FREE calls/month
 * - $0.015/call after (vs Google's $0.017-0.032)
 *
 * Used for: Place Search, Place Details
 * Google still used for: Photos (better quality)
 */

import { PlaceCategory } from '../types';

const FOURSQUARE_API_KEY = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY || '';
// New Places API endpoint (not the deprecated v3)
const BASE_URL = 'https://places-api.foursquare.com';
// Required version header for new API
const API_VERSION = '2025-06-17';

// Foursquare category IDs mapped to our app categories
// Using 24-character hex IDs from the new Places API
const CATEGORY_MAPPING: Record<PlaceCategory, string[]> = {
  [PlaceCategory.EAT]: [
    '4d4b7105d754a06374d81259', // Food (parent category)
    '4bf58dd8d48988d1c4941735', // Restaurant
    '4bf58dd8d48988d16c941735', // Burger Joint
    '4bf58dd8d48988d1ca941735', // Pizza Place
    '4bf58dd8d48988d110941735', // Italian Restaurant
    '4bf58dd8d48988d16e941735', // Fast Food
    '4bf58dd8d48988d16a941735', // Bakery
    '4bf58dd8d48988d143941735', // Breakfast Spot
  ],
  [PlaceCategory.DRINK]: [
    '4d4b7105d754a06376d81259', // Nightlife (parent)
    '4bf58dd8d48988d116941735', // Bar
    '4bf58dd8d48988d11b941735', // Pub
    '4bf58dd8d48988d117941735', // Beer Garden
    '4bf58dd8d48988d11e941735', // Cocktail Bar
    '4bf58dd8d48988d119941735', // Wine Bar
    '4bf58dd8d48988d1e0931735', // Coffee Shop
    '4bf58dd8d48988d155941735', // Brewery
  ],
  [PlaceCategory.EXPLORE]: [
    // Sights & Landmarks
    '4bf58dd8d48988d181941735', // Museum
    '4bf58dd8d48988d18f941735', // Art Museum
    '4bf58dd8d48988d190941735', // History Museum
    '4bf58dd8d48988d191941735', // Science Museum
    '4bf58dd8d48988d1e2931735', // Art Gallery
    '4deefb944765f83613cdba6e', // Historic Site
    '4bf58dd8d48988d12d941735', // Monument / Landmark
    '4bf58dd8d48988d163941735', // Park
    '4bf58dd8d48988d165941735', // Scenic Lookout
    '4bf58dd8d48988d17b941735', // Zoo
    '52e81612bcbc57f1066b7a22', // Botanical Garden
    '52e81612bcbc57f1066b7a14', // Palace
    // Activities & Entertainment
    '4d4b7104d754a06370d81259', // Arts & Entertainment (parent)
    '4bf58dd8d48988d17f941735', // Movie Theater
    '4bf58dd8d48988d1ac941735', // Concert Hall
    '4bf58dd8d48988d182941735', // Theme Park
    '4bf58dd8d48988d1e1931735', // Arcade
    '4bf58dd8d48988d184941735', // Bowling Alley
    '52e81612bcbc57f1066b7a21', // Spa
    '52e81612bcbc57f1066b7a13', // Trampoline Park
    '4bf58dd8d48988d1e3931735', // Pool Hall
    '58daa1558bbb0b01f18ec1b1', // Go Kart Track
    '52e81612bcbc57f1066b79eb', // Climbing Gym
    '4bf58dd8d48988d1e9931735', // Rock Climbing Spot
    '4bf58dd8d48988d168941735', // Golf Course
    '4bf58dd8d48988d167941735', // Mini Golf
    '5bae9231bedf3950379f89d4', // Golf Driving Range
    '4bf58dd8d48988d1e4931735', // Batting Cage
    '4bf58dd8d48988d1e5931735', // Shooting Range
    '52e81612bcbc57f1066b7a2e', // Laser Tag
    '56aa371be4b08b9a8d573541', // Escape Room
    '4bf58dd8d48988d15c941735', // Ice Skating Rink
    '4bf58dd8d48988d15d941735', // Roller Rink
    '5032833091d4c4b30a586d60', // Recreation Center
    '4bf58dd8d48988d159941735', // Hiking Trail
    '52e81612bcbc57f1066b7a0d', // Trail
    '4bf58dd8d48988d1f0931735', // Internet Cafe
    '52e81612bcbc57f1066b7a26', // Axe Throwing
    '5744ccdfe4b0c0459246b4c3', // VR Cafe
    '4bf58dd8d48988d1e8931735', // Paintball Field
    '4f4528bc4b90abdf24c9de85', // Badminton Court
    '52e81612bcbc57f1066b7a27', // Table Tennis
  ],
  [PlaceCategory.UNKNOWN]: [],
};

// New API response format (places-api.foursquare.com)
export interface FoursquarePlace {
  fsq_place_id: string; // New API uses fsq_place_id
  name: string;
  geocodes?: {
    main?: {
      latitude: number;
      longitude: number;
    };
  };
  location: {
    address?: string;
    formatted_address?: string;
    locality?: string;
    region?: string;
    postcode?: string;
    country?: string;
    cross_street?: string;
  };
  categories: Array<{
    fsq_category_id: string; // New API uses fsq_category_id
    name: string;
    short_name?: string;
    icon: {
      prefix: string;
      suffix: string;
    };
  }>;
  chains?: Array<{ fsq_chain_id: string; name: string }>;
  distance?: number;
  rating?: number; // 0-10 scale
  stats?: {
    total_ratings?: number;
    total_tips?: number;
  };
  hours?: {
    display?: string;
    is_local_holiday?: boolean;
    open_now?: boolean;
  };
  tel?: string;
  website?: string;
  price?: number; // 1-4 scale
  photos?: Array<{
    id: string;
    prefix: string;
    suffix: string;
    width: number;
    height: number;
  }>;
  tips?: Array<{
    id: string;
    text: string;
    created_at: string;
  }>;
  popularity?: number; // 0-1 scale
  verified?: boolean;
  // Legacy support
  fsq_id?: string; // Alias for fsq_place_id
}

/**
 * Search for places near a location
 */
export async function searchFoursquarePlaces(
  latitude: number,
  longitude: number,
  radiusMeters: number = 3200,
  categories?: PlaceCategory[],
  query?: string,
  limit: number = 20
): Promise<FoursquarePlace[]> {
  if (!FOURSQUARE_API_KEY) {
    console.log('⚠️ Foursquare API key not configured, falling back to Google');
    return [];
  }

  try {
    // New API returns all available fields by default (including rating and stats)
    // Foursquare API max radius is 100,000m (100km), must be integer
    const validRadius = Math.min(Math.round(radiusMeters), 100000);
    const params = new URLSearchParams({
      ll: `${latitude},${longitude}`,
      radius: validRadius.toString(),
      limit: limit.toString(),
      sort: 'RELEVANCE',
      fields: 'name,location,geocodes,categories,distance,rating,stats,hours,tel,website,price,photos,popularity',
    });

    // Add category filter
    // If categories specified, use those. Otherwise, use ALL hospitality categories to exclude retail/non-hospitality
    const categoriesToFetch = categories && categories.length > 0
      ? categories
      : [PlaceCategory.EAT, PlaceCategory.DRINK, PlaceCategory.EXPLORE];

    const categoryIds = categoriesToFetch
      .flatMap(cat => CATEGORY_MAPPING[cat] || [])
      .join(',');

    if (categoryIds) {
      params.append('categories', categoryIds);
      const categoryNames = categoriesToFetch.map(c => c.toString()).join(', ');
      console.log(`📁 Filtering by ${categoryNames} (${categoryIds.split(',').length} Foursquare category IDs)`);
    }

    // Add query if specified (but not for DO - let category IDs handle it)
    if (query && query !== 'default') {
      params.append('query', query);
    }

    const url = `${BASE_URL}/places/search?${params.toString()}`;
    console.log(`🔍 Foursquare search: ${latitude.toFixed(4)},${longitude.toFixed(4)} within ${validRadius}m (${(validRadius/1000).toFixed(1)}km)`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FOURSQUARE_API_KEY}`,
        'Accept': 'application/json',
        'X-Places-Api-Version': API_VERSION,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Foursquare API error ${response.status}:`, errorText);
      console.error(`   Request params:`, params.toString());
      throw new Error(`Foursquare API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const places = data.results || [];

    console.log(`✅ Foursquare found ${places.length} places`);

    // Debug: Log sample categories and photos
    if (places.length > 0) {
      console.log('📂 Sample Foursquare categories:');
      places.slice(0, 3).forEach((p: FoursquarePlace) => {
        const catNames = p.categories?.map(c => `${c.name} (${c.fsq_category_id})`).join(', ') || 'none';
        const photoCount = p.photos?.length || 0;
        console.log(`  - ${p.name}: ${catNames} [${photoCount} photos]`);
      });
    }

    return places;
  } catch (error) {
    console.error('❌ Foursquare search error:', error);
    return [];
  }
}

/**
 * Get detailed info for a specific place
 */
export async function getFoursquarePlaceDetails(fsqId: string): Promise<FoursquarePlace | null> {
  if (!FOURSQUARE_API_KEY) {
    return null;
  }

  try {
    const url = `${BASE_URL}/places/${fsqId}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FOURSQUARE_API_KEY}`,
        'Accept': 'application/json',
        'X-Places-Api-Version': API_VERSION,
      },
    });

    if (!response.ok) {
      throw new Error(`Foursquare details error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Foursquare details error:', error);
    return null;
  }
}

/**
 * Get photos for a place (Premium endpoint - costs more)
 */
export async function getFoursquarePhotos(fsqId: string, limit: number = 5): Promise<string[]> {
  if (!FOURSQUARE_API_KEY) {
    return [];
  }

  try {
    const url = `${BASE_URL}/places/${fsqId}/photos?limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${FOURSQUARE_API_KEY}`,
        'Accept': 'application/json',
        'X-Places-Api-Version': API_VERSION,
      },
    });

    if (!response.ok) {
      return [];
    }

    const photos = await response.json();
    return photos.map((photo: any) => `${photo.prefix}400x400${photo.suffix}`);
  } catch (error) {
    console.error('❌ Foursquare photos error:', error);
    return [];
  }
}

/**
 * Map Foursquare category to our app category
 */
export function mapFoursquareCategory(fsqCategories: FoursquarePlace['categories']): PlaceCategory {
  if (!fsqCategories || fsqCategories.length === 0) {
    return PlaceCategory.UNKNOWN;
  }

  const categoryId = fsqCategories[0].fsq_category_id || '';
  const categoryName = fsqCategories[0].name.toLowerCase();

  // Check by category ID - match against our CATEGORY_MAPPING
  for (const [appCategory, ids] of Object.entries(CATEGORY_MAPPING)) {
    if (ids.includes(categoryId)) {
      return appCategory as PlaceCategory;
    }
  }

  // Fallback: Check by category name keywords

  // First check for NON-HOSPITALITY (return UNKNOWN to filter out)
  const nonHospitalityKeywords = [
    'store', 'shop', 'retail', 'clothing', 'apparel', 'furniture', 'hardware',
    'automotive', 'sporting goods', 'department', 'discount', 'grocery', 'supermarket',
    'pharmacy', 'drugstore', 'bank', 'atm', 'gas station', 'medical', 'hospital',
    'clinic', 'butcher', 'meat market', 'tuxedo', 'formal wear', 'paintball'
  ];

  // Exception: food-related markets are OK
  const isFoodRelated = categoryName.includes('food') || categoryName.includes('farmers') ||
                        categoryName.includes('restaurant') || categoryName.includes('eatery') ||
                        categoryName.includes('dining') || categoryName.includes('kitchen');

  if (!isFoodRelated && nonHospitalityKeywords.some(keyword => categoryName.includes(keyword))) {
    return PlaceCategory.UNKNOWN; // Will be filtered out
  }

  // DRINK
  if (categoryName.includes('bar') || categoryName.includes('pub') || categoryName.includes('brewery') ||
      categoryName.includes('wine') || categoryName.includes('cocktail') || categoryName.includes('nightclub')) {
    return PlaceCategory.DRINK;
  }
  if (categoryName.includes('coffee') || categoryName.includes('café') || categoryName.includes('cafe')) {
    return PlaceCategory.DRINK;
  }

  // EXPLORE - sights, landmarks, activities, and entertainment
  if (categoryName.includes('museum') || categoryName.includes('monument') || categoryName.includes('landmark') ||
      categoryName.includes('historic') || categoryName.includes('gallery') || categoryName.includes('park') ||
      categoryName.includes('garden') || categoryName.includes('zoo') || categoryName.includes('scenic') ||
      categoryName.includes('trampoline') || categoryName.includes('archery') || categoryName.includes('axe throwing') ||
      categoryName.includes('bowling') || categoryName.includes('arcade') || categoryName.includes('escape room') ||
      categoryName.includes('laser tag') || categoryName.includes('go kart') || categoryName.includes('climbing') ||
      categoryName.includes('golf') || categoryName.includes('mini golf') || categoryName.includes('putt') ||
      categoryName.includes('driving range') || categoryName.includes('simulator') ||
      categoryName.includes('theater') || categoryName.includes('theatre') || categoryName.includes('cinema') ||
      categoryName.includes('skating') || categoryName.includes('spa') || categoryName.includes('pool hall') ||
      categoryName.includes('billiard') || categoryName.includes('pool table') || categoryName.includes('game room') ||
      categoryName.includes('gaming') || categoryName.includes('recreation') || categoryName.includes('fun center') ||
      categoryName.includes('hiking') || categoryName.includes('trail') || categoryName.includes('internet cafe') ||
      categoryName.includes('cyber cafe') || categoryName.includes('vr') || categoryName.includes('virtual reality') ||
      categoryName.includes('ping pong') || categoryName.includes('table tennis') || categoryName.includes('badminton') ||
      categoryName.includes('paintball') || categoryName.includes('rock wall') || categoryName.includes('bouldering')) {
    return PlaceCategory.EXPLORE;
  }

  // EAT - only if food-related
  if (isFoodRelated) {
    return PlaceCategory.EAT;
  }

  // Unknown - will be filtered out
  return PlaceCategory.UNKNOWN;
}

/**
 * Convert Foursquare rating (0-10) to display string
 */
export function formatFoursquareRating(rating?: number, totalRatings?: number): string {
  if (!rating) return 'New';

  // Convert 0-10 to 0-5 scale
  const fiveStarRating = (rating / 2).toFixed(1);
  const reviewCount = totalRatings || 0;

  return `${fiveStarRating} stars (${reviewCount} reviews)`;
}

/**
 * Build Google Maps link from Foursquare location
 */
export function buildMapsLink(place: FoursquarePlace): string {
  // New API has geocodes.main with lat/lng
  const lat = place.geocodes?.main?.latitude;
  const lng = place.geocodes?.main?.longitude;

  if (lat && lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${encodeURIComponent(place.name)}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.location?.formatted_address || ''))}`;
}
