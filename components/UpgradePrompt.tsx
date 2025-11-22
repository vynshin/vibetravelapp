import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { UsageStats, FREE_TIER_LIMITS } from '../services/usage';

interface UpgradePromptProps {
  visible: boolean;
  stats: UsageStats | null;
  onClose: () => void;
  onUpgrade: () => void;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({ visible, stats, onClose, onUpgrade }) => {
  const searchCount = stats?.searchCount || 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.emoji}>🔒</Text>

          <Text style={styles.title}>Free Searches Used</Text>

          <Text style={styles.description}>
            You've used all {FREE_TIER_LIMITS.searchesPerMonth} free searches this month.
            {'\n\n'}
            Upgrade to Premium for unlimited searches and discover amazing places without limits!
          </Text>

          <View style={styles.features}>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>Unlimited searches</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>Ad-free experience</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>Offline saved places</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.checkmark}>✓</Text>
              <Text style={styles.featureText}>Priority support</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade} activeOpacity={0.8}>
            <Text style={styles.upgradeButtonText}>Upgrade to Premium - $4.99/mo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>Maybe Later</Text>
          </TouchableOpacity>

          <Text style={styles.resetNote}>
            Free tier resets monthly • Next reset: {getNextResetDate()}
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const getNextResetDate = (): string => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(71, 85, 105, 0.5)',
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#cbd5e1',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  features: {
    width: '100%',
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkmark: {
    fontSize: 18,
    color: '#10b981',
    marginRight: 12,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 15,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  resetNote: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 16,
    textAlign: 'center',
  },
});
