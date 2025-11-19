
import React, { useState, useEffect } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, Dimensions, Text } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Place, Coordinates, PlaceCategory } from '../types';
import { Svg, Path, Circle } from 'react-native-svg';
import { getPlaceLocation } from '../services/places';
import { PlacePopup } from './PlacePopup';

interface FullScreenMapProps {
  visible: boolean;
  coords: Coordinates;
  places: Place[];
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

const getCategoryColor = (category: PlaceCategory) => {
  switch (category) {
    case PlaceCategory.EAT: return '#f97316';
    case PlaceCategory.DRINK: return '#a855f7';
    case PlaceCategory.SIGHT: return '#3b82f6';
    case PlaceCategory.DO: return '#10b981';
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
    case PlaceCategory.SIGHT:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </Svg>
      );
    case PlaceCategory.DO:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </Svg>
      );
    default:
      return (
        <Svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <Circle cx="12" cy="12" r="8" />
        </Svg>
      );
  }
};

export const FullScreenMap: React.FC<FullScreenMapProps> = ({ 
  visible, 
  coords, 
  places, 
  onClose
}) => {
  const [placeLocations, setPlaceLocations] = useState<Record<string, { lat: number; lng: number }>>({});
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <MapView
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
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <Path d="M18 6 6 18"/>
            <Path d="m6 6 12 12"/>
          </Svg>
        </TouchableOpacity>

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
});
