
import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Share, Alert } from 'react-native';
import { Place, PlaceCategory } from '../types';
import { getPlacePhotos } from '../services/places';
import { savePlace, hidePlace, getSavedPlaces, unsavePlace } from '../services/storage';
import { PlaceActionSheet } from './PlaceActionSheet';
import { LinearGradient } from 'expo-linear-gradient';

interface PlaceCardProps {
  place: Place;
  delay: number;
  onSelect: (place: Place) => void;
  onHidePlace?: (placeName: string) => void;
  coords?: { latitude: number; longitude: number };
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

export const PlaceCard: React.FC<PlaceCardProps> = ({ place, delay, onSelect, onHidePlace, coords }) => {
  const [imgError, setImgError] = useState(false);
  const [placeImages, setPlaceImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.95));

  // Fallback: AI generation (Last Resort)
  const aiFallbackUrl = `https://image.pollinations.ai/prompt/photorealistic%20photo%20of%20${encodeURIComponent(place.name)}%20${encodeURIComponent(place.category)}%20high%20quality%20lighting?width=400&height=400&nologo=true&seed=${place.id}`;

  // Priority: Google Places photos first, then AI fallback
  const bgImage = placeImages.length > 0 && !imgError ? placeImages[0] : aiFallbackUrl;

  // Check if place is already saved
  useEffect(() => {
    const checkSaved = async () => {
      const saved = await getSavedPlaces();
      setIsSaved(saved.some(p => p.name === place.name));
    };
    checkSaved();
  }, [place.name]);

  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 2;
    
    const fetchPhoto = async (attemptNumber: number = 0) => {
        if (!coords) {
          // No coords, use AI fallback immediately
          return;
        }
        
        try {
          // Timeout increases with each retry: 5s, 8s, 12s
          const timeoutDuration = 5000 + (attemptNumber * 3000);
          const timeoutPromise = new Promise<string[]>((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), timeoutDuration)
          );
          
          const photosPromise = getPlacePhotos(place.name, coords.latitude, coords.longitude);
          
          const photos = await Promise.race([photosPromise, timeoutPromise]);
          
          if (isMounted && photos.length > 0) {
            setPlaceImages(photos);
            setIsLoading(false);
            console.log(`✅ Loaded photo for ${place.name}`);
          } else if (isMounted && attemptNumber < maxRetries) {
            // No photos found, retry
            retryCount++;
            console.log(`🔄 Retrying photo fetch for ${place.name} (attempt ${retryCount + 1})`);
            setTimeout(() => fetchPhoto(attemptNumber + 1), 1000 * (attemptNumber + 1));
          } else {
            console.log(`⚠️ No photos found for ${place.name}, using AI fallback`);
            setIsLoading(false);
          }
        } catch (error) {
          if (isMounted && attemptNumber < maxRetries) {
            // Timeout or error, retry with exponential backoff
            retryCount++;
            console.log(`🔄 Retrying photo fetch for ${place.name} after error (attempt ${retryCount + 1})`);
            setTimeout(() => fetchPhoto(attemptNumber + 1), 1000 * (attemptNumber + 1));
          } else {
            console.log(`❌ Failed to fetch photos for ${place.name} after ${maxRetries + 1} attempts, using AI fallback`);
            setIsLoading(false);
            // Will use AI fallback automatically
          }
        }
    };
    fetchPhoto();

    // Entrance animation
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

    return () => { isMounted = false; };
  }, [place.name, coords?.latitude, coords?.longitude]);

  const handleSelect = () => {
     onSelect({ ...place, images: placeImages });
  };

  const handleSave = async () => {
    try {
      if (isSaved) {
        // Already saved, so unsave it
        await unsavePlace(place.name);
        setIsSaved(false);
        Alert.alert('Removed', `${place.name} has been removed from your list.`, [{ text: 'OK' }]);
      } else {
        // Not saved yet, so save it
        await savePlace({ ...place, images: placeImages });
        setIsSaved(true);
        Alert.alert('Saved!', `${place.name} has been saved to your list.`, [{ text: 'OK' }]);
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
        {/* Background Image */}
        <Image 
          source={{ uri: bgImage }}
          style={styles.image}
          onError={(e) => {
            console.log(`❌ Image load error for ${place.name}:`, e.nativeEvent.error);
            setImgError(true);
          }}
          onLoad={() => {
            if (!isLoading) {
              console.log(`✅ Image rendered for ${place.name}`);
            }
          }}
        />
        
        {/* Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.9)']}
          style={styles.gradient}
        />

        {/* Top Badges */}
        <View style={styles.topContent}>
          <View style={styles.badges}>
            <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(place.category) }]}>
              <Text style={styles.categoryText}>{place.category}</Text>
            </View>
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
