
import { GoogleGenAI } from "@google/genai";
import { Coordinates, Place, PlaceCategory, Review } from "../types";
import Constants from 'expo-constants';
import { searchPlaceByName } from './places';
import { reverseGeocode } from './geocoding';

const getClient = () => {
  const apiKey = Constants.expoConfig?.extra?.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");
  return new GoogleGenAI({ apiKey });
};

/**
 * Calculate distance between two coordinates in km using Haversine formula
 */
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Validates if a place actually exists using Google Places API
 * Returns { isValid: boolean, distance?: number }
 */
const validatePlace = async (name: string, address: string, searchLat: number, searchLon: number, radiusKm: number): Promise<{ isValid: boolean; distance?: number }> => {
  try {
    const radiusMeters = radiusKm * 1500; // Search within 1.5x radius in meters
    const result = await searchPlaceByName(name, searchLat, searchLon, radiusMeters);
    
    if (!result) {
      console.log(`❌ Place not found: ${name}`);
      return { isValid: false };
    }
    
    // Calculate distance from search center to place
    let distance: number | undefined;
    if (result.geometry?.location) {
      distance = calculateDistance(
        searchLat,
        searchLon,
        result.geometry.location.lat,
        result.geometry.location.lng
      );
    }
    
    const ratings = result.user_ratings_total || 0;
    console.log(`✅ Verified place: ${name} (${ratings} ratings, ${distance?.toFixed(2)}km away)`);
    return { isValid: true, distance };
  } catch (error) {
    console.error(`Error validating place ${name}:`, error);
    // Don't filter out places if validation fails due to API errors
    console.log(`⚠️ Validation error for ${name}, allowing it anyway`);
    return { isValid: true };
  }
};

export const getRecommendations = async (
  coords: Coordinates,
  searchQuery?: string,
  radiusKm: number = 2,
  vibeMode: 'iconic' | 'mixed' | 'local' = 'mixed'
): Promise<{ city: string; places: Place[] }> => {
  const ai = getClient();

  const modelId = "gemini-2.0-flash-exp";

  // Determine if user is searching for a specific category
  const searchLower = searchQuery?.toLowerCase() || '';
  
  // Food-specific keywords (pizza, ramen, steak, etc.) should be EAT category
  const isFoodSearch = /\b(pizza|ramen|sushi|burger|steak|pasta|tacos|sandwich|noodles|curry|bbq|seafood|chicken|pork|beef|salad|soup|breakfast|brunch|lunch|dinner)\b/i.test(searchLower);
  const isEatSearch = isFoodSearch || /\b(eat|food|restaurant|dining|cuisine)\b/i.test(searchLower);
  const isDrinkSearch = /\b(drink|bar|cocktail|brewery|coffee|cafe|beer|wine|tea|juice)\b/i.test(searchLower);
  const isDoSearch = /\b(do|activities|things to do|entertainment|sports|gym|spa|park)\b/i.test(searchLower);
  const isSightSearch = /\b(sight|see|view|landmark|attraction|museum|monument|statue|building|architecture)\b/i.test(searchLower);
  
  const isCategorySpecific = isEatSearch || isDrinkSearch || isDoSearch || isSightSearch;
  
  const searchSpecific = searchQuery ? `
    IMPORTANT: Focus on places related to "${searchQuery}". Find popular areas and specific establishments matching this query.` : '';

  const radiusMiles = (radiusKm * 0.621371).toFixed(1);
  
  // Vibe-specific guidance (but search query takes priority)
  let vibeGuidance = '';
  if (searchQuery) {
    // When user searches for something specific, be strict about relevance
    vibeGuidance = `\n\nSEARCH MODE: User searched for "${searchQuery}" - ALL results MUST be directly relevant to this query.
    - If searching for a specific food (e.g. "ramen", "pizza"), ONLY show restaurants that actually serve that food
    - If searching for an activity (e.g. "museums", "parks"), ONLY show places that match that activity
    - DO NOT include places just because they're famous/local if they don't match the search query
    - Vibe mode (${vibeMode}) should only affect which relevant places to prioritize (famous vs local), not whether they match the query`;
  } else if (vibeMode === 'iconic') {
    vibeGuidance = `\n\nVIBE MODE: ICONIC - CRITICAL: You MUST prioritize the most famous, iconic landmarks and attractions that define this city.
    - Focus on places with 2000+ reviews, famous landmarks, historic sites, major museums, iconic restaurants
    - Think: What would Google Maps "Top Sights" show? What's in travel guides? What do tourists fly here to see?
    - Examples: Freedom Trail, Fenway Park, Museum of Fine Arts, Boston Common, Faneuil Hall (for Boston)
    - Include at least 4-5 SIGHT/DO category places that are genuinely famous
    - For restaurants, choose only iconic/historic ones (100+ year old, celebrity chef, or 2000+ reviews)
    - AVOID: neighborhood cafes, local bars, small shops unless they're internationally famous`;
  } else if (vibeMode === 'local') {
    vibeGuidance = `\n\nVIBE MODE: LOCAL GEMS - Prioritize hidden gems beloved by locals.
    - Places with 50-500 reviews but 4.5+ stars
    - Neighborhood favorites, authentic local spots, under-the-radar activities
    - AVOID overly touristy places and major landmarks`;
  } else {
    vibeGuidance = '\n\nVIBE MODE: MIXED - Balance: 4 well-known/famous spots + 4 local favorites.';
  }
  
  let categoryGuidance = '';
  if (isCategorySpecific) {
    if (isEatSearch) categoryGuidance = 'CRITICAL: ALL 8 results MUST be EAT category only - restaurants, cafes, and dining establishments. DO NOT include any DRINK, DO, or SIGHT categories.';
    else if (isDrinkSearch) categoryGuidance = 'CRITICAL: ALL 8 results MUST be DRINK category only - bars, breweries, coffee shops, and drinking establishments. DO NOT include any EAT, DO, or SIGHT categories.';
    else if (isDoSearch) categoryGuidance = 'CRITICAL: ALL 8 results MUST be DO category only - activities, entertainment, sports, and things to do. DO NOT include any EAT, DRINK, or SIGHT categories.';
    else if (isSightSearch) categoryGuidance = 'CRITICAL: ALL 8 results MUST be SIGHT category only - landmarks, viewpoints, monuments, and sightseeing attractions. DO NOT include any EAT, DRINK, or DO categories.';
  } else if (searchQuery) {
    categoryGuidance = `Find places matching "${searchQuery}" across ALL categories (EAT, DRINK, DO, SIGHT). Provide a diverse mix.`;
  } else if (vibeMode === 'iconic') {
    categoryGuidance = 'Category mix for ICONIC: 3-4 SIGHT (landmarks/museums), 2 DO (activities/attractions), 1-2 EAT (only famous/historic restaurants), 1 DRINK (only if iconic bar/venue).';
  } else {
    categoryGuidance = 'Provide a DIVERSE mix: approximately 3 EAT, 2 DRINK, 2 DO, and 1 SIGHT. NO category should be completely excluded.';
  }
  
  const prompt = `
    I am currently at latitude: ${coords.latitude}, longitude: ${coords.longitude}.
    ${searchSpecific}
    ${vibeGuidance}
    
    Task 1: Identify the specific City or Neighborhood name I am in.
    Task 2: Find exactly 8 trending, popular, or highly-rated places within a STRICT ${radiusKm}km (${radiusMiles} miles) radius suitable for a traveler.
    ${categoryGuidance}
    
    CRITICAL REQUIREMENTS:
    - ALL places MUST be within ${radiusKm}km (${radiusMiles} miles) of my current location - NO EXCEPTIONS
    - ONLY include REAL, currently operating businesses and attractions that you can verify exist
    - Each place MUST have a valid street address (not just a city/state)
    - DO NOT include residential addresses, private homes, or closed/historical locations
    - DO NOT hallucinate or make up places - use Google Maps grounding to verify existence
    - Prefer well-established places with actual reviews and ratings
    
    For each place, provide:
    1. Name
    2. Category (EAT, DRINK, DO, SIGHT)
    3. Short vibe description
    4. Rating
    5. Specific reason to visit
    6. MUST HAVE signature items - Be VERY SPECIFIC with actual menu items, drinks, or attractions:
       - For restaurants: Exact dish names like "steak tips", "lobster mac and cheese", "truffle fries"
       - For bars: Specific drinks like "espresso martini", "local IPA on tap", "whiskey selection"
       - For sights: Specific things to see like "statue of David replica", "sunset view from rooftop", "historic clock tower"
       List 2-3 specific items separated by commas.
    7. Street address (full address with street, city, state/province)
    8. Phone number (if available, otherwise leave empty)
    9. Four POSITIVE reviews separated by '###':
       - First 2 reviews from "Local Guide" (enthusiastic, personal perspective)
       - Last 2 reviews from "Travel Magazine" (professional, polished perspective)
    10. Find 1 publicly accessible image URL for this place (e.g. from Wikimedia, Flickr, or Official Site). If not found, leave empty.

    Format the output strictly as follows (one line per place):
    City: [City Name]
    [Name] | [Category] | [Vibe] | [Rating] | [Reason] | [Signature Items] | [Address] | [Phone] | [Local Guide Review 1] ### [Local Guide Review 2] ### [Travel Magazine Review 1] ### [Travel Magazine Review 2] | [ImageURL]
    
    CRITICAL: Do not add any numbering, bullets, asterisks, or markdown formatting (no **, *, _, etc.). Output plain text only.
  `;

  try {
    console.log(`Using Gemini model: ${modelId}`);
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        // We enable googleSearch as a backup for images if Maps API fails
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
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
    console.log('Gemini response received, length:', text.length);
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    
    let city = "Unknown Location";
    const places: Place[] = [];
    const timestamp = Date.now(); // Unique timestamp for this batch

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    lines.forEach((line, index) => {
      if (line.startsWith("City:")) {
        city = line.replace("City:", "").trim();
        return;
      }

      const parts = line.split("|");
      if (parts.length >= 5) {
        // Clean markdown and numbering from name (e.g., "**1. Name**" -> "Name")
        let name = parts[0].trim();
        name = name.replace(/^\*\*|\*\*$/g, ''); // Remove bold
        name = name.replace(/^\d+\.\s*/, ''); // Remove numbering
        name = name.trim();
        const categoryRaw = parts[1].trim().toUpperCase();
        const description = parts[2].trim();
        const rating = parts[3]?.trim() || "4.5";
        const reason = parts[4]?.trim() || "A local favorite you shouldn't miss.";
        const signature = parts[5]?.trim() || "";
        const address = parts[6]?.trim() || "";
        const phone = parts[7]?.trim() || "";
        const reviewsRaw = parts[8]?.trim() || "";
        const imageRaw = parts[9]?.trim() || "";

        let category = PlaceCategory.UNKNOWN;
        if (categoryRaw.includes("EAT")) category = PlaceCategory.EAT;
        else if (categoryRaw.includes("DRINK")) category = PlaceCategory.DRINK;
        else if (categoryRaw.includes("DO")) category = PlaceCategory.DO;
        else if (categoryRaw.includes("SIGHT")) category = PlaceCategory.SIGHT;
        else category = PlaceCategory.DO;

        const matchingChunk = groundingChunks.find(c => 
            c.web?.title?.includes(name) || c.maps?.title?.includes(name)
        );
        const mapLink = matchingChunk?.maps?.uri || matchingChunk?.web?.uri;

        // Parse reviews (4 total: 2 local guide + 2 travel magazine)
        const reviews: Review[] = [];
        if (reviewsRaw) {
          const reviewParts = reviewsRaw.split('###');
          reviewParts.forEach((r, i) => {
            const cleanR = r.trim();
            const colonIdx = cleanR.indexOf(':');
            
            // Determine author and type based on position
            const isLocalGuide = i < 2; // First 2 are local guides
            const defaultAuthor = isLocalGuide ? 'Local Guide' : 'Travel Magazine';
            const reviewType = isLocalGuide ? 'user' : 'critic';
            
            if (colonIdx > -1) {
              reviews.push({
                author: cleanR.substring(0, colonIdx).trim(),
                text: cleanR.substring(colonIdx + 1).trim().replace(/^"|"$/g, ''),
                type: reviewType
              });
            } else {
               reviews.push({
                author: defaultAuthor,
                text: cleanR.replace(/^"|"$/g, ''),
                type: reviewType
              });
            }
          });
        }

        // Parse image from Gemini Search
        const images: string[] = [];
        if (imageRaw && imageRaw.startsWith('http')) {
            images.push(imageRaw.trim());
        }

        places.push({
          id: `place-${timestamp}-${index}`,
          name,
          category,
          description,
          rating,
          tags: [categoryRaw],
          mapLink,
          reason,
          signature,
          address,
          phone,
          reviews,
          images // Store the initial search image here
        });
      }
    });

    // Validate places to ensure they actually exist and are within radius
    console.log(`Validating ${places.length} places within ${radiusKm}km radius...`);
    const placesToValidate = places.slice(0, 12); // Check up to 12 to have buffer
    const validatedPlaces: Place[] = [];
    const beyondRadiusPlaces: { place: Place; distance: number }[] = [];
    const MAX_ACCEPTABLE_DISTANCE = radiusKm * 1.5; // Allow 50% buffer, but not crazy far
    
    for (const place of placesToValidate) {
      const result = await validatePlace(place.name, place.address || '', coords.latitude, coords.longitude, radiusKm);
      
      if (result.isValid) {
        // Reject places that are absurdly far (probably wrong location from Google)
        if (result.distance !== undefined && result.distance > MAX_ACCEPTABLE_DISTANCE) {
          console.log(`❌ ${place.name} is ${result.distance.toFixed(2)}km away (REJECTED - way beyond ${radiusKm}km radius)`);
          continue; // Don't even consider for backup
        }
        
        // Check if place is within the selected radius
        if (result.distance !== undefined && result.distance > radiusKm) {
          console.log(`⚠️ ${place.name} is ${result.distance.toFixed(2)}km away (slightly beyond ${radiusKm}km radius)`);
          beyondRadiusPlaces.push({ place, distance: result.distance });
          continue;
        }
        validatedPlaces.push(place);
      }
    }
    
    console.log(`${validatedPlaces.length} out of ${placesToValidate.length} places validated and within radius`);
    
    // If we don't have enough places, include slightly out-of-radius places (sorted by distance)
    let finalPlaces = validatedPlaces;
    if (validatedPlaces.length < 6 && beyondRadiusPlaces.length > 0) {
      const needed = 8 - validatedPlaces.length;
      const sorted = beyondRadiusPlaces.sort((a, b) => a.distance - b.distance);
      const extras = sorted.slice(0, needed).map(item => {
        console.log(`🔴 Adding ${item.place.name} (${item.distance.toFixed(2)}km) to fill results`);
        return item.place;
      });
      finalPlaces = [...validatedPlaces, ...extras];
    }
    
    // If still too few, return unvalidated results
    if (finalPlaces.length < 3 && placesToValidate.length >= 3) {
      console.warn(`Only ${finalPlaces.length} places found, returning ${placesToValidate.length} unvalidated places`);
      finalPlaces = placesToValidate.slice(0, 8);
    }
    
    // Use reverse geocoding as fallback if city is still unknown
    if (city === 'Unknown Location') {
      console.log('City name not found in response, using reverse geocoding...');
      const geocodedCity = await reverseGeocode(coords);
      if (geocodedCity) {
        city = geocodedCity;
        console.log('✅ Reverse geocoded city:', city);
      }
    }
    
    return { city, places: finalPlaces };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      city: "Unknown Area",
      places: [
        {
          id: 'err-1',
          name: "Local Adventure",
          category: PlaceCategory.DO,
          description: "Explore the neighborhood.",
          tags: ["Adventure"],
          rating: "5.0",
          reason: "Sometimes the best plan is no plan.",
          reviews: [],
          images: []
        }
      ]
    };
  }
};
