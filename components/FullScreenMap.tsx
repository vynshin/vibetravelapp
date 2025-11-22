
import React, { useState, useEffect, useRef } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, Dimensions, Text, TextInput, Keyboard, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Place, Coordinates, PlaceCategory } from '../types';
import { Svg, Path, Circle } from 'react-native-svg';
import { getPlaceLocation } from '../services/places';
import { PlacePopup } from './PlacePopup';
import { parseLocationFromQuery, geocodeLocation } from '../services/geocoding';

interface FullScreenMapProps {
  visible: boolean;
  coords: Coordinates;
  places: Place[];
  onClose: () => void;
  onSearch: (coords: Coordinates, query?: string) => void;
  userGpsCoords: Coordinates | null;
  city: string;
}

const { width, height } = Dimensions.get('window');

const getCategoryColor = (category: PlaceCategory) => {
  switch (category) {
    case PlaceCategory.EAT: return '#f97316';    // Orange
    case PlaceCategory.DRINK: return '#a855f7';  // Purple
    case PlaceCategory.EXPLORE: return '#14b8a6'; // Teal (merged DO + SIGHT)
    default: return '#64748b';
  }
};

const getCategoryIcon = (category: PlaceCategory) => {
  switch (category) {
    case PlaceCategory.EAT:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
        </Svg>
      );
    case PlaceCategory.DRINK:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Path d="M3 2l2.01 18.23C5.13 21.23 5.97 22 7 22h10c1.03 0 1.87-.77 1.99-1.77L21 2H3zm9 17c-1.66 0-3-1.34-3-3 0-2 3-5.4 3-5.4s3 3.4 3 5.4c0 1.66-1.34 3-3 3z"/>
        </Svg>
      );
    case PlaceCategory.EXPLORE:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </Svg>
      );
    default:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Circle cx={12} cy={12} r={8} />
        </Svg>
      );
  }
};

export const FullScreenMap: React.FC<FullScreenMapProps> = ({
  visible,
  coords,
  places,
  onClose,
  onSearch,
  userGpsCoords,
  city
}) => {
  const [placeLocations, setPlaceLocations] = useState<Record<string, { lat: number; lng: number }>>({});
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [showRedoSearch, setShowRedoSearch] = useState<boolean>(false);
  const mapRef = useRef<MapView>(null);

  // Search suggestion templates
  const getMajorCity = () => {
    const lowerCity = city.toLowerCase();
    const majorCities = ['new york', 'nyc', 'los angeles', 'la', 'chicago', 'london', 'tokyo', 'paris', 'boston'];
    for (const major of majorCities) {
      if (lowerCity.includes(major)) return major === 'nyc' ? 'New York' : major.charAt(0).toUpperCase() + major.slice(1);
    }
    return city.split(',')[0] || 'your city';
  };

  const majorCity = getMajorCity();
  const searchSuggestions = [
    majorCity.toLowerCase(),
    'pizza in nyc',
    'coffee shops nearby',
    'restaurants near me',
    `iconic places in ${majorCity}`,
  ];

  // Fetch real locations for all places
  useEffect(() => {
    if (!visible) return;

    const fetchLocations = async () => {
      const locations: Record<string, { lat: number; lng: number }> = {};

      for (const place of places) {
        const location = await getPlaceLocation(place.name, coords.latitude, coords.longitude);
        if (location) {
          locations[place.id] = location;
        }
      }

      setPlaceLocations(locations);
    };

    fetchLocations();
  }, [visible, places, coords]);

  // Handle search submission
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    Keyboard.dismiss();
    setShowSuggestions(false);

    const parsed = parseLocationFromQuery(searchQuery);

    if (parsed.location) {
      // User specified a location with "in/near/around" - geocode it
      const geocoded = await geocodeLocation(parsed.location, userGpsCoords || undefined);
      if (geocoded) {
        // Animate map to new location
        mapRef.current?.animateToRegion({
          latitude: geocoded.coords.latitude,
          longitude: geocoded.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);

        // Trigger search
        onSearch(geocoded.coords, parsed.query);
        setShowRedoSearch(false);
        return;
      }
    }

    // Try geocoding as potential location
    const geocoded = await geocodeLocation(parsed.query, userGpsCoords || undefined);
    if (geocoded) {
      // Animate map to location
      mapRef.current?.animateToRegion({
        latitude: geocoded.coords.latitude,
        longitude: geocoded.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);

      onSearch(geocoded.coords, 'iconic places');
      setShowRedoSearch(false);
      return;
    }

    // Not a location - search current map center
    if (currentRegion) {
      onSearch({
        latitude: currentRegion.latitude,
        longitude: currentRegion.longitude,
      }, parsed.query);
    } else {
      onSearch(coords, parsed.query);
    }
    setShowRedoSearch(false);
  };

  // Handle suggestion click
  const handleSuggestionClick = async (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    Keyboard.dismiss();

    const parsed = parseLocationFromQuery(suggestion);

    if (parsed.location) {
      const geocoded = await geocodeLocation(parsed.location, userGpsCoords || undefined);
      if (geocoded) {
        mapRef.current?.animateToRegion({
          latitude: geocoded.coords.latitude,
          longitude: geocoded.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 1000);

        onSearch(geocoded.coords, parsed.query);
        setShowRedoSearch(false);
        return;
      }
    }

    // Try geocoding as potential location
    const geocoded = await geocodeLocation(parsed.query, userGpsCoords || undefined);
    if (geocoded) {
      mapRef.current?.animateToRegion({
        latitude: geocoded.coords.latitude,
        longitude: geocoded.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);

      onSearch(geocoded.coords, 'iconic places');
      setShowRedoSearch(false);
      return;
    }

    // Check if "near me" - use GPS location
    const isNearMeQuery = suggestion.toLowerCase().includes('near me') ||
                          suggestion.toLowerCase().includes('nearby');

    if (isNearMeQuery && userGpsCoords) {
      mapRef.current?.animateToRegion({
        latitude: userGpsCoords.latitude,
        longitude: userGpsCoords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);

      onSearch(userGpsCoords, parsed.query);
      setShowRedoSearch(false);
      return;
    }

    // Not a location - search current map center
    if (currentRegion) {
      onSearch({
        latitude: currentRegion.latitude,
        longitude: currentRegion.longitude,
      }, parsed.query);
    } else {
      onSearch(coords, parsed.query);
    }
    setShowRedoSearch(false);
  };

  // Handle map region change (pan/zoom)
  const handleRegionChangeComplete = (region: Region) => {
    setCurrentRegion(region);

    // Check if user has moved map from original coords (very sensitive)
    const latDiff = Math.abs(region.latitude - coords.latitude);
    const lonDiff = Math.abs(region.longitude - coords.longitude);
    const threshold = 0.001; // ~100m movement - very sensitive

    if (latDiff > threshold || lonDiff > threshold) {
      setShowRedoSearch(true);
    }
  };

  // Handle redo search in current area
  const handleRedoSearch = () => {
    if (currentRegion) {
      onSearch({
        latitude: currentRegion.latitude,
        longitude: currentRegion.longitude,
      }, searchQuery || undefined);
      setShowRedoSearch(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
          showsMyLocationButton={true}
          onRegionChangeComplete={handleRegionChangeComplete}
        >
          {/* User location marker */}
          <Marker
            coordinate={{
              latitude: coords.latitude,
              longitude: coords.longitude,
            }}
            title="You are here"
            pinColor="#6366f1"
          />
          
          {/* Place markers */}
          {places.map((place) => {
            const location = placeLocations[place.id];
            
            // Skip if location hasn't loaded yet
            if (!location) return null;
            
            return (
              <Marker
                key={place.id}
                coordinate={{
                  latitude: location.lat,
                  longitude: location.lng,
                }}
                onPress={() => {
                  setSelectedPlace(place);
                }}
              >
                <View style={styles.customMarkerContainer}>
                  <View style={styles.markerContent}>
                    <View style={[styles.markerIcon, { backgroundColor: getCategoryColor(place.category) }]}>
                      {getCategoryIcon(place.category)}
                    </View>
                    <View style={styles.markerLabel}>
                      <Text style={[styles.markerText, { color: getCategoryColor(place.category) }]}>{place.name}</Text>
                    </View>
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>
        
        {/* Close Button */}
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeButton}
        >
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
            <Path d="M18 6 6 18"/>
            <Path d="m6 6 12 12"/>
          </Svg>
        </TouchableOpacity>

        {/* Floating Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBarWrapper}>
            <View style={styles.searchBar}>
              <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}>
                <Circle cx={11} cy={11} r={8} />
                <Path d="m21 21-4.35-4.35" />
              </Svg>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a place or location..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                onFocus={() => setShowSuggestions(true)}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setShowSuggestions(false);
                  }}
                  style={styles.clearButton}
                >
                  <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}>
                    <Path d="M18 6 6 18"/>
                    <Path d="m6 6 12 12"/>
                  </Svg>
                </TouchableOpacity>
              )}
            </View>

            {/* Search Suggestions Dropdown */}
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
        </View>

        {/* Redo Search Button */}
        {showRedoSearch && (
          <TouchableOpacity
            onPress={handleRedoSearch}
            style={styles.redoSearchButton}
            activeOpacity={0.8}
          >
            <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} style={{ marginRight: 8 }}>
              <Path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </Svg>
            <Text style={styles.redoSearchText}>Redo search in this area</Text>
          </TouchableOpacity>
        )}

        {/* Place Drawer */}
        {selectedPlace && (
          <PlacePopup
            place={selectedPlace}
            onClose={() => setSelectedPlace(null)}
            userCoords={{ latitude: coords.latitude, longitude: coords.longitude }}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  customMarkerContainer: {
    alignItems: 'center',
  },
  markerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  markerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  markerLabel: {
    paddingLeft: 6,
    maxWidth: 120,
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginLeft: -3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  markerText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchContainer: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 80,
    zIndex: 10,
  },
  searchBarWrapper: {
    position: 'relative',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#f1f5f9',
    fontWeight: '500',
  },
  clearButton: {
    padding: 4,
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    maxHeight: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  suggestionsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.3)',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  suggestionsHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.2)',
  },
  suggestionItemLast: {
    borderBottomWidth: 0,
  },
  suggestionItemText: {
    fontSize: 15,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  redoSearchButton: {
    position: 'absolute',
    top: 140,
    left: '50%',
    transform: [{ translateX: -120 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  redoSearchText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
