# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeCheck Travel is an Expo/React Native mobile app that uses Gemini AI to discover trending places around the user's location. The app provides location-based recommendations with search suggestions that help users find specific types of places (iconic landmarks, local spots, restaurants, cafes, sights, etc.).

## Development Commands

### Running the App
```bash
npm start              # Start Expo dev server
npm run ios            # Run on iOS Simulator (Mac only)
npm run android        # Run on Android Emulator
npm run web            # Run in web browser
```

All scripts use `dotenv -e .env.local` to load environment variables.

### Environment Setup
The app requires a Gemini API key to function:
1. Copy `.env.example` to `.env.local` (not `.env`)
2. Add `GEMINI_API_KEY=your_actual_api_key_here`
3. The key is accessed via `Constants.expoConfig?.extra?.GEMINI_API_KEY` throughout the codebase

Note: The same Gemini API key is reused for Google Maps/Places APIs.

## Architecture

### Core Data Flow

1. **Location Acquisition** (App.tsx:146-178)
   - Requests location permissions via expo-location
   - Stores GPS coordinates in `userGpsCoords` (never changes during session)
   - Stores search center in `coords` (changes when user searches different locations)
   - Uses reverse geocoding to get city name from coordinates

2. **Place Recommendations** (services/gemini.ts)
   - `getRecommendations()` calls Gemini 2.0 Flash with Google Maps grounding
   - Uses **variable radius** based on search query (App.tsx:122-149):
     - "iconic", "famous", "landmark" queries → 8km (5 miles) - needs wider search for landmarks
     - "in [city]" queries → 8km (5 miles) - exploring a city
     - "nearby", "around here", "close by" → 3.2km (2 miles) - truly local
     - "local", "neighborhood", "near me" → 4.8km (3 miles) - moderate
     - Default → 4.8km (3 miles)
   - Prompts are dynamically constructed based on:
     - `searchQuery`: Optional user search that can include location (parsed by geocoding.ts)
     - Search query can specify "iconic" or "local" to affect which places are prioritized
   - AI returns 8 places with structured data (name, category, rating, reviews, address, signature items)
   - Each place is validated via Google Places API to ensure it exists and is within radius
   - Places beyond radius are sorted by distance and used as fallback if needed

3. **Place Validation** (services/gemini.ts:33-63, 291-336)
   - `validatePlace()` searches Google Places API to confirm existence
   - Calculates actual distance using Haversine formula
   - Rejects places >1.5x radius away
   - If <6 valid places found, backfills with closest out-of-radius places

4. **Image Loading** (components/PlaceCard.tsx, services/places.ts, services/wikipedia.ts)
   - Multi-stage fallback: Gemini Search → Google Places Photos → Wikipedia → AI-generated placeholder
   - PlaceCard tries images in sequence until one loads successfully
   - Places API provides up to 8 photos, filtered by aspect ratio (0.5-2.5) and sorted by width

5. **Search & Geocoding** (services/geocoding.ts)
   - `parseLocationFromQuery()` extracts location from queries like "ramen in tokyo" or "museums near boston"
   - `geocodeLocation()` converts location strings to coordinates with location bias
   - `reverseGeocode()` converts coordinates to city name (prioritizes locality type)

### State Management

All state is managed in App.tsx via React hooks (no Redux/Context):
- `coords`: Current search center (changes on search)
- `userGpsCoords`: Original GPS location (fixed per session)
- `city` / `userGpsCity`: Display names for locations
- `places[]`: Current recommendation list
- `searchQuery`: Current search text
- `showSuggestions`: Boolean to show/hide search suggestion chips
- Hidden places stored in AsyncStorage, filtered from results

### Component Structure

- **App.tsx**: Main container, handles location, search, search suggestions, load-more
- **PlaceCard.tsx**: Individual place card with image carousel, category badge, action sheet
- **CenterPiece.tsx**: Center map component with refresh button
- **PlacePopup.tsx**: Full-screen modal with detailed place info and reviews
- **FullScreenMap.tsx**: Full-screen map view showing all places
- **LoadingScreen.tsx**: Animated loading state
- **PlaceActionSheet.tsx**: Bottom sheet for save/hide/directions actions

### Search Suggestion System

When the user focuses the search bar, a dropdown list of suggestions appears above it (App.tsx:152-159):
- Uses **smart major city detection** - finds nearest major city for "iconic" searches (so Everett → Boston)
- Suggestions are optimized for variable radius:
  - "iconic places in Boston" → 5 mile radius, geocodes to Boston
  - "local favorites near me" → 3 mile radius from GPS
  - "coffee shops nearby" → 2 mile radius for truly close results
  - "top restaurants near me" → 3 mile radius
  - "bars around here" → 2 mile radius
  - "parks and outdoor spots nearby" → 2 mile radius
- Clicking a suggestion populates the search bar (does NOT auto-search)
- User can modify the text and press Enter to search
- Cancel button dismisses keyboard and closes suggestions

### Category System

Places are categorized as EAT, DRINK, DO, or SIGHT (types.ts:7-13). Category detection in gemini.ts:78-85:
- Food keywords (pizza, ramen, etc.) → EAT
- Drink keywords (bar, coffee, etc.) → DRINK
- Activity keywords (museum, park, etc.) → DO/SIGHT
- When user searches category-specific query, ALL 8 results must match that category (enforced in prompt)

### Load More Pattern

Pull-to-load implementation (App.tsx:180-197):
- Detects over-scroll at bottom (>80px)
- Calls `fetchVibe()` with `append: true`
- Filters duplicates by name
- Disables load-more if <4 new unique places returned
- Shows animated spinner while loading

## Key Files

- **App.tsx** (845 lines): Main app, state management, layout (responsive 2-col mobile / 3x3 desktop grid)
- **services/gemini.ts** (370 lines): AI recommendation engine, place validation, prompt engineering
- **services/geocoding.ts** (155 lines): Location parsing, geocoding, reverse geocoding
- **services/places.ts** (179 lines): Google Places API wrapper with retry logic, photo fetching
- **services/storage.ts** (109 lines): AsyncStorage helpers for saved/hidden places
- **types.ts** (43 lines): TypeScript interfaces (Coordinates, Place, PlaceCategory, Review)

## Technical Notes

### React Native Specifics
- Uses NativeWind (Tailwind for React Native) via global.css import
- Styling via StyleSheet for performance
- Animated API for spinners and transitions
- SafeAreaView with edge configuration for notch handling
- KeyboardAvoidingView for search input

### API Integration
- Gemini 2.0 Flash (`gemini-2.0-flash-exp`) with Google Maps + Search grounding tools
- All API calls use same GEMINI_API_KEY (works for Google Maps/Places/Geocoding)
- Places API uses locationbias for accurate nearby results
- Retry logic with exponential backoff (500ms, 1s, 2s) in places.ts:30-46

### Location Handling
- Distinguishes between GPS location (`userGpsCoords`) and search center (`coords`)
- Uses ±0.01 lat/lng threshold (~1km) to detect location changes
- Preserves original GPS city name when returning to GPS location
- Search suggestions dynamically update with current city name

### Performance Optimizations
- Image loading with multiple fallbacks prevents broken images
- Places validated in parallel (async batch processing)
- Photos pre-filtered by aspect ratio to avoid loading unusable images
- Load-more only when <4 new places to prevent infinite failed requests

## Common Patterns

### Adding a New Service
1. Create file in `services/` with typed functions
2. Import Constants for API key access: `Constants.expoConfig?.extra?.GEMINI_API_KEY`
3. Add TypeScript interfaces for responses
4. Use try-catch with console.error for error handling

### Modifying Gemini Prompts
The prompt in gemini.ts is critical. When modifying:
- Maintain strict format requirements (pipe-delimited lines)
- Keep CRITICAL REQUIREMENTS section for quality control
- Test with different search queries (iconic, local, category-specific)
- Validate that category mix matches expectations
- Remember the radius is **variable** based on query - test with different radius values

### Working with AsyncStorage
Use the helpers in services/storage.ts:
- `savePlace()` / `getSavedPlaces()` for bookmarks
- `hidePlace()` / `getHiddenPlaces()` for filtering unwanted results
- Always catch errors - AsyncStorage can fail on full storage

### Responsive Layout
App.tsx uses width-based breakpoint (`isSmall = width < 768`):
- Mobile: 2-column grid, CenterPiece spans full width
- Desktop: 3x3 grid, CenterPiece in center cell
- Card dimensions calculated dynamically based on screen size and gap spacing
