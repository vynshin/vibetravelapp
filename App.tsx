import './global.css';
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRecommendations } from './services/gemini';
import { geocodeLocation, parseLocationFromQuery } from './services/geocoding';
import { getHiddenPlaces } from './services/storage';
import { Coordinates, Place } from './types';
import { PlaceCard } from './components/PlaceCard';
import { CenterPiece } from './components/CenterPiece';
import { LoadingScreen } from './components/LoadingScreen';
import { PlacePopup } from './components/PlacePopup';
import { FullScreenMap } from './components/FullScreenMap';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path, Circle } from 'react-native-svg';

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

export default function App() {
  const [coords, setCoords] = useState<Coordinates | null>(null); // Current search center
  const [userGpsCoords, setUserGpsCoords] = useState<Coordinates | null>(null); // Original GPS location
  const [city, setCity] = useState<string>("Locating...");
  const [userGpsCity, setUserGpsCity] = useState<string | null>(null); // City name for original GPS location
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [canLoadMore, setCanLoadMore] = useState<boolean>(true);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFullMap, setShowFullMap] = useState<boolean>(false);
  const [vibeMode, setVibeMode] = useState<'iconic' | 'mixed' | 'local'>('iconic'); // Vibe filter - default to iconic
  
  // Smart distance based on vibe mode
  const getDistanceForVibe = (vibe: 'iconic' | 'mixed' | 'local'): number => {
    switch (vibe) {
      case 'local': return 3.2; // 2 miles - tight radius for neighborhood gems
      case 'mixed': return 4.8; // 3 miles - balanced
      case 'iconic': return 8; // 5 miles - worth traveling for
    }
  };

  const fetchVibe = useCallback(async (latitude: number, longitude: number, query?: string, vibe?: 'iconic' | 'mixed' | 'local', append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setCanLoadMore(true);
    }
    const selectedVibe = vibe || vibeMode;
    const radiusKm = getDistanceForVibe(selectedVibe);
    try {
      const data = await getRecommendations({ latitude, longitude }, query, radiusKm, selectedVibe);
      
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
          
          // If we got fewer than 4 new unique places, we've probably exhausted options
          if (newPlaces.length < 4) {
            setCanLoadMore(false);
          }
          
          return [...prev, ...newPlaces];
        });
      } else {
        setPlaces(filteredPlaces);
      }
    } catch (err) {
      setError("Failed to get recommendations. AI might be tired.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userGpsCoords, userGpsCity, vibeMode, getDistanceForVibe]);

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
      
      fetchVibe(latitude, longitude);
    } catch (err) {
      setLoading(false);
      setError("We need your location to find the vibe.");
      console.error(err);
    }
  }, [fetchVibe]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !canLoadMore || !coords) return;
    console.log('🔄 Loading more places...');
    fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, vibeMode, true);
  }, [loadingMore, canLoadMore, coords, searchQuery, vibeMode, fetchVibe]);

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    
    // Check if we've over-scrolled at the bottom (pulled up beyond content)
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 10;
    const overScroll = (layoutMeasurement.height + contentOffset.y) - contentSize.height;
    
    // If pulled up more than 80px beyond the bottom, trigger load more
    if (isAtBottom && overScroll > 80 && canLoadMore && !loadingMore) {
      handleLoadMore();
    }
  }, [canLoadMore, loadingMore, handleLoadMore]);

  // Load saved vibe mode on app start
  useEffect(() => {
    const loadVibeMode = async () => {
      try {
        const saved = await AsyncStorage.getItem('vibeMode');
        if (saved && (saved === 'iconic' || saved === 'mixed' || saved === 'local')) {
          setVibeMode(saved as 'iconic' | 'mixed' | 'local');
        }
      } catch (error) {
        console.log('Failed to load vibe mode:', error);
      }
    };
    loadVibeMode();
  }, []);

  // Save vibe mode whenever it changes
  const updateVibeMode = useCallback(async (mode: 'iconic' | 'mixed' | 'local') => {
    setVibeMode(mode);
    try {
      await AsyncStorage.setItem('vibeMode', mode);
    } catch (error) {
      console.log('Failed to save vibe mode:', error);
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
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <Circle cx="12" cy="10" r="3" />
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
    return <LoadingScreen status="Scanning social signals..." />;
  }

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
          fetchVibe(geocoded.coords.latitude, geocoded.coords.longitude, undefined);
          return;
        }
      }
      
      // Default: treat as local search query at current location
      console.log('🔍 Treating as local search query:', parsed.query);
      if (coords) {
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

  return (
    <SafeAreaView style={styles.mainScreen} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" />
      
      {/* Vibe Filter - Fixed at top */}
      <View style={styles.vibeFilterContainer}>
        <Text style={styles.vibeLabel}>VIBE:</Text>
        <View style={styles.vibeSegmentedControl}>
          <TouchableOpacity
            style={[
              styles.vibeSegment,
              styles.vibeSegmentLeft,
              vibeMode === 'iconic' && styles.vibeSegmentActive
            ]}
            onPress={() => {
              updateVibeMode('iconic');
              if (coords) fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, 'iconic');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.vibeSegmentText,
              vibeMode === 'iconic' && styles.vibeSegmentTextActive
            ]}>Iconic</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.vibeSegment,
              vibeMode === 'mixed' && styles.vibeSegmentActive
            ]}
            onPress={() => {
              updateVibeMode('mixed');
              if (coords) fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, 'mixed');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.vibeSegmentText,
              vibeMode === 'mixed' && styles.vibeSegmentTextActive
            ]}>Mixed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.vibeSegment,
              styles.vibeSegmentRight,
              vibeMode === 'local' && styles.vibeSegmentActive
            ]}
            onPress={() => {
              updateVibeMode('local');
              if (coords) fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, 'local');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.vibeSegmentText,
              vibeMode === 'local' && styles.vibeSegmentTextActive
            ]}>Local</Text>
          </TouchableOpacity>
        </View>
        
        {/* Reset to my location button - show when viewing different location */}
        {userGpsCoords && coords && 
         (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 || 
          Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01) && (
          <TouchableOpacity
            onPress={() => {
              setCoords(userGpsCoords);
              setSearchQuery('');
              fetchVibe(userGpsCoords.latitude, userGpsCoords.longitude, undefined, vibeMode);
            }}
            style={styles.resetLocationButton}
            activeOpacity={0.7}
          >
            <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <Circle cx="12" cy="10" r="3" />
            </Svg>
            <Text style={styles.resetLocationText}>My Location</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Main Grid Container with KeyboardAvoidingView */}
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.gridContainer, { padding, paddingTop: 8, paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={true}
      >
        {isSmall ? (
          // Mobile Layout (2 cols, dynamic rows)
          <>
            {/* Top 2 cards */}
            <View style={[styles.row, { gap }]}>
              {places.slice(0, 2).map((place, i) => (
                <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                  <PlaceCard place={place} delay={i * 100} onSelect={setSelectedPlace} onHidePlace={handleHidePlace} coords={coords || undefined} />
                </View>
              ))}
            </View>
            
            {/* Center piece */}
            <View style={[styles.row, { gap }]}>
              <View style={{ width: availableWidth + gap, height: cardHeight * 0.7 }}>
                <CenterPiece 
                  city={city} 
                  coords={coords}
                  onRefresh={() => coords && fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, vibeMode)}
                  onMapPress={() => setShowFullMap(true)}
                  isSearchedLocation={userGpsCoords !== null && coords !== null && 
                    (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 || 
                     Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01)}
                />
              </View>
            </View>

            {/* All remaining cards in rows of 2 */}
            {Array.from({ length: Math.ceil((places.length - 2) / 2) }, (_, rowIndex) => (
              <View key={`row-${rowIndex}`} style={[styles.row, { gap }]}>
                {places.slice(2 + rowIndex * 2, 4 + rowIndex * 2).map((place, i) => (
                  <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                    <PlaceCard 
                      place={place} 
                      delay={0} 
                      onSelect={setSelectedPlace}
                      onHidePlace={handleHidePlace}
                      coords={coords || undefined}
                    />
                  </View>
                ))}
              </View>
            ))}
            
            {/* Load More - Pull Up or Tap */}
            {canLoadMore && (
              <View style={styles.loadMoreContainer}>
                {loadingMore ? (
                  <View style={styles.loadingIndicator}>
                    <AnimatedSpinner />
                    <Text style={styles.loadMoreText}>Finding more places...</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    style={styles.pullUpIndicator}
                    activeOpacity={0.7}
                  >
                    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                      <Path d="M12 19V5M5 12l7-7 7 7" />
                    </Svg>
                    <Text style={styles.pullUpText}>Pull up for more</Text>
                  </TouchableOpacity>
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
                          onRefresh={() => coords && fetchVibe(coords.latitude, coords.longitude, searchQuery || undefined, vibeMode)}
                          onMapPress={() => setShowFullMap(true)}
                          isSearchedLocation={userGpsCoords !== null && coords !== null && 
                            (Math.abs(userGpsCoords.latitude - coords.latitude) > 0.01 || 
                             Math.abs(userGpsCoords.longitude - coords.longitude) > 0.01)}
                        />
                      </View>
                    );
                  }
                  
                  // Map places around center
                  const placeIndex = index > 4 ? index - 1 : index;
                  const place = places[placeIndex];
                  
                  if (!place) return null;
                  
                  return (
                    <View key={place.id} style={{ width: cardWidth, height: cardHeight }}>
                      <PlaceCard 
                        place={place} 
                        delay={placeIndex * 100} 
                        onSelect={setSelectedPlace}
                        onHidePlace={handleHidePlace}
                        coords={coords || undefined}
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
          <View style={styles.searchBar}>
            <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
              <Circle cx="11" cy="11" r="8" />
              <Path d="m21 21-4.35-4.35" />
            </Svg>
            <TextInput
              style={styles.searchInput}
              placeholder="Search for sushi, coffee, museums..."
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Text style={styles.clearButton}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Full Screen Map */}
        {coords && (
          <FullScreenMap
            visible={showFullMap}
            coords={coords}
            places={places}
            onClose={() => setShowFullMap(false)}
          />
        )}

        {/* Popup Modal */}
        {selectedPlace && (
          <PlacePopup 
            place={selectedPlace} 
            onClose={() => setSelectedPlace(null)} 
          />
        )}
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: 'rgba(2, 6, 23, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(51, 65, 85, 0.5)',
  },
  searchBar: {
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
  resetLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    gap: 6,
    marginLeft: 'auto',
  },
  resetLocationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  vibeFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#020617',
    gap: 12,
  },
  vibeLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  vibeSegmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    overflow: 'hidden',
  },
  vibeSegment: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(71, 85, 105, 0.5)',
  },
  vibeSegmentLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  vibeSegmentRight: {
    borderRightWidth: 0,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  vibeSegmentActive: {
    backgroundColor: '#6366f1',
  },
  vibeSegmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  vibeSegmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  loadMoreContainer: {
    paddingVertical: 24,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pullUpIndicator: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  pullUpText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
});
