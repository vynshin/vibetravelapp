import './global.css';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Keyboard,
  Modal,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getRecommendations, getRecommendationsWithFoursquare } from './services/gemini';

// Use Foursquare for FREE searches (10K/month)
// Note: Check at runtime since env vars may not be available at module init
const USE_FOURSQUARE = !!process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY;
console.log(`🔑 Foursquare API key configured: ${USE_FOURSQUARE ? 'YES' : 'NO (using Google)'}`);
console.log(`🔑 EXPO_PUBLIC_FOURSQUARE_API_KEY: ${process.env.EXPO_PUBLIC_FOURSQUARE_API_KEY ? '***present***' : 'undefined'}`);
import { geocodeLocation, parseLocationFromQuery } from './services/geocoding';
import { getHiddenPlaces, getCachedResults, saveCachedResults, clearCachedResults, getGridCachedResults, saveGridCachedResults, clearGridCache } from './services/storage';
import { addToHistory } from './services/collections';
import { trackSearch, trackPlaceView, getUsageStats, hasExceededFreeTier, getRemainingSearches, UsageStats, FREE_TIER_LIMITS, resetUsageStats } from './services/usage';
import { Coordinates, Place } from './types';
import { PlaceCard } from './components/PlaceCard';
import { CenterPiece } from './components/CenterPiece';
import { LoadingScreen } from './components/LoadingScreen';
import { PlacePopup } from './components/PlacePopup';
import { UsageIndicator } from './components/UsageIndicator';
import { UpgradePrompt } from './components/UpgradePrompt';
import { FullScreenMap } from './components/FullScreenMap';
import { SavedPlacesScreen } from './screens/SavedPlacesScreen';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path, Circle } from 'react-native-svg';

const Tab = createBottomTabNavigator();

const { width, height } = Dimensions.get('window');

// Animated Spinner Component
const AnimatedSpinner = () => {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      })
    );
    spinAnimation.start();
    return () => spinAnimation.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.loadingSpinner,
        { transform: [{ rotate: spin }] },
      ]}
    />
  );
};

export function DiscoverScreen() {

  const [coords, setCoords] = useState<Coordinates | null>(null); // Current search center
  const [userGpsCoords, setUserGpsCoords] = useState<Coordinates | null>(null); // Original GPS location
  const [city, setCity] = useState<string>("Locating...");
  const [userGpsCity, setUserGpsCity] = useState<string | null>(null); // City name for original GPS location
  const [places, setPlaces] = useState<Place[]>([]);
  const [shownPlaces, setShownPlaces] = useState<string[]>([]); // Track shown place names for variety
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [canLoadMore, setCanLoadMore] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFullMap, setShowFullMap] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [currentRadius, setCurrentRadius] = useState<number>(3.2); // Track current search radius
  const [openNowFilter, setOpenNowFilter] = useState<boolean>(false); // Filter for places open now
  const [hotAndNewFilter, setHotAndNewFilter] = useState<boolean>(false); // Filter for trending/new places
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(() => new Set()); // Active category filters (EAT, DRINK, EXPLORE) - use lazy initialization to prevent recreating Set on every render

  // Memoize categoryFilters as a stable string for useCallback dependencies
  const categoryFiltersKey = useMemo(() => Array.from(categoryFilters).sort().join(','), [categoryFilters]);
  const pullDistanceRef = useRef<number>(0); // Track how far user has pulled up (use ref to avoid re-renders)
  const [pullActive, setPullActive] = useState<boolean>(false); // Only for UI indicator
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null); // Usage tracking stats
  const [showUpgradePrompt, setShowUpgradePrompt] = useState<boolean>(false); // Show upgrade prompt when limit reached
  const [showMenu, setShowMenu] = useState<boolean>(false); // Show hamburger menu
  const [lastUpdated, setLastUpdated] = useState<number | null>(null); // Timestamp of last search
  const [usingCachedData, setUsingCachedData] = useState<boolean>(false); // Whether showing cached data
  // Removed pull-to-refresh - users scroll down to load more instead

  // Track initial mount to prevent filter useEffects from firing on first load
  const categoryFilterInitialMount = useRef(true);
  const hotAndNewFilterInitialMount = useRef(true);

  // Determine nearest major city for iconic searches
  const getMajorCity = useCallback(() => {
    if (!coords) return 'Boston';

    const { latitude, longitude } = coords;

    // Major US cities with their coordinates and typical radius
    const majorCities = [
      { name: 'Boston', lat: 42.3601, lng: -71.0589, radius: 50 },
      { name: 'New York', lat: 40.7128, lng: -74.0060, radius: 80 },
      { name: 'San Francisco', lat: 37.7749, lng: -122.4194, radius: 50 },
      { name: 'Los Angeles', lat: 34.0522, lng: -118.2437, radius: 80 },
      { name: 'Chicago', lat: 41.8781, lng: -87.6298, radius: 50 },
      { name: 'Seattle', lat: 47.6062, lng: -122.3321, radius: 50 },
      { name: 'Portland', lat: 45.5152, lng: -122.6784, radius: 40 },
      { name: 'Austin', lat: 30.2672, lng: -97.7431, radius: 40 },
      { name: 'Miami', lat: 25.7617, lng: -80.1918, radius: 40 },
      { name: 'Denver', lat: 39.7392, lng: -104.9903, radius: 40 },
    ];

    // Find closest major city within its radius
    let closestCity = 'Boston';
    let minDistance = Infinity;

    for (const mc of majorCities) {
      const distance = Math.sqrt(
        Math.pow(latitude - mc.lat, 2) + Math.pow(longitude - mc.lng, 2)
      ) * 111; // Rough km conversion

      if (distance < mc.radius && distance < minDistance) {
        minDistance = distance;
        closestCity = mc.name;
      }
    }

    return closestCity;
  }, [coords]);

  // Memoize majorCity to prevent recalculation on every render
  const majorCity = useMemo(() => getMajorCity(), [getMajorCity]);

  // Filter places based on "Open Now" toggle
  const filteredPlaces = useMemo(() => {
    // DEBUG DISABLED: console.log(`🔍 Filter check: openNowFilter=${openNowFilter}, places.length=${places.length}`);
    if (!openNowFilter) {
      return places;
    }

    // Only show places that are confirmed open
    const openPlaces = places.filter(place => place.isOpen === true);
    return openPlaces;
  }, [places, openNowFilter]);

  // Determine city scale for radius calculation
  const getMajorCityScale = useCallback((cityName: string): 'major' | 'medium' | 'small' => {
    const lowerCity = cityName.toLowerCase();

    // Major world cities (10-15 mile radius appropriate)
    const majorCities = [
      'new york', 'nyc', 'los angeles', 'la', 'chicago', 'london', 'tokyo',
      'paris', 'dubai', 'singapore', 'hong kong', 'shanghai', 'mumbai',
      'delhi', 'beijing', 'mexico city', 'sao paulo', 'jakarta'
    ];

    // Medium cities (7-10 mile radius)
    const mediumCities = [
      'boston', 'seattle', 'san francisco', 'miami', 'denver', 'portland',
      'austin', 'philadelphia', 'phoenix', 'san diego', 'dallas', 'houston',
      'atlanta', 'detroit', 'washington', 'barcelona', 'amsterdam', 'berlin',
      'rome', 'milan', 'sydney', 'melbourne', 'toronto', 'vancouver'
    ];

    if (majorCities.some(city => lowerCity.includes(city))) {
      return 'major';
    }

    if (mediumCities.some(city => lowerCity.includes(city))) {
      return 'medium';
    }

    return 'small';
  }, []);

  // Calculate search radius based on query keywords and city scale
  const getRadiusForQuery = useCallback((query?: string, searchLocation?: string): number => {
    if (!query) return 3.2; // Default 2 miles

    const lowerQuery = query.toLowerCase();

    // "Nearby" or "around here" means truly close (1-2 miles) - always tight radius
    if (lowerQuery.includes('nearby') || lowerQuery.includes('around here') || lowerQuery.includes('close by')) {
      return 3.2; // 2 miles
    }

    // "Local" or "neighborhood" means moderate (3 miles)
    if (lowerQuery.includes('local') || lowerQuery.includes('neighborhood') || lowerQuery.includes('near me')) {
      return 4.8; // 3 miles
    }

    // City-specific searches - use city scale to determine radius
    if (lowerQuery.includes(' in ') && !lowerQuery.includes('near me')) {
      // Extract the city name from query (e.g., "pizza in NYC" -> "NYC")
      const match = lowerQuery.match(/\sin\s+(.+?)(?:\s|$)/);
      const cityInQuery = match ? match[1] : searchLocation || city;

      const scale = getMajorCityScale(cityInQuery);

      if (scale === 'major') {
        return 20; // 12.4 miles - wide radius for major cities like NYC, LA
      } else if (scale === 'medium') {
        return 14; // 8.7 miles - moderate radius for medium cities like Boston
      } else {
        return 8; // 5 miles - smaller radius for towns
      }
    }

    // Iconic/landmark searches need wider radius
    if (lowerQuery.includes('iconic') || lowerQuery.includes('famous') || lowerQuery.includes('landmark')) {
      // Check current city scale
      const scale = getMajorCityScale(searchLocation || city);
      return scale === 'major' ? 20 : scale === 'medium' ? 14 : 8;
    }

    // Default
    return 4.8; // 3 miles
  }, [city, getMajorCityScale]);

  // Search suggestion templates showcasing different search patterns
  const searchSuggestions = useMemo(() => [
    majorCity.toLowerCase(), // Just location → iconic tourist destinations
    'pizza in nyc', // Category + city → specific search in city
    'coffee shops nearby', // Category nearby → tight 2-mile radius
    'restaurants near me', // Near me → resets to GPS location
    `iconic places in ${majorCity}`, // Explicit iconic → tourist mode
  ], [majorCity]);

  const fetchVibe = useCallback(async (latitude: number, longitude: number, query?: string, append: boolean = false, excludePlaces: string[] = []) => {
    // Check free tier limits before searching (only for new searches, not appends)
    if (!append) {
      const exceeded = await hasExceededFreeTier();
      if (exceeded) {
        setShowUpgradePrompt(true);
        return;
      }
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setCanLoadMore(true);
    }
    let radiusKm = getRadiusForQuery(query, city);

    // Increase radius when Hot & New filter is active
    if (hotAndNewFilter) {
      radiusKm = Math.max(radiusKm, 16); // At least 16km (10 miles) for trending places - cast wider net
      console.log(`🔥 Hot & New active - expanded radius to ${radiusKm}km to find trending spots in hot neighborhoods`);
    }

    const categoriesArray = Array.from(categoryFilters);

    // Adjust radius based on category type (EXPLORE venues are rarer than EAT/DRINK)
    if (categoriesArray.includes('EXPLORE')) {
      radiusKm = Math.max(radiusKm, 6); // Min 6km (3.7 miles) for EXPLORE - activities and landmarks are less common
      console.log(`🎯 EXPLORE filter active - expanded radius to ${radiusKm}km to find activities and attractions`);
    }

    setCurrentRadius(radiusKm); // Store current radius for display
    console.log(`🔍 Search radius: ${radiusKm}km (${(radiusKm * 0.621371).toFixed(1)} miles) for query: "${query || 'default'}" in ${city}`);
    try {
      console.log(`🎯 Frontend: Passing categories to API:`, categoriesArray.length > 0 ? categoriesArray : 'none (all categories)');

      // GRID CACHE: Check for cached results first
      let data: { places: Place[]; city: string } | undefined;
      let gridCacheHit = false;
      if (!append) {
        const categoryKey = categoriesArray.length === 1 ? categoriesArray[0] : undefined;
        const cachedPlaces = await getGridCachedResults(latitude, longitude, categoryKey, query);

        if (cachedPlaces && cachedPlaces.length > 0) {
          console.log(`💾 GRID CACHE HIT: Using ${cachedPlaces.length} cached places (no API call!)`);
          gridCacheHit = true;
          // Use cached data in same format as API response
          data = {
            places: cachedPlaces,
            city: city || 'Unknown', // Use current city name
          };
          // Don't set loading=false here - let it happen after setPlaces() to avoid race condition
        }
      }

      // If no grid cache hit, call API
      if (!gridCacheHit) {
        // Use Foursquare for FREE searches when API key is available
        if (USE_FOURSQUARE) {
          console.log('🟣 Using Foursquare API (FREE tier - 10K calls/month)');
          data = await getRecommendationsWithFoursquare({ latitude, longitude }, query, radiusKm, hotAndNewFilter, excludePlaces, categoriesArray);
        } else {
          console.log('🔵 Using Google Places API');
          data = await getRecommendations({ latitude, longitude }, query, radiusKm, hotAndNewFilter, excludePlaces, categoriesArray);
        }
      }

      // Early return if no data
      if (!data) {
        setError("Failed to get recommendations");
        setLoading(false);
        return;
      }

      // Check if we're at the original GPS location (within ~100m)
      const isAtGpsLocation = userGpsCoords &&
        Math.abs(userGpsCoords.latitude - latitude) < 0.001 &&
        Math.abs(userGpsCoords.longitude - longitude) < 0.001;

      if (isAtGpsLocation && userGpsCity) {
        // At original GPS location - always use the original city name
        setCity(userGpsCity);
      } else if (isAtGpsLocation && !userGpsCity) {
        // First time at GPS location - save the city name
        setCity(data.city);
        setUserGpsCity(data.city);
      } else {
        // Different location (explicit search) - use new city name
        setCity(data.city);
      }

      // Filter out hidden places
      const hiddenPlaces = await getHiddenPlaces();
      const filteredPlaces = data.places.filter(place => !hiddenPlaces.includes(place.name));

      if (append) {
        // Filter out duplicates when appending
        setPlaces(prev => {
          const existingNames = new Set(prev.map(p => p.name));
          const newPlaces = filteredPlaces.filter(p => !existingNames.has(p.name));

          // If we got fewer than 8 new unique places, we've probably exhausted options
          if (newPlaces.length < 8) {
            setCanLoadMore(false);
          }

          return [...prev, ...newPlaces];
        });
        // Track newly shown places
        setShownPlaces(prev => [...prev, ...filteredPlaces.map(p => p.name)]);
        // Add to history
        filteredPlaces.forEach(place => {
          addToHistory(place, query, data.city);
        });
      } else {
        setPlaces(filteredPlaces);
        // Track all shown places
        setShownPlaces(prev => [...prev, ...filteredPlaces.map(p => p.name)]);
        // Add to history
        filteredPlaces.forEach(place => {
          addToHistory(place, query, data.city);
        });

        // Track search in usage stats
        const updatedStats = await trackSearch();
        setUsageStats(updatedStats);

        // Show remaining searches
        const remaining = await getRemainingSearches();
        if (remaining <= 2 && remaining > 0) {
          console.log(`⚠️ Only ${remaining} searches remaining in free tier`);
        }

        // Save results to cache
        await saveCachedResults(filteredPlaces, data.city, latitude, longitude, query);

        // Save to grid cache if this was a fresh API call
        if (!gridCacheHit) {
          const categoryKey = categoriesArray.length === 1 ? categoriesArray[0] : undefined;
          await saveGridCachedResults(latitude, longitude, filteredPlaces, categoryKey, query);
        }

        setLastUpdated(Date.now());
        setUsingCachedData(false);
      }
    } catch (err) {
      setError("Failed to get recommendations. AI might be tired.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userGpsCoords, userGpsCity, getRadiusForQuery, city, hotAndNewFilter, categoryFiltersKey]);

  const handleLocate = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setError("We need your location to find the vibe.");
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setPermissionGranted(true);
      const { latitude, longitude } = location.coords;
      const gpsCoords = { latitude, longitude };
      setCoords(gpsCoords);
      setUserGpsCoords(gpsCoords);

      // Get the actual city name from GPS coordinates using reverse geocoding
      const { reverseGeocode } = await import('./services/geocoding');
      const actualCity = await reverseGeocode(gpsCoords);
      if (actualCity) {
        setUserGpsCity(actualCity);
        setCity(actualCity);
      }

      // Try to load cached results first
      const cached = await getCachedResults();
      if (cached && cached.places.length > 0) {
        console.log('📂 Using cached results - no search needed!');
        setPlaces(cached.places);
        setCity(cached.city);
        setCoords({ latitude: cached.latitude, longitude: cached.longitude });
        setLastUpdated(cached.timestamp);
        setUsingCachedData(true);
        setLoading(false);
      } else {
        // No cache - trigger automatic search
        console.log('🔍 No cache found - triggering automatic search');
        fetchVibe(latitude, longitude);
      }
    } catch (err) {
      setLoading(false);
      setError("We need your location to find the vibe.");
      console.error(err);
    }
  }, [fetchVibe]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !canLoadMore || !coords) return;
    console.log('🔄 Loading more places...');
    fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, true, shownPlaces);
  }, [loadingMore, canLoadMore, coords, searchQuery, fetchVibe, shownPlaces]);

  const toggleCategoryFilter = useCallback((category: string) => {
    setCategoryFilters(prev => {
      // If clicking the same active filter, clear all filters
      if (prev.has(category) && prev.size === 1) {
        return new Set();
      }
      // Otherwise, set only this filter as active
      return new Set([category]);
    });
  }, []);

  // Trigger new search when category filters change
  useEffect(() => {
    // Skip on initial mount
    if (categoryFilterInitialMount.current) {
      categoryFilterInitialMount.current = false;
      return;
    }

    if (coords && places.length > 0) {
      console.log(`📁 Category filters changed: ${Array.from(categoryFilters).join(', ') || 'all'}`);
      // Don't clear places immediately - let new results replace old ones
      // This prevents the UI from showing empty state during the search
      setShownPlaces([]);
      setCanLoadMore(true);
      fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined);
    }
  }, [categoryFilters]);

  // Trigger new search when Hot & New filter changes
  useEffect(() => {
    // Skip on initial mount
    if (hotAndNewFilterInitialMount.current) {
      hotAndNewFilterInitialMount.current = false;
      return;
    }

    if (coords && places.length > 0) {
      console.log(`🔥 Hot & New filter changed: ${hotAndNewFilter}`);
      fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, false);
    }
  }, [hotAndNewFilter]);

  // Load usage stats on mount
  useEffect(() => {
    const loadStats = async () => {
      const stats = await getUsageStats();
      setUsageStats(stats);
      console.log(`📊 Usage stats loaded: ${stats.searchCount}/${FREE_TIER_LIMITS.searchesPerMonth} searches used`);
    };
    loadStats();
  }, []);

  // Dev helper: expose reset function globally for testing
  useEffect(() => {
    if (__DEV__) {
      (global as any).resetUsage = async () => {
        await resetUsageStats();
        const newStats = await getUsageStats();
        setUsageStats(newStats);
        console.log('✅ Usage reset! You have 5 fresh searches.');
      };
      console.log('💡 Dev mode: Type "resetUsage()" in console to reset your free tier');
    }
  }, []);


  if (!permissionGranted) {
    return (
      <SafeAreaView style={styles.permissionScreen} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="light-content" />
        
        {/* Background Gradient Blobs */}
        <View style={[styles.blob, styles.blobTop]} />
        <View style={[styles.blob, styles.blobBottom]} />

        <View style={styles.permissionContent}>
          <View style={styles.titleSection}>
            <LinearGradient
              colors={['#818cf8', '#a78bfa']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.titleGradient}
            >
              <Text style={styles.title}>VibeCheck</Text>
            </LinearGradient>
            <Text style={styles.subtitle}>
              Discover the best spots around you.
            </Text>
          </View>

          <View style={styles.card}>
            <TouchableOpacity
              onPress={handleLocate}
              style={styles.locateButton}
              activeOpacity={0.9}
            >
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <Circle cx={12} cy={10} r={3} />
              </Svg>
              <Text style={styles.locateButtonText}>Find My Vibe</Text>
            </TouchableOpacity>
            {error && <Text style={styles.errorText}>{error}</Text>}
          </View>
        </View>
        </SafeAreaView>
    );
  }

  if (loading) {
    console.log(`⏳ LOADING SCREEN SHOWN - blocking UI (loading=${loading})`);
    return <LoadingScreen status="Scanning social signals..." />;
  }

  // DEBUG DISABLED: console.log(`✅ UI RENDERING - loading=${loading}, places=${places.length}, filteredPlaces=${filteredPlaces.length}`);

  // Calculate card dimensions based on screen
  const isSmall = width < 768;
  const gridCols = isSmall ? 2 : 3;
  const gridRows = isSmall ? 5 : 3;
  const gap = isSmall ? 12 : 16;
  const padding = isSmall ? 16 : 32;
  
  const availableWidth = width - padding * 2 - gap * (gridCols - 1);
  const cardWidth = availableWidth / gridCols;
  const cardHeight = isSmall ? cardWidth * 1.2 : (height - padding * 2 - gap * (gridRows - 1)) / gridRows;


  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setShowSuggestions(false);
    Keyboard.dismiss(); // Dismiss keyboard when searching

    console.log('🔍 Search query:', searchQuery);
    setLoading(true);
    const parsed = parseLocationFromQuery(searchQuery);
    console.log('📝 Parsed:', parsed);
    
    if (parsed.location) {
      // User specified a location with "in/near/around" - geocode it
      console.log('🗺️ Geocoding location from "in/near/around":', parsed.location);
      const geocoded = await geocodeLocation(parsed.location, userGpsCoords || undefined);
      
      if (geocoded) {
        console.log('✅ Setting coords to:', geocoded.coords);
        // Update center to the new location
        setCoords(geocoded.coords);
        setCity(geocoded.formattedAddress);
        fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, parsed.query);
      } else {
        setError('Could not find that location');
        setLoading(false);
      }
    } else {
      // No "in/near/around" keyword
      // Only treat as location if:
      // 1. Contains comma (e.g., "Rome, Italy" or "New York, NY")
      // 2. Starts with "things to do" or "places to visit"
      const hasComma = parsed.query.includes(',');
      const isExplicitLocationQuery = /^(things to do|places to visit|things to see)/i.test(parsed.query);
      
      if (hasComma || isExplicitLocationQuery) {
        // Explicit location format - try geocoding
        console.log('🗺️ Query has location format, trying geocoding:', parsed.query);
        const geocoded = await geocodeLocation(parsed.query, userGpsCoords || undefined);

        if (geocoded) {
          console.log('✅ Successfully geocoded, setting coords to:', geocoded.coords);
          setCoords(geocoded.coords);
          setCity(geocoded.formattedAddress);
          // For location-only searches, show iconic tourist destinations
          // Use "iconic places" to avoid triggering DO category filter
          fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, 'iconic places');
          return;
        }
      }

      // Filter out cuisine types and common search terms that aren't locations
      const nonLocationKeywords = [
        // Cuisines
        'indian', 'chinese', 'japanese', 'thai', 'mexican', 'italian', 'french', 'korean',
        'vietnamese', 'greek', 'spanish', 'mediterranean', 'american', 'brazilian',
        // Food types
        'pizza', 'ramen', 'sushi', 'burger', 'tacos', 'pasta', 'noodles', 'bbq',
        'seafood', 'steak', 'chicken', 'breakfast', 'brunch', 'lunch', 'dinner',
        // Drinks
        'coffee', 'cafe', 'tea', 'bar', 'brewery', 'cocktail', 'beer', 'wine',
        // Categories
        'restaurant', 'food', 'eat', 'drink', 'pub', 'nightclub', 'lounge',
        // Activities
        'museum', 'park', 'gym', 'spa', 'shopping', 'mall'
      ];

      const queryLower = parsed.query.toLowerCase();
      const isNonLocationQuery = nonLocationKeywords.some(keyword =>
        queryLower === keyword || queryLower.includes(` ${keyword}`) || queryLower.includes(`${keyword} `)
      );

      // Try geocoding as potential location (e.g., "trinidad port of spain", "paris", "tokyo")
      // This catches place names without explicit "in/near" keywords
      // Skip geocoding for cuisine/food/activity searches
      if (!isNonLocationQuery) {
        console.log('🗺️ Attempting to geocode query as potential location:', parsed.query);
        const geocoded = await geocodeLocation(parsed.query, userGpsCoords || undefined);

        if (geocoded) {
          // Successfully geocoded - this looks like a location!
          console.log('✅ Query appears to be a location, setting coords to:', geocoded.coords);
          setCoords(geocoded.coords);
          setCity(geocoded.formattedAddress);
          // For location-only searches, show iconic tourist destinations
          // Use "iconic places" to avoid triggering DO category filter
          fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, 'iconic places');
          return;
        }
      }

      // If we reach here, either:
      // 1. Query is a cuisine/food/activity search (isNonLocationQuery = true)
      // 2. Geocoding failed
      // In both cases, treat as local search query
      console.log('🔍 Not a location, treating as local search query:', parsed.query);

      // Check if this is a "near me" type query - should search from GPS location
      const lowerQuery = parsed.query.toLowerCase();

      // More precise "near me" detection to avoid false positives
      const isNearMeQuery = lowerQuery.includes('near me') ||
                            lowerQuery.includes('nearby') ||
                            lowerQuery.includes('around here') ||
                            lowerQuery.includes('close by') ||
                            // Only treat "local" as reset if it's standalone or with generic terms
                            (lowerQuery.includes('local') &&
                             (lowerQuery === 'local' ||
                              lowerQuery.match(/\blocal\s+(favorites|things|places|spots|recommendations)\b/)));

      if (isNearMeQuery && userGpsCoords) {
        // Reset to GPS location for "near me" searches
        console.log('📍 "Near me" query detected - resetting to GPS location:', userGpsCoords);
        setCoords(userGpsCoords);
        if (userGpsCity) {
          setCity(userGpsCity);
        }
        fetchVibe(userGpsCoords.latitude, userGpsCoords.longitude, parsed.query);
      } else if (coords) {
        // Use current map center for other searches
        fetchVibe(coords.latitude, coords.longitude, parsed.query);
      } else {
        setError('Please enable location first');
        setLoading(false);
      }
    }
  };

  const handleHidePlace = (placeName: string) => {
    // Remove the hidden place from the current list immediately
    setPlaces(prev => prev.filter(p => p.name !== placeName));
  };

  const handleSuggestionClick = async (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    Keyboard.dismiss(); // Dismiss keyboard to close suggestions

    // Trigger search immediately for suggestions
    console.log('🔍 Search query:', suggestion);
    setLoading(true);
    const parsed = parseLocationFromQuery(suggestion);
    console.log('📝 Parsed:', parsed);

    if (parsed.location) {
      // User specified a location with "in/near/around" - geocode it
      console.log('🗺️ Geocoding location from "in/near/around":', parsed.location);
      const geocoded = await geocodeLocation(parsed.location, userGpsCoords || undefined);

      if (geocoded) {
        console.log('✅ Setting coords to:', geocoded.coords);
        setCoords(geocoded.coords);
        setCity(geocoded.formattedAddress);
        fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, parsed.query);
      } else {
        setError('Could not find that location');
        setLoading(false);
      }
    } else {
      // Try geocoding as potential location first
      console.log('🗺️ Attempting to geocode suggestion as potential location:', parsed.query);
      const geocoded = await geocodeLocation(parsed.query, userGpsCoords || undefined);

      if (geocoded) {
        // Successfully geocoded - this looks like a location!
        console.log('✅ Suggestion appears to be a location, setting coords to:', geocoded.coords);
        setCoords(geocoded.coords);
        setCity(geocoded.formattedAddress);
        // For location-only searches, show iconic tourist destinations
        // Use "iconic places" to avoid triggering DO category filter
        fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, 'iconic places');
        return;
      }

      // Check if this is a "near me" type query
      const lowerQuery = parsed.query.toLowerCase();

      // More precise "near me" detection to avoid false positives
      const isNearMeQuery = lowerQuery.includes('near me') ||
                            lowerQuery.includes('nearby') ||
                            lowerQuery.includes('around here') ||
                            lowerQuery.includes('close by') ||
                            // Only treat "local" as reset if it's standalone or with generic terms
                            (lowerQuery.includes('local') &&
                             (lowerQuery === 'local' ||
                              lowerQuery.match(/\blocal\s+(favorites|things|places|spots|recommendations)\b/)));

      if (isNearMeQuery && userGpsCoords) {
        // Reset to GPS location for "near me" searches
        console.log('📍 "Near me" query detected - resetting to GPS location:', userGpsCoords);
        setCoords(userGpsCoords);
        if (userGpsCity) {
          setCity(userGpsCity);
        }
        fetchVibe(userGpsCoords.latitude, userGpsCoords.longitude, parsed.query);
      } else if (coords) {
        // Use current map center for other searches
        fetchVibe(coords.latitude, coords.longitude, parsed.query);
      } else {
        setError('Please enable location first');
        setLoading(false);
      }
    }
  };

  const handleCancelSearch = () => {
    setShowSuggestions(false);
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.mainScreen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />

      {/* Header with Hamburger Menu */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>VibeCheck</Text>
        <TouchableOpacity
          style={styles.hamburgerButton}
          onPress={() => setShowMenu(true)}
          activeOpacity={0.7}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth={2} strokeLinecap="round">
            <Path d="M3 12h18M3 6h18M3 18h18" />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Usage Indicator - Shows when ≤3 searches remaining */}
      <UsageIndicator stats={usageStats} onUpgradePress={() => setShowUpgradePrompt(true)} />

      {/* Location Context Chip - Shows when searching different location */}
      {userGpsCoords && coords &&
       (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 ||
        Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01) && (
        <View style={styles.locationContextContainer}>
          <View style={styles.locationContextChip}>
            <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2}>
              <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <Circle cx={12} cy={10} r={3} />
            </Svg>
            <Text style={styles.locationContextText}>Searching in {city}</Text>
            <TouchableOpacity
              onPress={() => {
                setCoords(userGpsCoords);
                setSearchQuery('');
                if (userGpsCity) setCity(userGpsCity);
                fetchVibe(userGpsCoords.latitude, userGpsCoords.longitude);
              }}
              style={styles.locationContextClose}
              activeOpacity={0.7}
            >
              <Text style={styles.locationContextCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Grid Container with KeyboardAvoidingView */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.gridContainer, { padding, paddingTop: 4, paddingBottom: 8 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const scrolledToBottom = contentOffset.y + layoutMeasurement.height;
          const contentHeight = contentSize.height;

          // Calculate how far they've pulled past the bottom
          const overscroll = Math.max(0, scrolledToBottom - contentHeight);
          pullDistanceRef.current = overscroll;

          // Only update state when crossing threshold (for UI indicator)
          const isPullActive = overscroll >= 80;
          if (isPullActive !== pullActive) {
            setPullActive(isPullActive);
          }
        }}
        scrollEventThrottle={100}
        onScrollEndDrag={() => {
          const PULL_THRESHOLD = 80; // Need to pull 80px past bottom to trigger

          // Trigger load if they pulled far enough
          if (pullDistanceRef.current >= PULL_THRESHOLD && canLoadMore && !loadingMore && !loading) {
            console.log(`📜 Pull threshold reached (${pullDistanceRef.current}px) - loading more...`);
            handleLoadMore();
          }

          // Reset pull distance
          pullDistanceRef.current = 0;
          setPullActive(false);
        }}
      >
        {/* Radius Context Display */}
        {places.length > 0 && (
          <View style={styles.radiusContextContainer}>
            <Text style={styles.radiusContextText}>
              Within {(currentRadius * 0.621371).toFixed(1)} miles of {
                userGpsCoords && coords &&
                (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 ||
                 Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01)
                  ? city
                  : 'your location'
              }
            </Text>
            {usingCachedData && lastUpdated && coords && (
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => fetchVibe(coords.latitude, coords.longitude)}
                activeOpacity={0.7}
              >
                <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2}>
                  <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <Path d="M21 3v5h-5"/>
                  <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <Path d="M3 21v-5h5"/>
                </Svg>
                <Text style={styles.refreshButtonText}>
                  Refresh • Updated {Math.floor((Date.now() - lastUpdated) / (1000 * 60 * 60))}h ago
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isSmall ? (
          // Mobile Layout (2 cols, dynamic rows)
          <>
            {/* Top 2 cards */}
            <View style={[styles.row, { gap }]}>
              {filteredPlaces.slice(0, 2).map((place, i) => (
                <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                  <PlaceCard place={place} delay={i * 100} onSelect={setSelectedPlace} onHidePlace={handleHidePlace} coords={coords || undefined} index={i} />
                </View>
              ))}
            </View>
            
            {/* Center piece */}
            <View style={[styles.row, { gap }]}>
              <View style={{ width: availableWidth + gap, height: cardHeight * 0.7 }}>
                <CenterPiece
                  city={city}
                  coords={coords}
                  onMapPress={() => setShowFullMap(true)}
                  isSearchedLocation={userGpsCoords !== null && coords !== null &&
                    (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 ||
                     Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01)}
                  places={filteredPlaces}
                  userGpsCoords={userGpsCoords}
                />
              </View>
            </View>

            {/* All remaining cards in rows of 2 */}
            {Array.from({ length: Math.ceil((filteredPlaces.length - 2) / 2) }, (_, rowIndex) => (
              <View key={`row-${rowIndex}`} style={[styles.row, { gap }]}>
                {filteredPlaces.slice(2 + rowIndex * 2, 4 + rowIndex * 2).map((place, i) => (
                  <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                    <PlaceCard
                      place={place}
                      delay={0}
                      onSelect={setSelectedPlace}
                      onHidePlace={handleHidePlace}
                      coords={coords || undefined}
                      index={2 + rowIndex * 2 + i}
                    />
                  </View>
                ))}
              </View>
            ))}

            {/* Loading More Indicator or Pull Up Prompt */}
            {canLoadMore && (
              <View style={styles.loadMoreContainer}>
                {loadingMore ? (
                  <View style={styles.loadingIndicator}>
                    <AnimatedSpinner />
                    <Text style={styles.loadMoreText}>Loading 8 more places...</Text>
                  </View>
                ) : (
                  <View style={[styles.pullUpPrompt, pullActive && styles.pullUpPromptActive]}>
                    <Svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={pullActive ? "#10b981" : "#64748b"}
                      strokeWidth={2}
                    >
                      <Path d="M12 19V5M5 12l7-7 7 7" />
                    </Svg>
                    <Text style={[styles.pullUpText, pullActive && styles.pullUpTextActive]}>
                      {pullActive ? "Release to load 8 more" : "Pull up to get more results"}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          // Desktop Layout (3 cols x 3 rows)
          <>
            {[0, 1, 2].map((rowIndex) => (
              <View key={`row-${rowIndex}`} style={[styles.row, { gap }]}>
                {[0, 1, 2].map((colIndex) => {
                  const index = rowIndex * 3 + colIndex;
                  
                  // Center cell (row 1, col 1)
                  if (rowIndex === 1 && colIndex === 1) {
                    return (
                      <View key="center" style={{ width: cardWidth, height: cardHeight }}>
                        <CenterPiece
                          city={city}
                          coords={coords}
                          onMapPress={() => setShowFullMap(true)}
                          isSearchedLocation={userGpsCoords !== null && coords !== null &&
                            (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 ||
                             Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01)}
                          places={filteredPlaces}
                          userGpsCoords={userGpsCoords}
                        />
                      </View>
                    );
                  }
                  
                  // Map places around center
                  const placeIndex = index > 4 ? index - 1 : index;
                  const place = filteredPlaces[placeIndex];

                  if (!place) return null;
                  
                  return (
                    <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                      <PlaceCard
                        place={place}
                        delay={placeIndex * 100}
                        onSelect={setSelectedPlace}
                        onHidePlace={handleHidePlace}
                        coords={coords || undefined}
                        index={placeIndex}
                      />
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}
        </ScrollView>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBarRow}>
            <View style={[styles.searchBar, showSuggestions && styles.searchBarFocused]}>
              <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}>
                <Circle cx={11} cy={11} r={8} />
                <Path d="m21 21-4.35-4.35" />
              </Svg>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for sushi, coffee, museums..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 300)}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearButton}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {showSuggestions && (
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelSearch}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Toggles */}
          {!showSuggestions && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterChipsContainer}
              contentContainerStyle={styles.filterChipsContent}
            >
              {/* Category Filter Toggles - Eat, Drink, Explore */}
              {['EAT', 'DRINK', 'EXPLORE'].map(category => {
                const displayName = category.charAt(0) + category.slice(1).toLowerCase();
                return (
                  <TouchableOpacity
                    key={category}
                    style={[styles.filterChip, categoryFilters.has(category) && styles.filterChipActive]}
                    onPress={() => toggleCategoryFilter(category)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, categoryFilters.has(category) && styles.filterChipTextActive]}>
                      {displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Open Now Filter Toggle */}
              <TouchableOpacity
                style={[styles.filterChip, openNowFilter && styles.filterChipActive]}
                onPress={() => setOpenNowFilter(!openNowFilter)}
                activeOpacity={0.7}
              >
                <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={openNowFilter ? "#10b981" : "#64748b"} strokeWidth={2} style={{ marginRight: 6 }}>
                  <Circle cx={12} cy={12} r={10} />
                  <Path d="M12 6v6l4 2" />
                </Svg>
                <Text style={[styles.filterChipText, openNowFilter && styles.filterChipTextActive]}>
                  Open Now
                </Text>
              </TouchableOpacity>

              {/* Hot & New Filter Toggle */}
              <TouchableOpacity
                style={[styles.filterChip, hotAndNewFilter && styles.filterChipActive, hotAndNewFilter && styles.hotAndNewChipActive]}
                onPress={() => setHotAndNewFilter(!hotAndNewFilter)}
                activeOpacity={0.7}
              >
                <Text style={styles.flameIcon}>🔥</Text>
                <Text style={[styles.filterChipText, hotAndNewFilter && styles.filterChipTextActive]}>
                  Hot & New
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* Search Suggestions Dropdown - Floating above search bar */}
          {showSuggestions && (
            <View style={styles.suggestionsDropdown}>
              <View style={styles.suggestionsHeader}>
                <Text style={styles.suggestionsHeaderText}>How to search</Text>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
              >
                {searchSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.suggestionItem,
                      index === searchSuggestions.length - 1 && styles.suggestionItemLast
                    ]}
                    onPress={() => handleSuggestionClick(suggestion)}
                    activeOpacity={0.6}
                  >
                    <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2} style={{ marginRight: 12 }}>
                      <Circle cx={11} cy={11} r={8} />
                      <Path d="m21 21-4.35-4.35" />
                    </Svg>
                    <Text style={styles.suggestionItemText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Full Screen Map */}
        {coords && (
          <FullScreenMap
            visible={showFullMap}
            coords={coords}
            places={places}
            onClose={() => setShowFullMap(false)}
            onSearch={(newCoords, query) => {
              setCoords(newCoords);
              fetchVibe(newCoords.latitude, newCoords.longitude, query);
            }}
            userGpsCoords={userGpsCoords}
            city={city}
          />
        )}

        {/* Popup Modal */}
        {selectedPlace && (
          <PlacePopup
            place={selectedPlace}
            onClose={() => setSelectedPlace(null)}
          />
        )}

        {/* Upgrade Prompt Modal */}
        <UpgradePrompt
          visible={showUpgradePrompt}
          stats={usageStats}
          onClose={() => setShowUpgradePrompt(false)}
          onUpgrade={() => {
            // TODO: Integrate payment processor (Stripe, RevenueCat, etc.)
            console.log('💳 Upgrade to Premium - Payment integration pending');
            setShowUpgradePrompt(false);
          }}
        />

        {/* Hamburger Menu Modal */}
        <Modal
          visible={showMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMenu(false)}
        >
          <View style={styles.menuOverlay}>
            <TouchableOpacity
              style={styles.menuBackdrop}
              activeOpacity={1}
              onPress={() => setShowMenu(false)}
            />

            <View style={styles.menuContainer}>
                <View style={styles.menuHeader}>
                  <Text style={styles.menuTitle}>Menu</Text>
                  <TouchableOpacity onPress={() => setShowMenu(false)} style={styles.menuCloseButton}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}>
                      <Path d="M18 6 6 18"/>
                      <Path d="m6 6 12 12"/>
                    </Svg>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.menuContent} showsVerticalScrollIndicator={false}>
                  {/* Usage Stats Section */}
                  <View style={styles.menuSection}>
                    <Text style={styles.menuSectionTitle}>USAGE STATS</Text>
                    <View style={styles.statsCard}>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Searches this month</Text>
                        <Text style={styles.statValue}>
                          {usageStats?.searchCount || 0} / {FREE_TIER_LIMITS.searchesPerMonth}
                        </Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Remaining searches</Text>
                        <Text style={[styles.statValue, { color: (FREE_TIER_LIMITS.searchesPerMonth - (usageStats?.searchCount || 0)) <= 2 ? '#f87171' : '#10b981' }]}>
                          {Math.max(0, FREE_TIER_LIMITS.searchesPerMonth - (usageStats?.searchCount || 0))}
                        </Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Places viewed</Text>
                        <Text style={styles.statValue}>{usageStats?.placeViewCount || 0}</Text>
                      </View>
                      <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Total searches (all time)</Text>
                        <Text style={styles.statValue}>{usageStats?.totalSearchesAllTime || 0}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Actions Section */}
                  <View style={styles.menuSection}>
                    <Text style={styles.menuSectionTitle}>ACTIONS</Text>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => {
                        setShowMenu(false);
                        setShowUpgradePrompt(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuButtonContent}>
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth={2}>
                          <Path d="M12 2L2 7l10 5 10-5-10-5z"/>
                          <Path d="M2 17l10 5 10-5"/>
                          <Path d="M2 12l10 5 10-5"/>
                        </Svg>
                        <View style={styles.menuButtonText}>
                          <Text style={styles.menuButtonTitle}>Upgrade to Premium</Text>
                          <Text style={styles.menuButtonSubtitle}>Unlimited searches for $4.99/mo</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={async () => {
                        await resetUsageStats();
                        const newStats = await getUsageStats();
                        setUsageStats(newStats);
                        setShowMenu(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuButtonContent}>
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2}>
                          <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                          <Path d="M21 3v5h-5"/>
                          <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                          <Path d="M3 21v-5h5"/>
                        </Svg>
                        <View style={styles.menuButtonText}>
                          <Text style={styles.menuButtonTitle}>Reset Usage Stats</Text>
                          <Text style={styles.menuButtonSubtitle}>For testing purposes</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={async () => {
                        await clearCachedResults();
                        setUsingCachedData(false);
                        setLastUpdated(null);
                        setShowMenu(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuButtonContent}>
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}>
                          <Path d="M3 6h18"/>
                          <Path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                          <Path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </Svg>
                        <View style={styles.menuButtonText}>
                          <Text style={styles.menuButtonTitle}>Clear Cached Results</Text>
                          <Text style={styles.menuButtonSubtitle}>Force refresh on next load</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={async () => {
                        await clearGridCache();
                        Alert.alert('Cache Cleared', 'Grid cache has been cleared. Next search will be fresh!', [{ text: 'OK' }]);
                        setShowMenu(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.menuButtonContent}>
                        <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth={2}>
                          <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                          <Path d="M3.27 6.96 12 12.01l8.73-5.05"/>
                          <Path d="M12 22.08V12"/>
                        </Svg>
                        <View style={styles.menuButtonText}>
                          <Text style={styles.menuButtonTitle}>Clear Grid Cache</Text>
                          <Text style={styles.menuButtonSubtitle}>Clear location-based cache (~60% savings)</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* About Section */}
                  <View style={styles.menuSection}>
                    <Text style={styles.menuSectionTitle}>ABOUT</Text>
                    <View style={styles.aboutCard}>
                      <Text style={styles.aboutTitle}>VibeCheck</Text>
                      <Text style={styles.aboutVersion}>Version 1.0.0</Text>
                      <Text style={styles.aboutDescription}>
                        AI-powered place discovery with real-time data from Foursquare and OpenStreetMap.
                      </Text>
                      <Text style={styles.aboutTech}>
                        Powered by Gemini 2.5 Flash-Lite
                      </Text>
                      <Text style={[styles.aboutTech, { fontSize: 10, marginTop: 8, opacity: 0.7 }]}>
                        Data sources: Foursquare Places API, © OpenStreetMap contributors
                      </Text>
                    </View>
                  </View>
                </ScrollView>
            </View>
          </View>
        </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  permissionScreen: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    width: 500,
    height: 500,
    borderRadius: 250,
    opacity: 0.2,
  },
  blobTop: {
    top: -100,
    left: -100,
    backgroundColor: '#4f46e5',
  },
  blobBottom: {
    bottom: -100,
    right: -100,
    backgroundColor: '#7c3aed',
  },
  permissionContent: {
    width: '100%',
    maxWidth: 400,
    zIndex: 10,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  titleGradient: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  card: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
  },
  locateButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: '#f87171',
    textAlign: 'center',
  },
  mainScreen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  hamburgerButton: {
    padding: 4,
    borderRadius: 8,
  },
  locationContextContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#020617',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  locationContextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  locationContextText: {
    flex: 1,
    fontSize: 13,
    color: '#fbbf24',
    fontWeight: '500',
  },
  locationContextClose: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  locationContextCloseText: {
    fontSize: 16,
    color: '#fbbf24',
    fontWeight: '600',
  },
  radiusContextContainer: {
    width: '100%',
    paddingBottom: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  radiusContextText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
    textAlign: 'center',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginTop: 8,
  },
  refreshButtonText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  gridContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  suggestionsDropdown: {
    position: 'absolute',
    bottom: 80, // Position above the search bar
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: 300,
  },
  suggestionsHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  suggestionsHeaderText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionItemText: {
    fontSize: 15,
    color: '#e2e8f0',
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: 'rgba(2, 6, 23, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.5)',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  searchBarFocused: {
    borderColor: 'rgba(99, 102, 241, 0.5)',
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
  },
  cancelButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#a5b4fc',
    fontWeight: '500',
  },
  filterChipsContainer: {
    marginTop: 12,
  },
  filterChipsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  hotAndNewChipActive: {
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
    borderColor: 'rgba(249, 115, 22, 0.5)',
  },
  flameIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  filterChipText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#10b981',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 0,
  },
  clearButton: {
    fontSize: 18,
    color: '#64748b',
    paddingHorizontal: 4,
  },
  loadMoreContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  loadingSpinner: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderTopColor: 'transparent',
    borderRadius: 9,
  },
  loadMoreText: {
    fontSize: 15,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  loadingIndicator: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  pullUpPrompt: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    opacity: 0.6,
  },
  pullUpPromptActive: {
    opacity: 1,
  },
  pullUpText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  pullUpTextActive: {
    color: '#10b981',
    fontWeight: '600',
  },
  menuOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    width: 320,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.3)',
  },
  menuTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  menuCloseButton: {
    padding: 4,
  },
  menuContent: {
    flex: 1,
  },
  menuSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.3)',
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  statsCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 16,
    color: '#e2e8f0',
    fontWeight: 'bold',
  },
  menuButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButtonText: {
    flex: 1,
  },
  menuButtonTitle: {
    fontSize: 16,
    color: '#e2e8f0',
    fontWeight: '600',
    marginBottom: 4,
  },
  menuButtonSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
  },
  aboutCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  aboutTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#818cf8',
    marginBottom: 4,
  },
  aboutVersion: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  aboutDescription: {
    fontSize: 14,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  aboutTech: {
    fontSize: 12,
    color: '#818cf8',
    fontWeight: '600',
  },
});

// App wrapper with bottom tab navigation
export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#020617',
            borderTopColor: 'rgba(51, 65, 85, 0.5)',
            borderTopWidth: 1,
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarActiveTintColor: '#6366f1',
          tabBarInactiveTintColor: '#64748b',
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="Discover"
          component={DiscoverScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
                <Circle cx={11} cy={11} r={8} />
                <Path d="m21 21-4.35-4.35" />
              </Svg>
            ),
          }}
        />
        <Tab.Screen
          name="Saved"
          component={SavedPlacesScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
                <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </Svg>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
