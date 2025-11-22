
import { GoogleGenAI } from "@google/genai";
import { Coordinates, Place, PlaceCategory, Review } from "../types";
import Constants from 'expo-constants';
// Google Places API removed - too expensive ($300/day in testing)
import { reverseGeocode } from './geocoding';
import {
  searchFoursquarePlaces,
  getFoursquarePlaceDetails,
  mapFoursquareCategory,
  formatFoursquareRating,
  buildMapsLink,
  FoursquarePlace
} from './foursquare';
import {
  searchOSMActivities,
  formatOSMAddress,
  buildMapsLinkFromOSM,
  getOSMCategoryDescription,
  OSMPlace
} from './openstreetmap';

// TEMPORARY: Bypass Gemini and use Google Places API only (for quota testing)
const BYPASS_GEMINI = true;

// Use Foursquare for search/details (FREE up to 10K calls/month)
// Falls back to Google if Foursquare API key not set
const USE_FOURSQUARE = process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ? true : false;

// Major chain restaurants to filter out (prefer local favorites)
const CHAIN_BLOCKLIST = [
  'mcdonalds', 'mcdonald\'s', 'burger king', 'wendy\'s', 'wendys',
  'dunkin', 'dunkin donuts', 'dunkin\'', 'starbucks',
  'subway', 'taco bell', 'kfc', 'popeyes', 'chipotle',
  'panera bread', 'five guys', 'chick-fil-a', 'chick fil a',
  'sonic drive-in', 'sonic', 'arby\'s', 'arbys',
  'pizza hut', 'dominos', 'domino\'s', 'papa john\'s', 'papa johns',
  'applebee\'s', 'applebees', 'olive garden', 'red lobster',
  'chili\'s', 'chilis', 'outback steakhouse', 'buffalo wild wings',
  'ihop', 'denny\'s', 'dennys', 'waffle house',
  'panda express', 'dairy queen', 'tgi fridays', 'tgi friday\'s',
  'texas roadhouse'
];

/**
 * Check if a place name matches a chain in the blocklist
 */
const isChainRestaurant = (placeName: string): boolean => {
  const normalized = placeName.toLowerCase().trim();
  return CHAIN_BLOCKLIST.some(chain => normalized.includes(chain));
};

interface PlaceDiscovery {
  name: string;
  category: PlaceCategory;
  vibe: string;
  placeId?: string; // Optional Place ID for cost optimization (skips searchText call)
}

const getClient = () => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
  return new GoogleGenAI({ apiKey });
};

/**
 * Phase 1: Use Gemini to discover place names matching user intent
 * Returns simplified list of place names + categories only
 */
const discoverPlaceNames = async (
  coords: Coordinates,
  searchQuery?: string,
  radiusKm: number = 4.8,
  hotAndNew: boolean = false,
  count: number = 12,
  categories?: string[]
): Promise<{ city: string; discoveries: PlaceDiscovery[] }> => {
  const ai = getClient();
  const modelId = "gemini-2.0-flash-exp"; // Experimental model with higher quotas

  // Determine search intent
  const searchLower = searchQuery?.toLowerCase() || '';
  const isFoodSearch = /\b(pizza|ramen|sushi|burger|steak|pasta|tacos|sandwich|noodles|curry|bbq|seafood|chicken|pork|beef|salad|soup|breakfast|brunch|lunch|dinner)\b/i.test(searchLower);
  const isEatSearch = isFoodSearch || /\b(eat|food|restaurant|dining|cuisine)\b/i.test(searchLower);

  // Special handling for coffee/tea - these should be DRINK but specifically cafes/coffee shops
  const isCoffeeSearch = /\b(coffee|cafe|cappuccino|latte|espresso|tea)\b/i.test(searchLower);
  const isAlcoholSearch = /\b(bar|cocktail|brewery|beer|wine|pub|nightclub|lounge)\b/i.test(searchLower);
  const isDrinkSearch = isCoffeeSearch || isAlcoholSearch || /\b(drink|juice)\b/i.test(searchLower);

  const isDoSearch = /\b(do|activities|things to do|entertainment|sports|gym|spa|park)\b/i.test(searchLower);
  const isSightSearch = /\b(sight|see|view|landmark|attraction|museum|monument|statue|building|architecture)\b/i.test(searchLower);
  const isIconicSearch = /\b(iconic|famous|popular|tourist|must.see|top|best)\b/i.test(searchLower);

  let categoryGuidance = '';
  let iconicGuidance = '';

  if (isIconicSearch) {
    iconicGuidance = '\n\nICONIC/TOURIST MODE:\n- Prioritize world-famous landmarks and attractions with 2000+ reviews\n- Include must-see tourist destinations\n- Focus on places featured in travel guides\n- Examples: Statue of Liberty, Eiffel Tower, Space Needle, etc.';
  }

  // Check if category filters are active (takes precedence over search query)
  if (categories && categories.length > 0) {
    const categoryList = categories.map(cat => {
      if (cat === 'EAT') return 'EAT category (restaurants, cafes, dining)';
      if (cat === 'DRINK') return 'DRINK category (bars, breweries, coffee shops, cocktail lounges)';
      if (cat === 'SIGHT') return 'SIGHT category (landmarks, viewpoints, monuments, museums)';
      if (cat === 'DO') return 'DO category (activities, entertainment, sports, things to do)';
      return cat;
    }).join(' OR ');
    categoryGuidance = `ALL results MUST be ${categoryList}.`;
  } else if (isEatSearch) categoryGuidance = 'ALL results MUST be EAT category (restaurants, cafes, dining).';
  else if (isCoffeeSearch) categoryGuidance = 'ALL results MUST be DRINK category (coffee shops, cafes, tea houses). ONLY places known for coffee/tea - NO bars, breweries, or pubs.';
  else if (isAlcoholSearch) categoryGuidance = 'ALL results MUST be DRINK category (bars, breweries, cocktail bars, pubs, wine bars). ONLY places serving alcohol - NO coffee shops.';
  else if (isDrinkSearch) categoryGuidance = 'ALL results MUST be DRINK category (bars, breweries, coffee shops).';
  else if (isDoSearch) categoryGuidance = 'ALL results MUST be DO category (activities, entertainment, sports).';
  else if (isSightSearch) categoryGuidance = 'ALL results MUST be SIGHT category (landmarks, viewpoints, monuments).';
  else if (searchQuery) categoryGuidance = `Find places matching "${searchQuery}" across all categories.`;
  else categoryGuidance = 'Provide a diverse mix: 4 EAT, 3 DRINK, 3 DO, 2 SIGHT.';

  let hotAndNewGuidance = '';
  if (hotAndNew) {
    hotAndNewGuidance = `

🔥 HOT & NEW MODE:
- ONLY newly opened HOSPITALITY BUSINESSES (restaurants, bars, cafes, nightclubs, lounges) from 2024-2025
- Recently renovated or rebranded food/drink establishments
- Trending, buzzing, viral spots currently generating buzz
- Cross-reference with curated sources from the last 6 months:
  * Resy Hit List (newest restaurant openings)
  * Time Out (best new restaurants and bars)
  * Eater (new restaurant coverage and heatmaps)
  * Yelp (trending and recently opened)
  * OpenTable (new and notable restaurants)
- Prioritize places featured in multiple sources above
- EXCLUDE: pharmacies, drugstores, retail stores, grocery stores, gas stations, banks, medical facilities
- NO public art, construction projects, parks, or historic sites`;
  }

  const prompt = `I am at latitude: ${coords.latitude}, longitude: ${coords.longitude}.
${searchQuery ? `Focus on: "${searchQuery}"` : ''}${hotAndNewGuidance}${iconicGuidance}

Task: Find ${count} ${isIconicSearch ? 'iconic tourist' : hotAndNew ? 'trending' : 'diverse, highly-rated'} places nearby.
${categoryGuidance}

Search Area:
- Search within ${radiusKm}km (${(radiusKm * 0.621371).toFixed(1)} miles) radius
- Include places in neighboring towns/suburbs within this range
- Don't limit to just the city center - explore the full radius

Requirements:
- ONLY real, currently operating businesses with physical locations
- Each MUST have a street address (not just city/state)
- Use Google Maps grounding to verify they exist and get accurate locations
- ${hotAndNew || isIconicSearch ? '' : 'IMPORTANT: Mix of popular spots (50%) AND local hidden gems (50%)\n- '}Include neighborhood favorites, family-owned restaurants, unique local spots
- Avoid generic chains when possible (unless they're exceptional)
- Prefer ${isIconicSearch ? 'world-famous, must-see' : 'highly-rated (3.5+ stars)'} places
- DO NOT include hotels as SIGHT unless they have a specific attraction (restaurant, rooftop bar, observatory)
- Hotels should ONLY appear if they're specifically known for EAT (restaurant) or DRINK (rooftop bar)

For each place provide:
1. Exact business name
2. Category (EAT, DRINK, DO, or SIGHT)
3. One-line vibe description (5-8 words max)

Output format (one per line):
City: [City Name]
[Name] | [Category] | [Vibe]

NO numbering, bullets, or markdown formatting. Plain text only.`;

  try {
    console.log(`🔍 Gemini: Discovering ${count} places...`);
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          },
        },
      },
    });

    const text = response.text || "";
    const lines = text.split("\n").filter((l) => l.trim() !== "");

    let city = "Unknown Location";
    const discoveries: PlaceDiscovery[] = [];

    // Filter out non-hospitality businesses
    const invalidKeywords = [
      'cvs', 'walgreens', 'pharmacy', 'drugstore', 'rite aid',
      'grocery', 'supermarket', 'walmart', 'target', 'safeway', 'whole foods',
      'gas station', 'shell', 'chevron', 'exxon', 'bp', '7-eleven',
      'bank', 'chase', 'wells fargo', 'citibank', 'atm',
      'clinic', 'hospital', 'urgent care', 'medical center',
      'post office', 'usps', 'fedex', 'ups',
      'laundromat', 'dry clean', 'car wash'
    ];

    lines.forEach((line) => {
      if (line.startsWith("City:")) {
        city = line.replace("City:", "").trim();
        return;
      }

      const parts = line.split("|");
      if (parts.length >= 3) {
        let name = parts[0].trim();
        name = name.replace(/^\*\*|\*\*$/g, '').replace(/^\d+\.\s*/, '').trim();

        // Skip if name contains invalid keywords
        const nameLower = name.toLowerCase();
        if (invalidKeywords.some(keyword => nameLower.includes(keyword))) {
          console.log(`❌ Filtering out non-hospitality business: ${name}`);
          return;
        }

        const categoryRaw = parts[1].trim().toUpperCase();
        const vibe = parts[2].trim();

        let category = PlaceCategory.UNKNOWN;
        if (categoryRaw.includes("EAT")) category = PlaceCategory.EAT;
        else if (categoryRaw.includes("DRINK")) category = PlaceCategory.DRINK;
        else if (categoryRaw.includes("EXPLORE") || categoryRaw.includes("DO") || categoryRaw.includes("SIGHT")) category = PlaceCategory.EXPLORE;
        else category = PlaceCategory.EXPLORE;

        discoveries.push({ name, category, vibe });
      }
    });

    console.log(`✅ Gemini discovered ${discoveries.length} places`);
    if (discoveries.length > 0) {
      console.log(`📋 Gemini discoveries by category:`, discoveries.map(d => `${d.name} (${d.category})`).join(', '));
    }
    return { city, discoveries };
  } catch (error) {
    console.error("Gemini discovery error:", error);
    throw error;
  }
};

/**
 * Batch summarize multiple reviews in a single API call
 */
const batchSummarizeReviews = async (
  reviews: Array<{ placeName: string; reviewText: string; id: string }>
): Promise<Map<string, string>> => {
  if (reviews.length === 0) return new Map();

  const ai = getClient();

  // Build batch prompt with all reviews
  const reviewsList = reviews
    .map((r, idx) => `[ID: ${r.id}]\nPlace: ${r.placeName}\nReview: "${r.reviewText}"`)
    .join('\n\n---\n\n');

  const prompt = `Summarize these Google reviews. For each review, output 3-4 SHORT sentences focusing on: food/drink quality, service, atmosphere, must-try items, pricing, or notable experiences.

${reviewsList}

Output format (one per review):
[ID: review_id]
[Summary text here]

NO numbering, bullets, or extra formatting. Just ID and summary.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    const text = response.text || "";
    const summaries = new Map<string, string>();

    // Parse response - match [ID: xxx] followed by summary text
    const blocks = text.split(/\[ID:\s*/i).filter(b => b.trim());

    blocks.forEach(block => {
      const lines = block.split('\n');
      const idMatch = lines[0].match(/^([^\]]+)\]/);
      if (idMatch) {
        const id = idMatch[1].trim();
        const summary = lines.slice(1).join('\n').trim();
        if (summary) {
          summaries.set(id, summary);
        }
      }
    });

    return summaries;
  } catch (error: any) {
    console.error('Batch review summarization error:', error);
    // Fallback: truncate originals
    const fallbackMap = new Map<string, string>();
    reviews.forEach(r => {
      const sentences = r.reviewText.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const truncated = sentences.slice(0, 3).join('. ').trim() + '.';
      fallbackMap.set(r.id, truncated);
    });
    return fallbackMap;
  }
};

/**
 * Phase 2: Generate "Know Before You Go" tips for a place using Gemini
 * Now exported for lazy-loading when user opens place detail
 */
export const generateTipsForPlace = async (
  place: { name: string; category: PlaceCategory; address?: string }
): Promise<string[]> => {
  const ai = getClient();

  const categoryContext = place.category === PlaceCategory.EAT || place.category === PlaceCategory.DRINK
    ? 'restaurant/bar'
    : 'attraction';

  const prompt = `Generate 3-5 SHORT practical tips for visiting "${place.name}" (a ${categoryContext}).

Tips should cover: reservations, parking, best times, insider secrets, what to try.
Each tip MUST be ONE SHORT SENTENCE (max 12 words).

IMPORTANT RULES:
- NO generic/vague tips like "recommendations recommended" or "check reviews"
- NO obvious tips like "make sure to go" or "worth checking out"
- Be SPECIFIC and ACTIONABLE
- Focus on unique insights, timing, logistics, or menu items

Good examples:
- Reserve ahead on weekends
- Free street parking after 6pm
- Try the secret off-menu burger
- Skip the line with online tickets
- Happy hour is 4-7pm daily
- Sit at the bar for faster service

Bad examples (AVOID):
- Recommendations recommended
- Worth checking out
- Good place to visit
- Make sure to go

Output format (one per line, no numbering):
[Tip 1]
[Tip 2]
[Tip 3]`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    const text = response.text || "";
    const tips = text
      .split("\n")
      .filter(line => line.trim() !== "")
      .map(line => {
        let cleaned = line.trim();
        // Remove leading dashes
        cleaned = cleaned.replace(/^-\s*/, '');
        // Remove leading numbers with periods
        cleaned = cleaned.replace(/^\d+\.\s*/, '');
        // Remove [Tip N] prefixes
        cleaned = cleaned.replace(/^\[Tip\s+\d+\]\s*/i, '');
        // Remove brackets wrapping entire tip
        cleaned = cleaned.replace(/^\[(.+)\]$/, '$1');
        return cleaned;
      })
      .filter(tip => tip.length > 0)
      .slice(0, 5);

    return tips;
  } catch (error: any) {
    // Silently handle rate limits - tips are optional
    if (error?.message?.includes('429') || error?.message?.includes('quota')) {
      console.log(`⏭️ Skipping tips for ${place.name} (rate limit)`);
    } else {
      console.warn(`Could not generate tips for ${place.name}`);
    }
    return [];
  }
};

/**
 * HYBRID APPROACH:
 * 1. Gemini discovers place names
 * 2. Google Places API fetches real data
 * 3. Gemini generates tips for final places
 */
export const getRecommendations = async (
  coords: Coordinates,
  searchQuery?: string,
  radiusKm: number = 3.2,
  hotAndNew: boolean = false,
  excludePlaceNames: string[] = [], // Places to exclude for variety
  categories?: string[] // Category filters (EAT, DRINK, SIGHT, DO)
): Promise<{ city: string; places: Place[] }> => {
  console.log(`🎯 Backend getRecommendations received categories:`, categories && categories.length > 0 ? categories : 'none (all categories)');
  const isRefresh = excludePlaceNames.length > 0;
  if (isRefresh) {
    console.log(`🔄 REFRESH MODE: Excluding ${excludePlaceNames.length} previous places, expanding area by 20%`);
    radiusKm = radiusKm * 1.2; // Expand search area by 20% on refresh
  } else {
    console.log('🔄 Using HYBRID approach: Gemini discovery + Google real data');
  }

  const MIN_PLACES = 8; // Always aim for 8 results
  let currentRadius = radiusKm;
  let attempts = 0;
  const MAX_ATTEMPTS = 5; // More attempts to ensure we find 8 places
  let bestResults: { city: string; places: Place[] } | null = null; // Track best results across iterations

  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    try {
      // Phase 1: Gemini discovers 20 place names (more candidates = better chance of finding local gems)
      let discoveredCity = 'Unknown Location';
      let discoveries: PlaceDiscovery[] = [];

      if (!BYPASS_GEMINI) {
        try {
          const geminiResult = await discoverPlaceNames(
            coords,
            searchQuery,
            currentRadius,
            hotAndNew,
            20,
            categories
          );
          discoveredCity = geminiResult.city;
          discoveries = geminiResult.discoveries;
        } catch (geminiError: any) {
          // Check if it's a quota error (429)
          if (geminiError?.message?.includes('429') || geminiError?.message?.includes('quota')) {
            console.log(`⚠️ Gemini quota exceeded, falling back to Google Places API only`);
            // Continue without Gemini discoveries - will use Google Places API below
            const geocodedCity = await reverseGeocode(coords);
            if (geocodedCity) discoveredCity = geocodedCity;
          } else {
            // Re-throw non-quota errors
            throw geminiError;
          }
        }
      } else {
        console.log(`🔧 BYPASS MODE: Skipping Gemini, using Google Places API only`);
        const geocodedCity = await reverseGeocode(coords);
        if (geocodedCity) discoveredCity = geocodedCity;
      }

      // Phase 1B: For normal searches, ALSO get nearby top-rated places from Google directly
      // This ensures we don't miss local favorites that Gemini might overlook
      // ALSO use this as fallback when Gemini quota is exceeded
      let nearbyCount = 0;
      const isIconicSearch = searchQuery?.toLowerCase().includes('iconic') || searchQuery?.toLowerCase().includes('famous');
      const geminiHasResults = discoveries.length > 0;
      const shouldFetchGoogle = !geminiHasResults || (!hotAndNew && !isIconicSearch);

      if (shouldFetchGoogle) {
        if (!geminiHasResults) {
          console.log(`🔍 Using Google Places API only (Gemini unavailable)`);
        }
        console.log(`🔍 Supplementing with nearby top-rated places from Google (within ${currentRadius}km)...`);
        const nearbyPlacesRaw = await getNearbyPlaces(
          coords.latitude,
          coords.longitude,
          currentRadius * 1000, // Convert km to meters
          categories // Pass category filters
        );

        // Sort nearby places by popularity (reviews × rating) to prioritize Murray's Tavern, Ciao!, etc.
        const nearbyPlaces = nearbyPlacesRaw.sort((a: any, b: any) => {
          const popularityA = (a.rating || 0) * Math.log10((a.userRatingCount || 0) + 10);
          const popularityB = (b.rating || 0) * Math.log10((b.userRatingCount || 0) + 10);
          return popularityB - popularityA;
        });

        console.log(`📊 Sorted ${nearbyPlaces.length} nearby places by popularity (rating × log(reviews))`);

        // Filter out non-hospitality businesses
        const invalidKeywords = [
          'cvs', 'walgreens', 'pharmacy', 'drugstore', 'rite aid',
          'market basket', 'grocery', 'supermarket', 'walmart', 'target', 'safeway', 'whole foods', 'stop & shop', 'trader joe',
          'gas station', 'shell', 'chevron', 'exxon', 'bp', '7-eleven',
          'bank', 'chase', 'wells fargo', 'citibank', 'atm',
          'clinic', 'hospital', 'urgent care', 'medical center', 'memorial hospital',
          'post office', 'usps', 'fedex', 'ups',
          'laundromat', 'dry clean', 'car wash',
          'restaurant depot', 'restaurant supply', 'food service supply', 'wholesale'
        ];

        // Add nearby places to discoveries (if not already included)
        const existingNames = new Set(discoveries.map(d => d.name.toLowerCase().trim()));
        let skippedChainCount = 0;
        let skippedNonHospitalityCount = 0;
        let skippedClosedCount = 0;
        nearbyPlaces.forEach((place: any) => {
          const placeName = place.displayName?.text || '';
          const normalizedName = placeName.toLowerCase().trim();

          // Skip closed businesses FIRST
          if (place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') {
            skippedClosedCount++;
            console.log(`🚫 Skipping closed business: ${placeName} (${place.businessStatus})`);
            return;
          }

          // Skip non-hospitality businesses (grocery stores, hospitals, etc.)
          if (invalidKeywords.some(keyword => normalizedName.includes(keyword))) {
            skippedNonHospitalityCount++;
            console.log(`🏢 Skipping non-hospitality/blocked: ${placeName}`);
            return;
          }

          // Skip chains - prioritize local favorites
          if (isChainRestaurant(placeName)) {
            skippedChainCount++;
            console.log(`⛓️  Skipping chain: ${placeName}`);
            return;
          }

          if (!existingNames.has(normalizedName) && placeName) {
            // Use the category detected by getNearbyPlaces (passed as detectedCategory)
            // Cast to PlaceCategory enum type
            const categoryStr = place.detectedCategory || 'EAT';
            let category: PlaceCategory;

            if (categoryStr === 'DRINK') category = PlaceCategory.DRINK;
            else if (categoryStr === 'EXPLORE' || categoryStr === 'SIGHT' || categoryStr === 'DO') category = PlaceCategory.EXPLORE;
            else category = PlaceCategory.EAT; // Default to EAT

            discoveries.push({
              name: placeName,
              category,
              vibe: `${place.rating || '?'} stars · ${place.userRatingCount || 0} reviews`,
              placeId: place.id // Store Place ID to skip searchText call (cost optimization)
            });
            existingNames.add(normalizedName);
            nearbyCount++;
          }
        });

        console.log(`✅ Found ${nearbyPlaces.length} nearby places from Google API`);
        console.log(`   - Closed businesses filtered: ${skippedClosedCount}`);
        console.log(`   - Non-hospitality filtered: ${skippedNonHospitalityCount}`);
        console.log(`   - Chains filtered: ${skippedChainCount}`);
        console.log(`   - Duplicates skipped: ${nearbyPlaces.length - nearbyCount - skippedChainCount - skippedNonHospitalityCount - skippedClosedCount}`);
        console.log(`   - New places added: ${nearbyCount}`);
        if (nearbyPlaces.length > 0) {
          // Log ALL places to debug categories
          console.log(`📍 ALL nearby places from Google (with detected categories):`);
          nearbyPlaces.slice(0, 10).forEach((p: any, i: number) => {
            console.log(`  ${i + 1}. ${p.displayName?.text} - ${p.rating}⭐ (${p.userRatingCount || 0} reviews) [${p.detectedCategory}]`);
          });
        }
      }

      console.log(`📍 Fetching Google details for ${discoveries.length} total places...`);

    // Phase 2: Fetch full details from Google Places API in batches to avoid rate limits
    const batchSize = 10; // Process 10 places at a time
    const placeDetails: any[] = [];
    let apiCallsSaved = 0; // Track cost optimization

    for (let i = 0; i < discoveries.length; i += batchSize) {
      const batch = discoveries.slice(i, i + batchSize);
      const batchPromises = batch.map(discovery => {
        // COST OPTIMIZATION: If we have a Place ID, fetch details directly (skips searchText call)
        if (discovery.placeId) {
          apiCallsSaved++; // Saved 1 searchText API call
          return getPlaceDetailsByIdDirect(discovery.placeId);
        }
        // Otherwise, search by name first (2 API calls: searchText + Place Details)
        return getPlaceFullDetails(discovery.name, coords.latitude, coords.longitude, radiusKm * 1500);
      });
      const batchResults = await Promise.all(batchPromises);
      placeDetails.push(...batchResults);

      // Small delay between batches to avoid hitting rate limits
      if (i + batchSize < discoveries.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
      }
    }

    if (apiCallsSaved > 0) {
      console.log(`💰 Cost Optimization: Saved ${apiCallsSaved} searchText API calls by using Place IDs directly`);
    }
    const timestamp = Date.now();

    // Phase 3A: SKIP review summarization for speed
    // Reviews are now lazy-loaded when user opens place detail
    const summaries = new Map<string, string>(); // Empty map for compatibility

    // Helper: Calculate distance between two coordinates (Haversine formula)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Phase 3B: Build places with summarized reviews (with distance validation)
    const places: Place[] = [];
    const maxDistance = currentRadius * 1.5; // Allow 1.5x current radius as max (expands with retry)
    const seenPlaceNames = new Set<string>(); // Track place names to avoid duplicates

    for (let i = 0; i < placeDetails.length; i++) {
      const details = placeDetails[i];
      const discovery = discoveries[i];

      if (!details) continue;

      // Skip closed businesses
      if (details.business_status === 'CLOSED_PERMANENTLY' || details.business_status === 'CLOSED_TEMPORARILY') {
        console.log(`🚫 Skipping closed business: ${details.name} (${details.business_status})`);
        continue;
      }

      // Check for duplicate place names (case-insensitive)
      const normalizedName = details.name.toLowerCase().trim();
      if (seenPlaceNames.has(normalizedName)) {
        console.log(`⚠️ Skipping duplicate: ${details.name}`);
        continue;
      }

      // Skip chain restaurants (prioritize local favorites)
      if (isChainRestaurant(details.name)) {
        console.log(`⛓️ Skipping chain: ${details.name}`);
        continue;
      }

      // Skip places from previous results (for refresh variety)
      if (excludePlaceNames.some(excluded => excluded.toLowerCase().trim() === normalizedName)) {
        console.log(`🔄 Skipping previously shown: ${details.name}`);
        continue;
      }

      // Validate location is within reasonable distance
      if (details.geometry?.location) {
        const distance = calculateDistance(
          coords.latitude,
          coords.longitude,
          details.geometry.location.lat,
          details.geometry.location.lng
        );

        if (distance > maxDistance) {
          console.log(`❌ Skipping ${details.name} - ${distance.toFixed(1)}km away (too far from ${currentRadius}km search area)`);
          continue;
        }
      }

      // Get top reviews directly from Google (skip Gemini summarization for speed)
      const reviews: Review[] = [];
      if (details.reviews && details.reviews.length > 0) {
        const topReviews = details.reviews
          .sort((a: any, b: any) => b.rating - a.rating)
          .slice(0, 2);

        topReviews.forEach((review: any) => {
          reviews.push({
            author: review.author_name || 'Anonymous',
            text: review.text || '',
            type: 'user'
          });
        });
      }

      // Get just 1 photo thumbnail for speed (400px, optimized for cards)
      // More high-res photos can be lazy-loaded when user opens detail view
      const images: string[] = [];
      if (details.photos && details.photos.length > 0) {
        images.push(getPlacePhotoUrl(details.photos[0].photo_reference, 400)); // 400px thumbnail
      }

      // Create place object with REAL data from Google
      places.push({
        id: `place-${timestamp}-${i}`,
        name: details.name,
        category: discovery.category,
        description: discovery.vibe,
        rating: details.rating ? `${details.rating}` : undefined,
        tags: details.types ? details.types.slice(0, 3) : [discovery.category],
        mapLink: details.url,
        reason: `Highly rated ${discovery.category.toLowerCase()} spot with ${details.user_ratings_total || 0} reviews.`,
        address: details.formatted_address,
        phone: details.formatted_phone_number || details.international_phone_number,
        reviews,
        images,
        isOpen: details.opening_hours?.open_now,
      });

      // Mark this place name as seen to avoid duplicates
      seenPlaceNames.add(normalizedName);
    }

      console.log(`✅ Created ${places.length} places with real Google data`);

      // Phase 4: Sort and filter by rating
      // Use 3.5+ for normal searches to include good local spots, 3.0+ on refresh for even more variety
      const minRating = isRefresh ? 3.0 : 3.5;

      let filteredPlaces = places.filter(p => {
        const rating = p.rating ? parseFloat(p.rating) : 0;
        return rating >= minRating || rating === 0; // Allow unrated places
      });

      // Apply category filter if specified
      if (categories && categories.length > 0) {
        const beforeFilter = filteredPlaces.length;
        console.log(`📁 Before category filter (${categories.join(', ')}): ${beforeFilter} places`);
        filteredPlaces.slice(0, 10).forEach(p => console.log(`  - ${p.name}: ${p.category}`));

        filteredPlaces = filteredPlaces.filter(p => {
          const matches = categories.includes(p.category);
          if (!matches) {
            console.log(`  ❌ Filtering out ${p.name} (${p.category}) - not in [${categories.join(', ')}]`);
          }
          return matches;
        });

        console.log(`📁 After category filter: ${filteredPlaces.length}/${beforeFilter} places match [${categories.join(', ')}]`);
        if (filteredPlaces.length > 0) {
          console.log(`📁 Remaining places:`);
          filteredPlaces.slice(0, 5).forEach(p => console.log(`  ✅ ${p.name} (${p.category})`));
        }
      }

      if (isRefresh && filteredPlaces.length < places.length) {
        console.log(`🔄 Filtered to ${filteredPlaces.length} places (min rating ${minRating} for variety)`);
      }

      // Sorting strategy: Quality filter + distance priority
      // All categories: Filter for high quality (3.5+ stars already applied)
      // Then prioritize by distance (from Google Places API distance ranking)
      const sortedPlaces = filteredPlaces.sort((a, b) => {
        const ratingA = a.rating ? parseFloat(a.rating) : 0;
        const ratingB = b.rating ? parseFloat(b.rating) : 0;

        // Extract review count from reason field (e.g., "with 1760 reviews")
        const getReviewCount = (place: Place): number => {
          const match = place.reason?.match(/(\d+)\s+reviews/);
          return match ? parseInt(match[1]) : 0;
        };

        const reviewsA = getReviewCount(a);
        const reviewsB = getReviewCount(b);

        // Calculate popularity score (rating × log(reviews + 1))
        // Log scale prevents super-reviewed places from dominating
        const popularityA = ratingA * Math.log10(reviewsA + 10);
        const popularityB = ratingB * Math.log10(reviewsB + 10);

        // For SIGHT/DO/DRINK: If both places have similar quality (within 10% popularity score), prefer closer one
        // For EAT: Always prioritize by popularity (food quality matters most)
        if (categories && categories.length > 0 && !categories.includes('EAT')) {
          const popularityDiff = Math.abs(popularityA - popularityB) / Math.max(popularityA, popularityB);
          if (popularityDiff < 0.15) {
            // Similar quality - keep original distance order from API
            return 0;
          }
        }

        // Otherwise sort by popularity
        return popularityB - popularityA;
      });

      // Phase 5: Tips are now lazy-loaded when user opens place detail (to avoid rate limits)
      const finalPlaces = sortedPlaces.slice(0, 8);

      // Track best results found across iterations (important for sparse categories like DO)
      if (!bestResults || finalPlaces.length > bestResults.places.length) {
        let city = discoveredCity;
        if (city === 'Unknown Location') {
          const geocodedCity = await reverseGeocode(coords);
          if (geocodedCity) city = geocodedCity;
        }
        bestResults = { city, places: finalPlaces };
        console.log(`📊 Best results updated: ${finalPlaces.length} places`);
      }

      // Check if we have enough places (8) or exhausted attempts
      if (finalPlaces.length >= MIN_PLACES) {
        console.log(`✅ Found ${finalPlaces.length} places - returning results`);
        return bestResults;
      }

      // Not enough places and still have attempts left - expand radius
      if (attempts < MAX_ATTEMPTS) {
        console.log(`⚠️ Only ${finalPlaces.length}/8 places found, expanding radius from ${currentRadius.toFixed(1)}km...`);
        currentRadius = currentRadius * 2; // Double the radius
        continue;
      }

      // Final attempt - return best results found across all iterations
      console.log(`⚠️ Could not find 8 places after ${attempts} attempts, returning best result: ${bestResults.places.length} places`);
      return bestResults;

    } catch (error) {
      console.error("Hybrid recommendation error:", error);
      if (attempts >= MAX_ATTEMPTS) {
        // Return best results if we have any, otherwise empty
        if (bestResults && bestResults.places.length > 0) {
          console.log(`⚠️ Error on final attempt, returning best results: ${bestResults.places.length} places`);
          return bestResults;
        }
        return {
          city: "Unknown Area",
          places: []
        };
      }
      // Retry with expanded radius
      currentRadius = currentRadius * 2;
    }
  }

  // Fallback if all attempts failed - return best results if available
  if (bestResults && bestResults.places.length > 0) {
    console.log(`⚠️ Loop exhausted, returning best results: ${bestResults.places.length} places`);
    return bestResults;
  }
  return {
    city: "Unknown Area",
    places: []
  };
};

/**
 * Get recommendations using Foursquare API (cost-effective alternative)
 * Uses: Foursquare for search + details (FREE up to 10K/month)
 * Uses: Google for photos only (~$0.007 each)
 *
 * Estimated cost: ~$0.06/search vs ~$0.60/search with Google-only
 */
export const getRecommendationsWithFoursquare = async (
  coords: Coordinates,
  searchQuery?: string,
  radiusKm: number = 3.2,
  hotAndNew: boolean = false,
  excludePlaceNames: string[] = [],
  categories: string[] = []
): Promise<{ city: string; places: Place[] }> => {
  console.log(`🟣 Using Foursquare API (FREE tier)`);

  const MAX_ATTEMPTS = 3;
  let currentRadius = radiusKm;
  let attempts = 0;

  try {
    // Get city name
    const city = await reverseGeocode(coords) || 'Unknown Location';
    console.log(`📍 Location: ${city}`);

    // Convert string categories to PlaceCategory enum
    const categoryFilters: PlaceCategory[] = categories
      .map(cat => {
        if (cat === 'EAT') return PlaceCategory.EAT;
        if (cat === 'DRINK') return PlaceCategory.DRINK;
        if (cat === 'EXPLORE' || cat === 'SIGHT' || cat === 'DO') return PlaceCategory.EXPLORE;
        return null;
      })
      .filter((cat): cat is PlaceCategory => cat !== null);

    // Adjust minimum places based on category (EXPLORE is rarer than EAT/DRINK)
    const MIN_PLACES = categoryFilters.includes(PlaceCategory.EXPLORE) ? 4 : 8;
    console.log(`📊 Target: ${MIN_PLACES}+ places for ${categoryFilters.join(', ') || 'all categories'}`);

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      console.log(`🔍 Foursquare search attempt ${attempts} (radius: ${currentRadius.toFixed(1)}km)`);

      // Search Foursquare - category filtering happens at API level now
      const radiusMeters = currentRadius * 1000;
      const fsqPlaces = await searchFoursquarePlaces(
        coords.latitude,
        coords.longitude,
        radiusMeters,
        categoryFilters.length > 0 ? categoryFilters : undefined,
        searchQuery,
        30 // Reduced from 50 - API-level category filtering eliminates most non-hospitality places
      );

      if (fsqPlaces.length === 0) {
        if (attempts < MAX_ATTEMPTS) {
          console.log(`⚠️ No Foursquare results, expanding radius...`);
          currentRadius = currentRadius * 1.5;
          continue;
        }
        console.log(`⚠️ No Foursquare results after ${attempts} attempts, falling back to Google`);
        return getRecommendations(coords, searchQuery, radiusKm, hotAndNew, excludePlaceNames, categories);
      }

        console.log(`📊 Foursquare returned ${fsqPlaces.length} places`);

      // Secondary filter: catch any non-hospitality places that slip through category filtering
      // (Most filtering now happens at API level via category IDs)
      const invalidKeywords = [
        'cvs', 'walgreens', 'pharmacy', 'drugstore', 'rite aid',
        'market basket', 'grocery', 'supermarket', 'walmart', 'target', 'safeway', 'whole foods', 'stop & shop', 'trader joe',
        'homegoods', 'home goods', 'tj maxx', 'tjmaxx', 'marshalls', 'ross',
        'butcher', 'meat market', 'fish market',
        'gas station', 'shell', 'chevron', 'exxon', 'bp', '7-eleven',
        'bank', 'chase', 'wells fargo', 'citibank', 'atm',
        'clinic', 'hospital', 'urgent care', 'medical center', 'memorial hospital', 'whidden',
        'post office', 'usps', 'fedex', 'ups',
        'laundromat', 'dry clean', 'car wash',
        'restaurant depot', 'restaurant supply', 'food service supply', 'wholesale',
        'tuxedo', 'tux rental', 'formal wear',
        'paintball', 'laser tag',
        'auto', 'car dealer', 'service center'
      ];

      // Foursquare category IDs for non-hospitality places
      const invalidCategoryIds = [
        '4bf58dd8d48988d1fc941735', // Home & Garden Store
        '4bf58dd8d48988d1fd941735', // Clothing Store
        '4bf58dd8d48988d1fe941735', // Department Store
        '52f2ab2ebcbc57f1066b8b42', // Butcher
        '4bf58dd8d48988d10c951735', // Grocery Store
        '4d954b0ea243a5684a65b473', // Automotive Shop
        '4bf58dd8d48988d1e2941735', // Gas Station
        '4bf58dd8d48988d10a951735', // Bank
        '4bf58dd8d48988d196941735', // Sporting Goods Shop
      ];

      const hospitalityPlaces = fsqPlaces.filter(place => {
        const name = place.name.toLowerCase().trim();
        const categoryIds = place.categories?.map(c => c.fsq_category_id) || [];

        // Skip by name keywords
        if (invalidKeywords.some(keyword => name.includes(keyword))) {
          console.log(`🏢 Filtering non-hospitality: ${place.name}`);
          return false;
        }

        // Skip by category ID
        if (categoryIds.some(id => invalidCategoryIds.includes(id))) {
          console.log(`🏢 Filtering by category ID: ${place.name}`);
          return false;
        }

        // Check primary category name for retail/non-hospitality keywords
        const primaryCategory = place.categories?.[0]?.name?.toLowerCase() || '';
        const nonHospitalityCategories = [
          'store', 'shop', 'market', 'retail', 'clothing', 'apparel', 'furniture',
          'hardware', 'automotive', 'sporting goods', 'department', 'discount',
          'pharmacy', 'drugstore', 'grocery', 'supermarket', 'bank', 'atm',
          'gas station', 'service station', 'medical', 'hospital', 'clinic'
        ];

        // Only exclude if it's CLEARLY retail/non-hospitality
        // Exception: "farmers market" and "food market" are OK (these are food-focused)
        const isFoodMarket = primaryCategory.includes('food') || primaryCategory.includes('farmers');
        const isNonHospitality = nonHospitalityCategories.some(cat => primaryCategory.includes(cat));

        if (isNonHospitality && !isFoodMarket) {
          console.log(`🏢 Filtering by category type: ${place.name} (${primaryCategory})`);
          return false;
        }

        return true;
      });

      console.log(`🔍 After non-hospitality filter: ${hospitalityPlaces.length}/${fsqPlaces.length} places remain`);

      // Sort by popularity (rating × log(reviews)) - same logic as Google Places
      const sortedPlaces = hospitalityPlaces.sort((a, b) => {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      const reviewsA = a.stats?.total_ratings || 0;
      const reviewsB = b.stats?.total_ratings || 0;

      // Foursquare uses 0-10 scale, convert to 0-5 for comparison
      const normalizedRatingA = ratingA / 2;
      const normalizedRatingB = ratingB / 2;

      // Popularity score: rating × log(reviews + 10)
      const popularityA = normalizedRatingA * Math.log10(reviewsA + 10);
      const popularityB = normalizedRatingB * Math.log10(reviewsB + 10);

      return popularityB - popularityA;
    });

    console.log(`📊 Top 5 Foursquare places by popularity:`);
    sortedPlaces.slice(0, 5).forEach((p, i) => {
      const rating = p.rating ? (p.rating / 2).toFixed(1) : 'N/A';
      const reviews = p.stats?.total_ratings || 0;
      console.log(`  ${i + 1}. ${p.name} - ${rating}⭐ (${reviews} reviews)`);
    });

      // Filter out chains and previously shown places
      const filteredPlaces = sortedPlaces.filter(place => {
        const name = place.name.toLowerCase().trim();

        // Skip chains
        if (isChainRestaurant(place.name)) {
          console.log(`⛓️ Skipping chain: ${place.name}`);
          return false;
        }

        // Skip previously shown
        if (excludePlaceNames.some(excluded => excluded.toLowerCase().trim() === name)) {
          console.log(`🔄 Skipping previously shown: ${place.name}`);
          return false;
        }

        return true;
      });

      console.log(`✅ Foursquare: ${filteredPlaces.length} places after filtering (${fsqPlaces.length} → ${hospitalityPlaces.length} → ${filteredPlaces.length})`);

      // Skip upfront business status check - will be checked when photos load
      // This saves ~$0.17 per search since getPlaceFullDetails includes businessStatus
      console.log(`⏭️ Skipping upfront business status check (will check when loading photos)`);

      // Convert Foursquare places to our Place format
      // Take top 20 (API-level filtering means most are already valid hospitality places)
      // Images left empty - PlaceCard will lazy load photos + check business status together
      const places: Place[] = filteredPlaces.slice(0, 20)
        .map((fsqPlace): Place | null => {
          const category = mapFoursquareCategory(fsqPlace.categories);

          // Skip UNKNOWN categories (non-hospitality)
          if (category === PlaceCategory.UNKNOWN) {
            console.log(`🚫 Skipping UNKNOWN category: ${fsqPlace.name}`);
            return null;
          }

          return {
            id: fsqPlace.fsq_place_id, // New API uses fsq_place_id
            name: fsqPlace.name,
            description: fsqPlace.categories?.[0]?.name || 'Local spot',
            category,
            rating: formatFoursquareRating(fsqPlace.rating, fsqPlace.stats?.total_ratings),
            tags: fsqPlace.categories?.map(c => c.name) || [],
            mapLink: buildMapsLink(fsqPlace),
            reason: fsqPlace.verified ? 'Verified local favorite' : 'Popular in the area',
            signature: fsqPlace.hours?.display || undefined,
            address: fsqPlace.location?.formatted_address || fsqPlace.location?.address,
            phone: fsqPlace.tel,
            reviews: fsqPlace.tips?.slice(0, 2).map(tip => ({
              author: 'Foursquare User',
              text: tip.text,
              type: 'user' as const
            })) || [],
            // Extract FREE photos from Foursquare search results (no extra API calls!)
            images: fsqPlace.photos?.slice(0, 5).map(photo =>
              `${photo.prefix}400x400${photo.suffix}`
            ) || [],
            isOpen: fsqPlace.hours?.open_now,
          };
        })
        .filter((place): place is Place => place !== null); // Remove null entries

      console.log(`✅ After UNKNOWN category filtering: ${places.length} places remain`);

      // Check if we have enough places after UNKNOWN filtering
      if (places.length < MIN_PLACES) {
        if (attempts < MAX_ATTEMPTS) {
          console.log(`⚠️ Only ${places.length} places after UNKNOWN filtering, expanding radius from ${currentRadius.toFixed(1)}km...`);
          currentRadius = currentRadius * 1.5;
          continue;
        }
        console.log(`⚠️ Only ${places.length} Foursquare places after ${attempts} attempts, falling back to Google`);
        return getRecommendations(coords, searchQuery, radiusKm, hotAndNew, excludePlaceNames, categories);
      }

      // Filter by category if specified
      let finalPlaces = places;
      if (categoryFilters.length > 0) {
        finalPlaces = places.filter(p => categoryFilters.includes(p.category));
        console.log(`📁 Category filter: ${finalPlaces.length}/${places.length} places match`);

        // Expand radius if not enough places for this category
        if (finalPlaces.length < MIN_PLACES && attempts < MAX_ATTEMPTS) {
          console.log(`⚠️ Only ${finalPlaces.length} results for ${categoryFilters.join(', ')} category, expanding radius...`);
          currentRadius = currentRadius * 1.5;
          continue;
        }

        // If still not enough places and searching for EXPLORE category, try OSM as fallback
        if (finalPlaces.length < MIN_PLACES && categoryFilters.includes(PlaceCategory.EXPLORE)) {
          console.log(`⚠️ Only ${finalPlaces.length} Foursquare results for EXPLORE category`);
          console.log(`🗺️ Trying OpenStreetMap Overpass API as fallback...`);

          try {
            // Convert radius from km to meters for OSM API
            const radiusInMeters = currentRadius * 1000;
            const osmPlaces = await searchOSMActivities(
              coords.latitude,
              coords.longitude,
              radiusInMeters
            );

            // Convert OSM places to our Place format
            const osmFormattedPlaces: Place[] = osmPlaces.map((osm) => ({
              id: `osm-${osm.id}`,
              name: osm.tags.name || 'Unknown',
              address: formatOSMAddress(osm),
              category: PlaceCategory.EXPLORE,
              rating: 'Not rated', // OSM doesn't have ratings
              description: getOSMCategoryDescription(osm),
              reason: `${getOSMCategoryDescription(osm)} - Community-recommended activity venue`,
              mapLink: buildMapsLinkFromOSM(osm),
              images: [], // Will be loaded from Google Photos later
              tags: [], // OSM venues don't have our custom tags
              reviews: [], // OSM doesn't have reviews - photos/ratings will be fetched from Google
            }));

            // Merge with Foursquare results, deduplicate by name similarity
            const mergedPlaces = [...finalPlaces];
            for (const osmPlace of osmFormattedPlaces) {
              const isDuplicate = mergedPlaces.some(
                (p) => p.name.toLowerCase() === osmPlace.name.toLowerCase()
              );
              if (!isDuplicate) {
                mergedPlaces.push(osmPlace);
              }
            }

            console.log(`✅ OSM added ${mergedPlaces.length - finalPlaces.length} new venues`);
            console.log(`📍 Total: ${mergedPlaces.length} places (${finalPlaces.length} from Foursquare + ${mergedPlaces.length - finalPlaces.length} from OSM)`);

            if (mergedPlaces.length >= MIN_PLACES) {
              return { city, places: mergedPlaces.slice(0, 18) };
            }

            // Even with OSM fallback, still not enough - return what we have
            console.log(`⚠️ Still only ${mergedPlaces.length} places after OSM fallback`);
            return { city, places: mergedPlaces };
          } catch (osmError) {
            console.error('❌ OSM fallback failed:', osmError);
            console.log(`✅ Returning ${finalPlaces.length} Foursquare-only places`);
            return { city, places: finalPlaces };
          }
        }

        // Return what we have, even if less than target (non-DO categories)
        if (finalPlaces.length < MIN_PLACES) {
          console.log(`⚠️ Only ${finalPlaces.length} Foursquare results for ${categoryFilters.join(', ')} after ${attempts} attempts`);
          console.log(`✅ Returning ${finalPlaces.length} places (rare category in this area)`);
          return { city, places: finalPlaces };
        }
      }

      // Return top 18 places - closed ones will be filtered when photos load
      // This ensures we end up with 8+ visible places after closed business filtering
      console.log(`✅ Returning ${finalPlaces.slice(0, 18).length} Foursquare places (will show 8+ after closed business filtering)`);
      return { city, places: finalPlaces.slice(0, 18) };
    }

    // Should not reach here, but return what we have
    console.log(`⚠️ Exhausted all attempts, returning available results`);
    return { city, places: [] };

  } catch (error) {
    console.error('❌ Foursquare recommendation error:', error);
    console.log(`⚠️ Error during Foursquare search - returning empty results`);
    const city = await reverseGeocode(coords) || 'Unknown Location';
    return { city, places: [] };
  }
};
