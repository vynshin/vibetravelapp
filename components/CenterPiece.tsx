
import React, { useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Coordinates, Place, PlaceCategory } from '../types';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';

interface CenterPieceProps {
  city: string;
  coords: Coordinates | null;
  onMapPress?: () => void;
  isSearchedLocation?: boolean; // True when viewing a different location from GPS
  places?: Place[]; // All found places
  userGpsCoords?: Coordinates | null; // User's actual GPS location
}

// Calculate distance between two coordinates in miles
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Extract coordinates from mapLink (format: https://www.google.com/maps/search/?api=1&query=LAT,LNG...)
const extractCoordsFromMapLink = (mapLink?: string): Coordinates | null => {
  if (!mapLink) return null;
  const match = mapLink.match(/query=([-\d.]+),([-\d.]+)/);
  if (match) {
    return {
      latitude: parseFloat(match[1]),
      longitude: parseFloat(match[2]),
    };
  }
  return null;
};

// Get marker color based on place category
const getCategoryColor = (category: PlaceCategory): string => {
  switch (category) {
    case PlaceCategory.EAT:
      return '#f97316'; // Orange
    case PlaceCategory.DRINK:
      return '#a855f7'; // Purple
    case PlaceCategory.SIGHT:
      return '#3b82f6'; // Blue
    case PlaceCategory.DO:
      return '#10b981'; // Green
    default:
      return '#ef4444'; // Red (fallback)
  }
};

export const CenterPiece: React.FC<CenterPieceProps> = ({
  city,
  coords,
  onMapPress,
  isSearchedLocation = false,
  places = [],
  userGpsCoords
}) => {
  const mapRef = useRef<MapView>(null);

  // Extract place coordinates from mapLinks
  const placeCoords = useMemo(() => {
    return places
      .map(place => extractCoordsFromMapLink(place.mapLink))
      .filter((c): c is Coordinates => c !== null);
  }, [places]);

  // Determine if places are within 10 miles of user's GPS location
  const placesWithinRange = useMemo(() => {
    if (!userGpsCoords || placeCoords.length === 0) return false;

    return placeCoords.every(placeCoord => {
      const distance = calculateDistance(
        userGpsCoords.latitude,
        userGpsCoords.longitude,
        placeCoord.latitude,
        placeCoord.longitude
      );
      return distance <= 10;
    });
  }, [userGpsCoords, placeCoords]);

  // Calculate map region to fit all markers
  const mapRegion = useMemo(() => {
    if (!coords) return null;

    // If places are within 10 miles and we have user GPS, show both user and places
    if (placesWithinRange && userGpsCoords && placeCoords.length > 0) {
      const allCoords = [userGpsCoords, ...placeCoords];
      const lats = allCoords.map(c => c.latitude);
      const lngs = allCoords.map(c => c.longitude);

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const latDelta = (maxLat - minLat) * 1.5; // Add 50% padding
      const lngDelta = (maxLng - minLng) * 1.5;

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, 0.02),
        longitudeDelta: Math.max(lngDelta, 0.02),
      };
    }

    // If places are outside 10 miles, show only the places
    if (!placesWithinRange && placeCoords.length > 0) {
      const lats = placeCoords.map(c => c.latitude);
      const lngs = placeCoords.map(c => c.longitude);

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const latDelta = (maxLat - minLat) * 1.5;
      const lngDelta = (maxLng - minLng) * 1.5;

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, 0.02),
        longitudeDelta: Math.max(lngDelta, 0.02),
      };
    }

    // Default: show search location
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }, [coords, placesWithinRange, userGpsCoords, placeCoords]);

  useEffect(() => {
    if (mapRegion && mapRef.current) {
      mapRef.current.animateToRegion(mapRegion, 500);
    }
  }, [mapRegion]);

  // Create a key based on coordinates to force remount when location changes significantly
  const mapKey = coords ? `${Math.floor(coords.latitude * 100)}-${Math.floor(coords.longitude * 100)}` : 'no-coords';

  return (
    <TouchableOpacity 
      style={styles.container} 
      activeOpacity={0.9}
      onPress={onMapPress}
    >
      {/* Map Layer */}
      {coords && mapRegion ? (
        <MapView
          key={mapKey}
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={mapRegion}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents="none"
        >
          {/* Show user GPS marker if places are within 10 miles */}
          {placesWithinRange && userGpsCoords && (
            <Marker
              coordinate={userGpsCoords}
              pinColor="#3b82f6"
              title="You are here"
            />
          )}

          {/* Show search location marker (if different from GPS) */}
          {coords && (!placesWithinRange || !userGpsCoords ||
            (Math.abs(coords.latitude - userGpsCoords.latitude) > 0.01 ||
             Math.abs(coords.longitude - userGpsCoords.longitude) > 0.01)) && (
            <Marker
              coordinate={coords}
              pinColor={isSearchedLocation ? "#f59e0b" : "#6366f1"}
              title="Search area"
            />
          )}

          {/* Show place markers with numbered pins */}
          {places
            .filter(place => extractCoordsFromMapLink(place.mapLink))
            .map((place, index) => {
              const coord = extractCoordsFromMapLink(place.mapLink)!;
              const categoryColor = getCategoryColor(place.category);
              return (
                <Marker
                  key={`place-${place.id}`}
                  coordinate={coord}
                  anchor={{ x: 0.5, y: 1 }}
                  centerOffset={{ x: 0, y: -15 }}
                >
                  <View style={[styles.numberMarker, { backgroundColor: categoryColor }]}>
                    <Text style={styles.numberText}>{index + 1}</Text>
                  </View>
                </Marker>
              );
            })}
        </MapView>
      ) : (
        <View style={styles.loadingContainer}>
          <View style={styles.spinner} />
        </View>
      )}

      {/* Lighter Overlay Gradient */}
      <LinearGradient
        colors={['rgba(15, 23, 42, 0.3)', 'transparent', 'rgba(15, 23, 42, 0.5)']}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* Legend - Upper Right (shows "You" marker when within range) */}
      {placesWithinRange && userGpsCoords && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>You</Text>
          </View>
        </View>
      )}

      {/* City Label - Bottom Right */}
      <View style={styles.cityLabel}>
        <Text style={styles.cityName}>{city}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  spinner: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderTopColor: 'transparent',
    borderRadius: 16,
  },
  gradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cityLabel: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cityName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  legend: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  numberMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  numberText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  refreshText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
});
