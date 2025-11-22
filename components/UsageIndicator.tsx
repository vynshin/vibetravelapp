import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { UsageStats, FREE_TIER_LIMITS } from '../services/usage';

interface UsageIndicatorProps {
  stats: UsageStats | null;
  onUpgradePress: () => void;
}

export const UsageIndicator: React.FC<UsageIndicatorProps> = ({ stats, onUpgradePress }) => {
  if (!stats) return null;

  const remaining = FREE_TIER_LIMITS.searchesPerMonth - stats.searchCount;
  const percentage = (stats.searchCount / FREE_TIER_LIMITS.searchesPerMonth) * 100;
  const isLow = remaining <= 2;
  const isExceeded = remaining <= 0;

  // Don't show if user has plenty of searches left
  if (remaining > 3) return null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={[styles.text, isExceeded && styles.textDanger]}>
            {isExceeded
              ? '🔒 Free searches used'
              : `${remaining} free ${remaining === 1 ? 'search' : 'searches'} left`}
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(percentage, 100)}%` },
                isLow && styles.progressLow,
                isExceeded && styles.progressExceeded,
              ]}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.upgradeButton} onPress={onUpgradePress} activeOpacity={0.8}>
          <Text style={styles.upgradeText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 85, 105, 0.3)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  text: {
    fontSize: 12,
    color: '#cbd5e1',
    marginBottom: 4,
    fontWeight: '500',
  },
  textDanger: {
    color: '#f87171',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(71, 85, 105, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  progressLow: {
    backgroundColor: '#f59e0b',
  },
  progressExceeded: {
    backgroundColor: '#ef4444',
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  upgradeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
