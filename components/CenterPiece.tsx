
import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Coordinates } from '../types';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';

interface CenterPieceProps {
  city: string;
  coords: Coordinates | null;
  onRefresh: () => void;
  onMapPress?: () => void;
  isSearchedLocation?: boolean; // True when viewing a different location from GPS
}

export const CenterPiece: React.FC<CenterPieceProps> = ({ city, coords, onRefresh, onMapPress, isSearchedLocation = false }) => {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    }
  }, [coords?.latitude, coords?.longitude]);

  // Create a key based on coordinates to force remount when location changes significantly
  const mapKey = coords ? `${Math.floor(coords.latitude * 100)}-${Math.floor(coords.longitude * 100)}` : 'no-coords';

  return (
    <TouchableOpacity 
      style={styles.container} 
      activeOpacity={0.9}
      onPress={onMapPress}
    >
      {/* Map Layer */}
      {coords ? (
        <MapView
          key={mapKey}
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          pointerEvents="none"
        >
          <Marker
            coordinate={{
              latitude: coords.latitude,
              longitude: coords.longitude,
            }}
            pinColor={isSearchedLocation ? "#f59e0b" : "#6366f1"}
          />
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

      {/* Top Label */}
      <View style={styles.topLabel}>
        <View style={styles.labelContainer}>
          <View style={[styles.pulsingDot, isSearchedLocation && styles.searchDot]} />
          <Text style={styles.labelText}>
            {isSearchedLocation ? 'SEARCHED AREA' : 'YOU ARE HERE'}
          </Text>
        </View>
      </View>

      {/* Bottom Info */}
      <View style={styles.bottomInfo}>
        <Text style={styles.cityName}>{city}</Text>
        
        <TouchableOpacity 
          onPress={onRefresh}
          style={styles.refreshButton}
          activeOpacity={0.8}
        >
          <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <Path d="M21.5 2v6h-6"/>
            <Path d="M2.5 22v-6h6"/>
            <Path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8"/>
            <Path d="M22 12.5a10 10 0 0 1-18.8 4.3L2.5 16"/>
          </Svg>
          <Text style={styles.refreshText}>Reshuffle Vibe</Text>
        </TouchableOpacity>
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
  topLabel: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  searchDot: {
    backgroundColor: '#f59e0b',
  },
  labelText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.9)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 4,
  },
  cityName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
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
