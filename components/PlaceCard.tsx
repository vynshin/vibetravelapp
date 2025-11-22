
import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Share, Alert } from 'react-native';
import { Place, PlaceCategory } from '../types';
import { getPlacePhotos } from '../services/places';
import { hidePlace } from '../services/storage';
import { getFavorites, savePlaceToFavorites, removePlaceFromFavorites } from '../services/collections';
import { PlaceActionSheet } from './PlaceActionSheet';
import { LinearGradient } from 'expo-linear-gradient';

interface PlaceCardProps {
  place: Place;
  delay: number;
  onSelect: (place: Place) => void;
  onHidePlace?: (placeName: string) => void;
  coords?: { latitude: number; longitude: number };
  index?: number; // Map marker number
}

const getCategoryColor = (cat: PlaceCategory) => {
  switch (cat) {
    case PlaceCategory.EAT: return '#f97316';
    case PlaceCategory.DRINK: return '#a855f7';
    case PlaceCategory.SIGHT: return '#3b82f6';
    case PlaceCategory.DO: return '#10b981';
    default: return '#64748b';
  }
};

export const PlaceCard: React.FC<PlaceCardProps> = ({ place, delay, onSelect, onHidePlace, coords, index }) => {
  const [imgError, setImgError] = useState(false);
  const [placeImages, setPlaceImages] = useState<string[]>(place.images || []);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isClosed, setIsClosed] = useState(false); // Track if business is closed
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.95));

  // Use real Google Photos only (lazy loaded)
  const bgImage = placeImages.length > 0 ? placeImages[0] : null;

  // Check if place is already favorited
  useEffect(() => {
    const checkSaved = async () => {
      const favorites = await getFavorites();
      setIsSaved(favorites.some(p => p.id === place.id));
    };
    checkSaved();
  }, [place.id]);

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: delay,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        delay: delay,
        useNativeDriver: true,
      })
    ]).start();
  }, [delay]);

  // DISABLED: Google Places API calls are too expensive ($300/day in testing)
  // Photos and business status checks are now handled by Foursquare/OSM only
  useEffect(() => {
    if (place.images && place.images.length > 0) {
      setPlaceImages(place.images);
    }
    // No longer making Google Places API calls per card
  }, [place.images]);

  const handleSelect = () => {
    onSelect({ ...place, images: placeImages });
  };

  const handleSave = async () => {
    try {
      if (isSaved) {
        await removePlaceFromFavorites(place.id);
        setIsSaved(false);
        Alert.alert('Removed', `${place.name} has been removed from favorites.`, [{ text: 'OK' }]);
      } else {
        await savePlaceToFavorites({ ...place, images: placeImages });
        setIsSaved(true);
        Alert.alert('Saved!', `${place.name} has been saved to favorites.`, [{ text: 'OK' }]);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save/unsave place');
    }
  };

  const handleHide = async () => {
    try {
      await hidePlace(place.name);
      Alert.alert('Hidden', `${place.name} won't appear in future recommendations.`, [{ text: 'OK' }]);
      onHidePlace?.(place.name);
    } catch (error) {
      Alert.alert('Error', 'Failed to hide place');
    }
  };

  const handleShare = async () => {
    try {
      const message = `Check out ${place.name}!\n\n${place.description}\n\n${place.reason}${
        place.address ? `\n\nAddress: ${place.address}` : ''
      }${
        place.mapLink ? `\n\nMap: ${place.mapLink}` : ''
      }`;

      await Share.share({
        message,
        title: place.name,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Don't render if business is closed
  if (isClosed) {
    return null;
  }

  return (
    <>
      <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleSelect}
          onLongPress={() => setShowActionSheet(true)}
          delayLongPress={500}
          style={styles.touchable}
        >
        {/* Background Image - Real Google Photos only */}
        {bgImage && (
          <Image
            source={{ uri: bgImage }}
            style={styles.image}
            onError={() => {
              if (!imgError) {
                console.log(`❌ Image failed to load for ${place.name}`);
                setImgError(true);
              }
            }}
            onLoad={() => {
              console.log(`✅ Image loaded for ${place.name}`);
            }}
          />
        )}
        {!bgImage && (
          <View style={[styles.image, { backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#64748b', fontSize: 48 }}>📍</Text>
          </View>
        )}

        {/* Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.9)']}
          style={styles.gradient}
        />

        {/* Top Badges */}
        <View style={styles.topContent}>
          {/* All badges in one row (left side) */}
          <View style={styles.badges}>
            <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(place.category) }]}>
              <Text style={styles.categoryText}>{place.category}</Text>
            </View>
            {index !== undefined && (
              <View style={styles.numberBadge}>
                <Text style={styles.numberBadgeText}>{index + 1}</Text>
              </View>
            )}
            <View style={styles.ratingBadge}>
              <Text style={styles.starIcon}>★</Text>
              <Text style={styles.ratingText}>{place.rating}</Text>
            </View>
          </View>
        </View>

        {/* Bottom Content */}
        <View style={styles.bottomContent}>
          <Text style={styles.name} numberOfLines={2}>
            {place.name}
          </Text>

          <Text style={styles.description} numberOfLines={2}>
            {place.description}
          </Text>
        </View>
        </TouchableOpacity>
      </Animated.View>

      <PlaceActionSheet
        visible={showActionSheet}
        placeName={place.name}
        isSaved={isSaved}
        onSave={handleSave}
        onRemove={handleHide}
        onShare={handleShare}
        onClose={() => setShowActionSheet(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  touchable: {
    width: '100%',
    height: '100%',
  },
  image: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#1e293b',
  },
  gradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  topContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starIcon: {
    fontSize: 10,
    color: '#fbbf24',
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fbbf24',
  },
  numberBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  numberBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
});
