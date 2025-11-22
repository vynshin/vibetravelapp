/**
 * OpenStreetMap Overpass API Service
 *
 * FREE unlimited API - Community-maintained POI data
 * Used as fallback when Foursquare doesn't find enough DO venues
 *
 * Attribution required: © OpenStreetMap contributors
 */

import { PlaceCategory } from '../types';

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// OpenStreetMap tags for activity venues (DO category)
// Focus on specific interactive activities, exclude theaters/arts/outdoor spots
const DO_ACTIVITY_TAGS = {
  // Entertainment & Activities
  leisure: [
    'amusement_arcade',     // Arcades
    'bowling_alley',        // Bowling
    'escape_game',          // Escape rooms
    'trampoline_park',      // Trampoline parks
    'indoor_play',          // Indoor play areas
    'axe_throwing',         // Axe throwing venues
    'go_kart',              // Go kart tracks
    'miniature_golf',       // Mini golf
    'ice_rink',             // Ice skating
    // Removed 'climbing' - too many outdoor crags without addresses
  ],
  sport: [
    // Removed 'climbing' - returns outdoor rock climbing spots (crags)
    'table_tennis',         // Ping pong
    'badminton',            // Badminton
    'bowling',              // Bowling
    'billiards',            // Pool halls
    'archery',              // Archery ranges
    'shooting',             // Shooting ranges
    'karting',              // Go karts
    'paintball',            // Paintball
    '9pin',                 // Bowling variant
    'laser_tag',            // Laser tag
  ],
  amenity: [
    'internet_cafe',        // Internet cafes
    'public_bath',          // Bathhouses
    'spa',                  // Spas
  ],
  shop: [
    'games',                // Board game cafes with play areas
  ],
};

export interface OSMPlace {
  type: string; // 'node' or 'way'
  id: number;
  lat?: number; // nodes have lat/lon directly
  lon?: number;
  center?: { lat: number; lon: number }; // ways have center
  tags: {
    name?: string;
    'addr:street'?: string;
    'addr:housenumber'?: string;
    'addr:city'?: string;
    'addr:postcode'?: string;
    phone?: string;
    website?: string;
    opening_hours?: string;
    leisure?: string;
    sport?: string;
    amenity?: string;
    shop?: string;
    tourism?: string;
    [key: string]: string | undefined;
  };
}

interface OSMResponse {
  version: number;
  generator: string;
  elements: OSMPlace[];
}

/**
 * Build Overpass QL query for activity venues
 */
function buildOverpassQuery(
  latitude: number,
  longitude: number,
  radiusMeters: number
): string {
  // Build the query parts for each tag category
  // Search both nodes (points) and ways (areas/buildings) since venues can be either
  const queryParts: string[] = [];

  // Add leisure tags (nodes + ways)
  DO_ACTIVITY_TAGS.leisure.forEach(value => {
    queryParts.push(`node["leisure"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
    queryParts.push(`way["leisure"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
  });

  // Add sport tags (nodes + ways)
  DO_ACTIVITY_TAGS.sport.forEach(value => {
    queryParts.push(`node["sport"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
    queryParts.push(`way["sport"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
  });

  // Add amenity tags (nodes + ways)
  DO_ACTIVITY_TAGS.amenity.forEach(value => {
    queryParts.push(`node["amenity"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
    queryParts.push(`way["amenity"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
  });

  // Add shop tags (nodes + ways)
  DO_ACTIVITY_TAGS.shop.forEach(value => {
    queryParts.push(`node["shop"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
    queryParts.push(`way["shop"="${value}"](around:${radiusMeters},${latitude},${longitude});`);
  });

  // Combine all parts into Overpass QL syntax
  const query = `
    [out:json][timeout:25];
    (
      ${queryParts.join('\n      ')}
    );
    out body center;
  `;

  return query;
}

/**
 * Search for activity venues near a location using OSM Overpass API
 */
export async function searchOSMActivities(
  latitude: number,
  longitude: number,
  radiusMeters: number = 8000 // 5 miles default for DO
): Promise<OSMPlace[]> {
  try {
    const query = buildOverpassQuery(latitude, longitude, radiusMeters);

    console.log(`🗺️ OSM Overpass: Searching ${(radiusMeters/1000).toFixed(1)}km radius for activities`);

    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.error(`❌ OSM Overpass API error: ${response.status}`);
      return [];
    }

    const data: OSMResponse = await response.json();

    // Filter: must have name AND a STREET address
    // This excludes outdoor spots (crags, trails) which only have city tags
    // Accept both nodes (points) and ways (buildings/areas)
    const places = data.elements.filter((el): el is OSMPlace => {
      if (!el.tags?.name) return false;
      if (el.type !== 'node' && el.type !== 'way') return false;

      // MUST have a street address (real businesses always have street addresses)
      // Outdoor spots (crags, parks) often only have city tags, not streets
      const hasStreet = !!el.tags['addr:street'];

      return hasStreet;
    });

    console.log(`✅ OSM found ${places.length} activity venues (nodes + ways, filtered for addresses)`);

    // Debug: Log sample venues
    if (places.length > 0) {
      console.log('🗺️ Sample OSM venues:');
      places.slice(0, 3).forEach(p => {
        const type = p.tags.leisure || p.tags.sport || p.tags.amenity || p.tags.shop || 'attraction';
        console.log(`  - ${p.tags.name}: ${type}`);
      });
    }

    return places;
  } catch (error) {
    console.error('❌ OSM Overpass search error:', error);
    return [];
  }
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format OSM place address
 */
export function formatOSMAddress(place: OSMPlace): string {
  const { tags } = place;
  const parts: string[] = [];

  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }

  if (tags['addr:city']) {
    parts.push(tags['addr:city']);
  }

  if (tags['addr:postcode']) {
    parts.push(tags['addr:postcode']);
  }

  return parts.join(', ') || 'Address not available';
}

/**
 * Build Google Maps link from OSM coordinates
 */
export function buildMapsLinkFromOSM(place: OSMPlace): string {
  const { tags } = place;
  // Ways have center, nodes have lat/lon
  const lat = place.lat ?? place.center?.lat;
  const lon = place.lon ?? place.center?.lon;

  if (!lat || !lon) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tags.name || '')}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}&query_place_id=${encodeURIComponent(tags.name || '')}`;
}

/**
 * Get category description from OSM tags
 */
export function getOSMCategoryDescription(place: OSMPlace): string {
  const { tags } = place;

  // Leisure activities
  if (tags.leisure === 'amusement_arcade') return 'Arcade';
  if (tags.leisure === 'bowling_alley') return 'Bowling Alley';
  if (tags.leisure === 'escape_game') return 'Escape Room';
  if (tags.leisure === 'trampoline_park') return 'Trampoline Park';
  if (tags.leisure === 'axe_throwing') return 'Axe Throwing';
  if (tags.leisure === 'go_kart') return 'Go Kart Track';
  if (tags.leisure === 'miniature_golf') return 'Mini Golf';
  if (tags.leisure === 'ice_rink') return 'Ice Skating Rink';
  if (tags.leisure === 'climbing') return 'Climbing Gym';
  if (tags.leisure === 'indoor_play') return 'Indoor Play Center';

  // Sport activities
  if (tags.sport === 'climbing') return 'Rock Climbing';
  if (tags.sport === 'table_tennis') return 'Ping Pong / Table Tennis';
  if (tags.sport === 'badminton') return 'Badminton';
  if (tags.sport === 'billiards') return 'Pool Hall / Billiards';
  if (tags.sport === 'archery') return 'Archery Range';
  if (tags.sport === 'paintball') return 'Paintball';
  if (tags.sport === 'bowling') return 'Bowling';
  if (tags.sport === '9pin') return 'Bowling';
  if (tags.sport === 'karting') return 'Go Kart Racing';
  if (tags.sport === 'shooting') return 'Shooting Range';
  if (tags.sport === 'laser_tag') return 'Laser Tag';

  // Amenities
  if (tags.amenity === 'internet_cafe') return 'Internet Cafe';
  if (tags.amenity === 'spa') return 'Spa';
  if (tags.amenity === 'public_bath') return 'Bathhouse';

  // Shop
  if (tags.shop === 'games') return 'Board Game Cafe';

  // Fallback
  return tags.leisure || tags.sport || tags.amenity || tags.shop || 'Activity Venue';
}
