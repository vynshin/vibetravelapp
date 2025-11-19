import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Animated } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';

interface PlaceActionSheetProps {
  visible: boolean;
  placeName: string;
  isSaved?: boolean;
  onSave: () => void;
  onRemove: () => void;
  onShare: () => void;
  onClose: () => void;
}

export const PlaceActionSheet: React.FC<PlaceActionSheetProps> = ({
  visible,
  placeName,
  isSaved = false,
  onSave,
  onRemove,
  onShare,
  onClose,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          
          <Text style={styles.title} numberOfLines={1}>{placeName}</Text>
          
          <TouchableOpacity 
            style={styles.action}
            onPress={() => { onSave(); onClose(); }}
            activeOpacity={0.7}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill={isSaved ? "#10b981" : "none"} stroke="#10b981" strokeWidth="2">
              <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </Svg>
            <Text style={styles.actionText}>
              {isSaved ? 'Remove from List' : 'Save to List'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.action}
            onPress={() => { onRemove(); onClose(); }}
            activeOpacity={0.7}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
              <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <Path d="M1 1l22 22" />
            </Svg>
            <Text style={styles.actionText}>Hide (Don't Show Again)</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.action}
            onPress={() => { onShare(); onClose(); }}
            activeOpacity={0.7}
          >
            <Svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
              <Circle cx="18" cy="5" r="3" />
              <Circle cx="6" cy="12" r="3" />
              <Circle cx="18" cy="19" r="3" />
              <Path d="m8.59 13.51 6.83 3.98" />
              <Path d="m15.41 6.51-6.82 3.98" />
            </Svg>
            <Text style={styles.actionText}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.action, styles.cancelAction]}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#475569',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    borderRadius: 16,
    marginBottom: 12,
    gap: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  cancelAction: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    marginTop: 8,
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ef4444',
    textAlign: 'center',
  },
});
