import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Dimensions,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Place, Collection, HistoryEntry, Coordinates } from '../types';
import { PlaceCard } from '../components/PlaceCard';
import { PlacePopup } from '../components/PlacePopup';
import {
  getFavorites,
  getCollections,
  getHistory,
  createCollection,
  deleteCollection,
  getPlacesInCollection,
  removePlaceFromFavorites
} from '../services/collections';
import { Svg, Path, Circle } from 'react-native-svg';

const { width } = Dimensions.get('window');

type TabType = 'favorites' | 'collections' | 'history';

export const SavedPlacesScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('favorites');
  const [favorites, setFavorites] = useState<Place[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionPlaces, setCollectionPlaces] = useState<Place[]>([]);
  const [showCreateCollection, setShowCreateCollection] = useState<boolean>(false);
  const [newCollectionName, setNewCollectionName] = useState<string>('');
  const [newCollectionIcon, setNewCollectionIcon] = useState<string>('⭐');

  const loadData = useCallback(async () => {
    const [favs, colls, hist] = await Promise.all([
      getFavorites(),
      getCollections(),
      getHistory()
    ]);
    setFavorites(favs);
    setCollections(colls);
    setHistory(hist);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    await createCollection(newCollectionName.trim(), newCollectionIcon);
    setNewCollectionName('');
    setNewCollectionIcon('⭐');
    setShowCreateCollection(false);
    loadData();
  };

  const handleDeleteCollection = async (collectionId: string) => {
    Alert.alert(
      'Delete Collection',
      'Are you sure you want to delete this collection?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCollection(collectionId);
            loadData();
            if (selectedCollection?.id === collectionId) {
              setSelectedCollection(null);
            }
          }
        }
      ]
    );
  };

  const handleViewCollection = async (collection: Collection) => {
    setSelectedCollection(collection);
    const places = await getPlacesInCollection(collection.id);
    setCollectionPlaces(places);
  };

  const handleRemoveFavorite = async (placeId: string) => {
    await removePlaceFromFavorites(placeId);
    loadData();
  };

  const cardWidth = (width - 48) / 2; // 16px padding on each side + 16px gap

  const iconOptions = ['⭐', '🍕', '☕', '🍹', '🎭', '🏛️', '🌃', '💎', '🔥', '📍'];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Saved</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.tabActive]}
          onPress={() => setActiveTab('favorites')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'favorites' && styles.tabTextActive]}>
            Favorites
          </Text>
          <View style={[styles.tabIndicator, activeTab === 'favorites' && styles.tabIndicatorActive]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'collections' && styles.tabActive]}
          onPress={() => setActiveTab('collections')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'collections' && styles.tabTextActive]}>
            Collections
          </Text>
          <View style={[styles.tabIndicator, activeTab === 'collections' && styles.tabIndicatorActive]} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
          <View style={[styles.tabIndicator, activeTab === 'history' && styles.tabIndicatorActive]} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Favorites Tab */}
        {activeTab === 'favorites' && (
          <View style={styles.gridContainer}>
            {favorites.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>💙</Text>
                <Text style={styles.emptyTitle}>No favorites yet</Text>
                <Text style={styles.emptyText}>Tap the heart icon on any place to save it here</Text>
              </View>
            ) : (
              favorites.map((place, index) => (
                <View key={place.id} style={{ width: cardWidth, marginBottom: 16 }}>
                  <PlaceCard
                    place={place}
                    delay={index * 100}
                    onSelect={setSelectedPlace}
                    onHidePlace={handleRemoveFavorite}
                    coords={undefined}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {/* Collections Tab */}
        {activeTab === 'collections' && (
          <>
            {selectedCollection ? (
              // Show places in selected collection
              <View>
                <View style={styles.collectionHeader}>
                  <TouchableOpacity onPress={() => setSelectedCollection(null)} style={styles.backButton}>
                    <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2}>
                      <Path d="M19 12H5M12 19l-7-7 7-7" />
                    </Svg>
                  </TouchableOpacity>
                  <Text style={styles.collectionTitle}>
                    {selectedCollection.icon} {selectedCollection.name}
                  </Text>
                  <Text style={styles.collectionCount}>{collectionPlaces.length} places</Text>
                </View>
                <View style={styles.gridContainer}>
                  {collectionPlaces.map((place, index) => (
                    <View key={place.id} style={{ width: cardWidth, marginBottom: 16 }}>
                      <PlaceCard
                        place={place}
                        delay={index * 100}
                        onSelect={setSelectedPlace}
                        onHidePlace={handleRemoveFavorite}
                        coords={undefined}
                      />
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              // Show collections list
              <View>
                <TouchableOpacity
                  style={styles.createCollectionButton}
                  onPress={() => setShowCreateCollection(true)}
                  activeOpacity={0.7}
                >
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth={2}>
                    <Circle cx={12} cy={12} r={10} />
                    <Path d="M12 8v8M8 12h8" />
                  </Svg>
                  <Text style={styles.createCollectionButtonText}>New Collection</Text>
                </TouchableOpacity>

                {collections.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>📁</Text>
                    <Text style={styles.emptyTitle}>No collections yet</Text>
                    <Text style={styles.emptyText}>Create collections to organize your favorite places</Text>
                  </View>
                ) : (
                  collections.map(collection => (
                    <TouchableOpacity
                      key={collection.id}
                      style={styles.collectionCard}
                      onPress={() => handleViewCollection(collection)}
                      onLongPress={() => handleDeleteCollection(collection.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.collectionCardIcon}>{collection.icon || '📁'}</Text>
                      <View style={styles.collectionCardInfo}>
                        <Text style={styles.collectionCardName}>{collection.name}</Text>
                        <Text style={styles.collectionCardCount}>{collection.placeIds.length} places</Text>
                      </View>
                      <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}>
                        <Path d="M9 18l6-6-6-6" />
                      </Svg>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <View>
            {history.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🕒</Text>
                <Text style={styles.emptyTitle}>No history yet</Text>
                <Text style={styles.emptyText}>Places you discover will appear here</Text>
              </View>
            ) : (
              history.map((entry, index) => (
                <TouchableOpacity
                  key={`${entry.place.id}-${entry.viewedAt}`}
                  style={styles.historyCard}
                  onPress={() => setSelectedPlace(entry.place)}
                  activeOpacity={0.7}
                >
                  <View style={styles.historyCardLeft}>
                    <Text style={styles.historyPlaceName}>{entry.place.name}</Text>
                    <Text style={styles.historyMeta}>
                      {entry.location} • {new Date(entry.viewedAt).toLocaleDateString()}
                    </Text>
                    {entry.searchQuery && (
                      <Text style={styles.historyQuery}>Searched: "{entry.searchQuery}"</Text>
                    )}
                  </View>
                  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth={2}>
                    <Path d="M9 18l6-6-6-6" />
                  </Svg>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Create Collection Modal */}
      <Modal
        visible={showCreateCollection}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateCollection(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Collection</Text>

            {/* Icon Picker */}
            <Text style={styles.label}>Icon</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPicker}>
              {iconOptions.map(icon => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconOption, newCollectionIcon === icon && styles.iconOptionSelected]}
                  onPress={() => setNewCollectionIcon(icon)}
                >
                  <Text style={styles.iconOptionText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Name Input */}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Date Night, Weekend Brunch"
              placeholderTextColor="#64748b"
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              autoFocus
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowCreateCollection(false);
                  setNewCollectionName('');
                  setNewCollectionIcon('⭐');
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={handleCreateCollection}
              >
                <Text style={styles.modalButtonTextCreate}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Place Popup */}
      {selectedPlace && (
        <PlacePopup
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.3)',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#6366f1',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: '#6366f1',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  createCollectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    marginBottom: 16,
  },
  createCollectionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6366f1',
  },
  collectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    marginBottom: 12,
  },
  collectionCardIcon: {
    fontSize: 32,
  },
  collectionCardInfo: {
    flex: 1,
  },
  collectionCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  collectionCardCount: {
    fontSize: 13,
    color: '#94a3b8',
  },
  collectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  collectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  collectionCount: {
    fontSize: 13,
    color: '#94a3b8',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    marginBottom: 12,
  },
  historyCardLeft: {
    flex: 1,
  },
  historyPlaceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  historyMeta: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 2,
  },
  historyQuery: {
    fontSize: 12,
    color: '#64748b',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 8,
  },
  iconPicker: {
    marginBottom: 20,
  },
  iconOption: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 8,
  },
  iconOptionSelected: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  iconOptionText: {
    fontSize: 24,
  },
  input: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#e2e8f0',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  modalButtonCreate: {
    backgroundColor: '#6366f1',
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
  },
  modalButtonTextCreate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
