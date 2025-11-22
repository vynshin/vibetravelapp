
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Linking
} from 'react-native';
import { Place, PlaceCategory } from '../types';
import { fetchWikiImage } from '../services/wikipedia';
import { getPlacePhotos } from '../services/places';
import { generateTipsForPlace } from '../services/gemini';
import { trackPlaceView } from '../services/usage';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path, Circle, Line, Polyline } from 'react-native-svg';

interface PlacePopupProps {
  place: Place;
  onClose: () => void;
  userCoords?: { latitude: number; longitude: number };
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

const { width, height } = Dimensions.get('window');
const SHEET_HEIGHT_INITIAL = height * 0.75; // Initial height
const SHEET_HEIGHT_EXPANDED = height * 0.90; // Expanded height

export const PlacePopup: React.FC<PlacePopupProps> = ({ place, onClose, userCoords }) => {
  const [currentImgIdx, setCurrentImgIdx] = useState(0);
  const [fetchedImages, setFetchedImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const translateY = useRef(new Animated.Value(0)).current;
  const currentPosition = useRef(SHEET_HEIGHT_EXPANDED - SHEET_HEIGHT_INITIAL);
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const fullScreenTranslateY = useRef(new Animated.Value(0)).current;

  // Lazy-load tips state
  const [tips, setTips] = useState<string[]>(place.knowBeforeYouGo || []);
  const [loadingTips, setLoadingTips] = useState(false);
  
  const fullScreenPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => zoomedIndex === null,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Don't respond if zoomed, only respond to strong vertical movement
        if (zoomedIndex !== null) return false;
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5 && Math.abs(gestureState.dy) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          fullScreenTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.timing(fullScreenTranslateY, {
            toValue: height,
            duration: 200,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished) {
              setFullScreenImage(null);
              setTimeout(() => {
                fullScreenTranslateY.setValue(0);
                setZoomedIndex(null);
              }, 50);
            }
          });
        } else {
          Animated.spring(fullScreenTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Pan responder for top area (handle + images)
  const topPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Respond to vertical movement more aggressively
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture vertical gestures before ScrollView
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        translateY.setOffset(currentPosition.current);
        translateY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = gestureState.dy;
        // Clamp between 0 (fully expanded) and initial offset
        const minY = 0;
        const maxY = SHEET_HEIGHT_EXPANDED - SHEET_HEIGHT_INITIAL;
        const clampedY = Math.max(minY - currentPosition.current, Math.min(maxY - currentPosition.current, newValue));
        translateY.setValue(clampedY);
      },
      onPanResponderRelease: (_, gestureState) => {
        translateY.flattenOffset();
        
        const finalY = currentPosition.current + gestureState.dy;
        const swipedUp = gestureState.dy < -50 || gestureState.vy < -0.5;
        const swipedDownFast = gestureState.vy > 0.8;
        const swipedDownFar = gestureState.dy > 150;
        const swipedDownSmall = gestureState.dy > 30 || gestureState.vy > 0.3;
        
        if (isExpanded && swipedDownSmall && !swipedDownFar && !swipedDownFast) {
          // Small swipe down when expanded -> collapse to 75%
          setIsExpanded(false);
          currentPosition.current = SHEET_HEIGHT_EXPANDED - SHEET_HEIGHT_INITIAL;
          Animated.spring(translateY, {
            toValue: currentPosition.current,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        } else if ((swipedDownFar || swipedDownFast) && !isExpanded) {
          // Big swipe down when at 75% -> close drawer
          Animated.timing(translateY, {
            toValue: height,
            duration: 250,
            useNativeDriver: true,
          }).start(() => onClose());
        } else if (swipedUp && !isExpanded) {
          // Swipe up when at 75% -> expand to 90%
          setIsExpanded(true);
          currentPosition.current = 0;
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        } else {
          // Snap back to current position
          Animated.spring(translateY, {
            toValue: currentPosition.current,
            useNativeDriver: true,
            tension: 50,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;


  // Animate in
  useEffect(() => {
    const initialOffset = SHEET_HEIGHT_EXPANDED - SHEET_HEIGHT_INITIAL;
    currentPosition.current = initialOffset;
    translateY.setValue(height);
    Animated.spring(translateY, {
      toValue: initialOffset,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, []);

  // Track place view
  useEffect(() => {
    trackPlaceView();
  }, []);

  // Scroll to selected image when full screen opens
  const fullScreenScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (fullScreenImage && fullScreenScrollRef.current) {
      setTimeout(() => {
        fullScreenScrollRef.current?.scrollTo({ x: fullScreenIndex * width, y: 0, animated: false });
      }, 100);
    }
  }, [fullScreenImage]);


  // Fetch real photos when popup opens
  useEffect(() => {
    const fetchPhotos = async () => {
        setLoadingImages(true);
        
        let photos: string[] = [];
        
        // Try Google Places photos if we have coordinates
        if (userCoords) {
          const placesPhotos = await getPlacePhotos(place.name, userCoords.latitude, userCoords.longitude);
          if (placesPhotos.length > 0) {
            // Take only the first 8 unique photos to avoid duplicates
            const uniquePhotos = Array.from(new Set(placesPhotos)).slice(0, 8);
            photos = [...uniquePhotos];
          }
        }
        
        // Try Wikipedia ONLY for landmarks/sights (restaurants rarely have wiki pages and names can be ambiguous)
        if (place.category === PlaceCategory.SIGHT || place.category === PlaceCategory.DO) {
          const wikiImage = await fetchWikiImage(place.name);
          if (wikiImage && !photos.includes(wikiImage)) {
             photos.unshift(wikiImage);
          }
        }

        // Merge with images passed from card (avoid duplicates)
        if (place.images && place.images.length > 0) {
           const existing = new Set(photos);
           place.images.forEach(img => {
             if (!existing.has(img)) photos.push(img);
           });
        }
        
        // Limit to max 8 images total
        photos = photos.slice(0, 8);

        setFetchedImages(photos);
        setLoadingImages(false);
    };
    fetchPhotos();
  }, [place.name, place.images, userCoords]);

  // Lazy-load tips when component mounts (if not already present)
  useEffect(() => {
    const loadTips = async () => {
      // Only load if tips are not already present
      if (!place.knowBeforeYouGo || place.knowBeforeYouGo.length === 0) {
        setLoadingTips(true);
        try {
          const generatedTips = await generateTipsForPlace({
            name: place.name,
            category: place.category,
            address: place.address
          });
          setTips(generatedTips);
        } catch (error) {
          console.error('Failed to load tips:', error);
          setTips([]);
        } finally {
          setLoadingTips(false);
        }
      }
    };
    loadTips();
  }, [place.name]);

  // Combine fetched images with fallbacks (7 images)
  const fallbackImages = [
    `https://image.pollinations.ai/prompt/photorealistic%20interior%20view%20of%20${encodeURIComponent(place.name)}%20${encodeURIComponent(place.category)}?width=800&height=600&nologo=true&seed=${place.id}1`,
    `https://image.pollinations.ai/prompt/photorealistic%20street%20view%20of%20${encodeURIComponent(place.name)}%20landmark?width=800&height=600&nologo=true&seed=${place.id}2`,
    `https://image.pollinations.ai/prompt/detailed%20food%20or%20view%20at%20${encodeURIComponent(place.name)}?width=800&height=600&nologo=true&seed=${place.id}3`,
    `https://image.pollinations.ai/prompt/atmospheric%20photo%20of%20${encodeURIComponent(place.name)}%20${encodeURIComponent(place.category)}?width=800&height=600&nologo=true&seed=${place.id}4`,
    `https://image.pollinations.ai/prompt/exterior%20architecture%20of%20${encodeURIComponent(place.name)}?width=800&height=600&nologo=true&seed=${place.id}5`,
    `https://image.pollinations.ai/prompt=menu%20or%20details%20at%20${encodeURIComponent(place.name)}?width=800&height=600&nologo=true&seed=${place.id}6`,
    `https://image.pollinations.ai/prompt/ambiance%20and%20atmosphere%20at%20${encodeURIComponent(place.name)}?width=800&height=600&nologo=true&seed=${place.id}7`
  ];

  const displayImages = fetchedImages.length > 0 
     ? [...fetchedImages.filter(img => !failedImages.has(img))]
     : fallbackImages;

  const safeImages = displayImages.length > 0 ? displayImages : fallbackImages;

  const handleImageError = (url: string) => {
    setFailedImages(prev => new Set(prev).add(url));
    if (safeImages[currentImgIdx] === url) {
        setCurrentImgIdx(0);
    }
  };

  const handleMapClick = () => {
    const url = place.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`;
    Linking.openURL(url);
  };

  return (
    <Modal
      visible={true}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <Animated.View 
          style={[
            styles.bottomSheet,
            { transform: [{ translateY }] }
          ]}
        >
          {/* Drag Handle */}
          <View style={styles.handleContainer} {...topPanResponder.panHandlers}>
            <View style={styles.handle} />
          </View>
          
          {/* Swipeable Image Carousel */}
          <View style={styles.imageContainer} {...topPanResponder.panHandlers}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                setCurrentImgIdx(index);
              }}
              scrollEventThrottle={16}
              directionalLockEnabled={true}
            >
              {loadingImages && fetchedImages.length === 0 ? (
                <View style={[styles.imageSlide, { width }]}>
                  <View style={styles.loadingContainer}>
                    <View style={styles.spinner} />
                  </View>
                </View>
              ) : (
                safeImages.map((imgUri, idx) => (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.imageSlide, { width }]}
                    activeOpacity={1}
                    onPress={() => {
                      setFullScreenImage(imgUri);
                      setFullScreenIndex(idx);
                    }}
                  >
                    <Image 
                      source={{ uri: imgUri }}
                      style={styles.image}
                      onError={() => handleImageError(imgUri)}
                    />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {/* Dots Indicator */}
            <View style={styles.dotsContainer}>
              {safeImages.map((_, idx) => (
                <View 
                  key={idx}
                  style={[
                    styles.dot,
                    { backgroundColor: idx === currentImgIdx ? '#fff' : 'rgba(255, 255, 255, 0.3)' }
                  ]}
                />
              ))}
            </View>

            {/* Close Button */}
            <TouchableOpacity 
              onPress={onClose}
              style={styles.closeButton}
            >
              <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <Path d="M18 6 6 18"/>
                <Path d="m6 6 12 12"/>
              </Svg>
            </TouchableOpacity>
          </View>

          {/* Content - Scrollable when expanded */}
          {isExpanded ? (
            <ScrollView 
              ref={scrollViewRef}
              style={styles.content} 
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
            >
            <View style={styles.header}>
              <View>
                <View style={styles.badges}>
                  <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(place.category) }]}>
                    <Text style={styles.categoryText}>{place.category}</Text>
                  </View>
                  <View style={styles.ratingBadge}>
                    <Text style={styles.starIcon}>★</Text>
                    <Text style={styles.ratingText}>{place.rating}</Text>
                  </View>
                </View>
                <Text style={styles.name}>{place.name}</Text>
                {place.address && (
                  <Text style={styles.address}>{place.address}</Text>
                )}
                {place.phone && (
                  <Text style={styles.phone}>{place.phone}</Text>
                )}
              </View>
            </View>

            {/* Vibe & Reason */}
            <View style={styles.vibeSection}>
              <Text style={styles.sectionTitle}>THE VIBE</Text>
              <Text style={styles.vibeText}>"{place.description}"</Text>
              
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>WHY GO?</Text>
              <Text style={styles.reasonText}>{place.reason}</Text>

              {place.signature && (
                <>
                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>SIGNATURE</Text>
                  <Text style={styles.signatureText}>{place.signature}</Text>
                </>
              )}
            </View>

            {/* Know Before You Go Tips */}
            {loadingTips && (
              <View style={styles.tipsSection}>
                <View style={styles.tipsTitleRow}>
                  <Text style={styles.tipsIcon}>💡</Text>
                  <Text style={styles.tipsTitle}>KNOW BEFORE YOU GO</Text>
                </View>
                <View style={styles.loadingTipsContainer}>
                  <View style={styles.tipsSpinner} />
                  <Text style={styles.loadingTipsText}>Loading tips...</Text>
                </View>
              </View>
            )}
            {!loadingTips && tips.length > 0 && (
              <View style={styles.tipsSection}>
                <View style={styles.tipsTitleRow}>
                  <Text style={styles.tipsIcon}>💡</Text>
                  <Text style={styles.tipsTitle}>KNOW BEFORE YOU GO</Text>
                </View>
                <View style={styles.tipsContainer}>
                  {tips.map((tip, idx) => (
                    <View key={idx} style={styles.tipItem}>
                      <Text style={styles.tipBullet}>•</Text>
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Reviews */}
            {place.reviews && place.reviews.length > 0 && (
              <View style={styles.reviewsSection}>
                <Text style={styles.reviewsTitle}>WHAT PEOPLE ARE SAYING</Text>
                
                {/* Local Guide Reviews */}
                {place.reviews.filter(r => r.type === 'user').length > 0 && (
                  <View style={styles.reviewGroup}>
                    <Text style={[styles.reviewGroupTitle, { color: '#6ee7b7' }]}>LOCAL GUIDE</Text>
                    {place.reviews.filter(r => r.type === 'user').map((review, idx) => (
                      <View key={idx} style={[styles.reviewCard, { backgroundColor: 'rgba(30, 41, 59, 0.3)', borderColor: 'rgba(51, 65, 85, 0.3)' }]}>
                        <Text style={styles.reviewText}>"{review.text}"</Text>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Travel Magazine Reviews */}
                {place.reviews.filter(r => r.type === 'critic').length > 0 && (
                  <View style={styles.reviewGroup}>
                    <Text style={[styles.reviewGroupTitle, { color: '#d8b4fe' }]}>TRAVEL MAGAZINE</Text>
                    {place.reviews.filter(r => r.type === 'critic').map((review, idx) => (
                      <View key={idx} style={[styles.reviewCard, { backgroundColor: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.2)' }]}>
                        <Text style={styles.reviewText}>"{review.text}"</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Action Button */}
            <TouchableOpacity
              onPress={handleMapClick}
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonText}>Get Directions</Text>
              <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth={2}>
                <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <Polyline points="15 3 21 3 21 9" />
                <Line x1="10" y1="14" x2="21" y2="3" />
              </Svg>
            </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.content} {...topPanResponder.panHandlers}>
              <View style={styles.header}>
                <View>
                  <View style={styles.badges}>
                    <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(place.category) }]}>
                      <Text style={styles.categoryText}>{place.category}</Text>
                    </View>
                    <View style={styles.ratingBadge}>
                      <Text style={styles.starIcon}>★</Text>
                      <Text style={styles.ratingText}>{place.rating}</Text>
                    </View>
                  </View>
                  <Text style={styles.name}>{place.name}</Text>
                  {place.address && (
                    <Text style={styles.address}>{place.address}</Text>
                  )}
                  {place.phone && (
                    <Text style={styles.phone}>{place.phone}</Text>
                  )}
                </View>
              </View>

              {/* Vibe & Reason */}
              <View style={styles.vibeSection}>
                <Text style={styles.sectionTitle}>THE VIBE</Text>
                <Text style={styles.vibeText}>"{place.description}"</Text>
                
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>WHY GO?</Text>
                <Text style={styles.reasonText}>{place.reason}</Text>

                {place.signature && (
                  <>
                    <Text style={[styles.sectionTitle, { marginTop: 16 }]}>SIGNATURE</Text>
                    <Text style={styles.signatureText}>{place.signature}</Text>
                  </>
                )}
              </View>

              <Text style={styles.swipeHint}>Swipe up to see more →</Text>
            </View>
          )}
        </Animated.View>
      </View>

      {/* Full Screen Image Viewer */}
      {fullScreenImage && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFullScreenImage(null)}
        >
          <Animated.View 
            style={[
              styles.fullScreenContainer,
              { transform: [{ translateY: fullScreenTranslateY }] }
            ]}
            {...fullScreenPanResponder.panHandlers}
          >
            <TouchableOpacity 
              style={styles.fullScreenClose}
              onPress={() => setFullScreenImage(null)}
            >
              <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <Path d="M18 6 6 18"/>
                <Path d="m6 6 12 12"/>
              </Svg>
            </TouchableOpacity>
            
            <ScrollView
              ref={fullScreenScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.fullScreenScroll}
              scrollEnabled={zoomedIndex === null}
              onScroll={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                if (index !== fullScreenIndex) {
                  setFullScreenIndex(index);
                  setZoomedIndex(null); // Reset zoom when changing images
                }
              }}
              scrollEventThrottle={16}
            >
              {safeImages.map((imgUri, idx) => {
                const isZoomed = zoomedIndex === idx;
                
                if (isZoomed) {
                  return (
                    <View 
                      key={idx} 
                      style={{ width, height }}
                    >
                      <ScrollView
                        horizontal
                        style={{ flex: 1 }}
                        contentContainerStyle={{ 
                          width: width * 2,
                          height: height,
                          justifyContent: 'center',
                          alignItems: 'center'
                        }}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        contentOffset={{ x: width / 2, y: 0 }}
                      >
                        <TouchableOpacity 
                          activeOpacity={1}
                          onPress={() => setZoomedIndex(null)}
                        >
                          <Image
                            source={{ uri: imgUri }}
                            style={{ width: width * 2, height: height }}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  );
                }
                
                return (
                  <View 
                    key={idx} 
                    style={{ width, height, justifyContent: 'center', alignItems: 'center' }}
                  >
                    <TouchableOpacity 
                      activeOpacity={1}
                      onPress={() => setZoomedIndex(idx)}
                    >
                      <Image
                        source={{ uri: imgUri }}
                        style={styles.fullScreenImage}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            
            {/* Image Counter */}
            <View style={styles.imageCounter}>
              <Text style={styles.imageCounterText}>
                {fullScreenIndex + 1} / {safeImages.length}
              </Text>
            </View>
          </Animated.View>
        </Modal>
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT_EXPANDED,
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  handleContainer: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#475569',
    borderRadius: 2,
  },
  imageContainer: {
    height: 300,
    backgroundColor: '#1e293b',
    position: 'relative',
  },
  imageSlide: {
    height: 300,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderTopColor: 'transparent',
    borderRadius: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
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
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 4,
  },
  phone: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  vibeSection: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(51, 65, 85, 0.5)',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#818cf8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  vibeText: {
    fontSize: 16,
    color: '#cbd5e1',
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 12,
    lineHeight: 22,
  },
  reasonText: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 24,
  },
  signatureText: {
    fontSize: 15,
    color: '#fbbf24',
    lineHeight: 22,
    fontWeight: '600',
  },
  tipsSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  tipsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipsIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  tipsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#a5b4fc',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tipsContainer: {
    gap: 10,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tipBullet: {
    fontSize: 16,
    color: '#818cf8',
    marginRight: 10,
    lineHeight: 20,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#e2e8f0',
    lineHeight: 20,
  },
  loadingTipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  tipsSpinner: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#818cf8',
    borderTopColor: 'transparent',
    borderRadius: 10,
  },
  loadingTipsText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  reviewsSection: {
    marginBottom: 16,
  },
  reviewsTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  reviewGroup: {
    marginBottom: 16,
  },
  reviewGroupTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  reviewCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  reviewText: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 22,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  swipeHint: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenScroll: {
    flex: 1,
  },
  fullScreenImage: {
    width: width,
    height: height,
  },
  imageCounter: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  imageCounterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
