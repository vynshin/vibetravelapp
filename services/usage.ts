import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UsageStats {
  userId: string; // Anonymous device ID
  currentMonth: string; // YYYY-MM format
  searchCount: number;
  placeViewCount: number;
  favoriteCount: number;
  lastSearchAt: number;
  createdAt: number;
  totalSearchesAllTime: number;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  searches: number;
  placeViews: number;
}

const USAGE_STATS_KEY = '@usage_stats';
const DAILY_USAGE_KEY = '@daily_usage';

// Free tier limits
export const FREE_TIER_LIMITS = {
  searchesPerMonth: 10,
  favoritesMax: 10,
};

/**
 * Get or create anonymous user ID
 */
export const getUserId = async (): Promise<string> => {
  const key = '@user_id';
  let userId = await AsyncStorage.getItem(key);

  if (!userId) {
    // Generate anonymous ID
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem(key, userId);
  }

  return userId;
};

/**
 * Get current month in YYYY-MM format
 */
const getCurrentMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Get current usage stats for the month
 */
export const getUsageStats = async (): Promise<UsageStats> => {
  const userId = await getUserId();
  const currentMonth = getCurrentMonth();

  try {
    const statsJson = await AsyncStorage.getItem(USAGE_STATS_KEY);

    if (statsJson) {
      const stats: UsageStats = JSON.parse(statsJson);

      // Reset if new month
      if (stats.currentMonth !== currentMonth) {
        return createNewMonthStats(userId, currentMonth, stats.totalSearchesAllTime);
      }

      return stats;
    }
  } catch (error) {
    console.error('Error loading usage stats:', error);
  }

  return createNewMonthStats(userId, currentMonth, 0);
};

/**
 * Create new month stats
 */
const createNewMonthStats = (userId: string, currentMonth: string, totalSearches: number): UsageStats => {
  return {
    userId,
    currentMonth,
    searchCount: 0,
    placeViewCount: 0,
    favoriteCount: 0,
    lastSearchAt: 0,
    createdAt: Date.now(),
    totalSearchesAllTime: totalSearches,
  };
};

/**
 * Track a search event
 */
export const trackSearch = async (): Promise<UsageStats> => {
  const stats = await getUsageStats();

  stats.searchCount += 1;
  stats.totalSearchesAllTime += 1;
  stats.lastSearchAt = Date.now();

  await AsyncStorage.setItem(USAGE_STATS_KEY, JSON.stringify(stats));

  // Also track daily usage
  await trackDailyUsage('search');

  console.log(`📊 Usage: ${stats.searchCount}/${FREE_TIER_LIMITS.searchesPerMonth} searches this month`);

  return stats;
};

/**
 * Track a place view event
 */
export const trackPlaceView = async (): Promise<void> => {
  const stats = await getUsageStats();

  stats.placeViewCount += 1;

  await AsyncStorage.setItem(USAGE_STATS_KEY, JSON.stringify(stats));

  // Also track daily usage
  await trackDailyUsage('placeView');
};

/**
 * Track favorite count
 */
export const updateFavoriteCount = async (count: number): Promise<void> => {
  const stats = await getUsageStats();

  stats.favoriteCount = count;

  await AsyncStorage.setItem(USAGE_STATS_KEY, JSON.stringify(stats));
};

/**
 * Check if user has exceeded free tier limits
 */
export const hasExceededFreeTier = async (): Promise<boolean> => {
  const stats = await getUsageStats();
  return stats.searchCount >= FREE_TIER_LIMITS.searchesPerMonth;
};

/**
 * Get remaining free searches
 */
export const getRemainingSearches = async (): Promise<number> => {
  const stats = await getUsageStats();
  const remaining = FREE_TIER_LIMITS.searchesPerMonth - stats.searchCount;
  return Math.max(0, remaining);
};

/**
 * Track daily usage for analytics
 */
const trackDailyUsage = async (type: 'search' | 'placeView'): Promise<void> => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    const dailyJson = await AsyncStorage.getItem(DAILY_USAGE_KEY);
    const dailyUsage: DailyUsage[] = dailyJson ? JSON.parse(dailyJson) : [];

    // Find or create today's entry
    let todayEntry = dailyUsage.find(d => d.date === today);

    if (!todayEntry) {
      todayEntry = { date: today, searches: 0, placeViews: 0 };
      dailyUsage.push(todayEntry);
    }

    // Update counts
    if (type === 'search') {
      todayEntry.searches += 1;
    } else {
      todayEntry.placeViews += 1;
    }

    // Keep only last 30 days
    const last30Days = dailyUsage
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    await AsyncStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(last30Days));
  } catch (error) {
    console.error('Error tracking daily usage:', error);
  }
};

/**
 * Get daily usage for last 30 days
 */
export const getDailyUsage = async (): Promise<DailyUsage[]> => {
  try {
    const dailyJson = await AsyncStorage.getItem(DAILY_USAGE_KEY);
    return dailyJson ? JSON.parse(dailyJson) : [];
  } catch (error) {
    console.error('Error loading daily usage:', error);
    return [];
  }
};

/**
 * Get weekly summary
 */
export const getWeeklySummary = async (): Promise<{ searches: number; placeViews: number }> => {
  const daily = await getDailyUsage();
  const last7Days = daily.slice(0, 7);

  return last7Days.reduce(
    (acc, day) => ({
      searches: acc.searches + day.searches,
      placeViews: acc.placeViews + day.placeViews,
    }),
    { searches: 0, placeViews: 0 }
  );
};

/**
 * Reset usage stats (for testing)
 * Also clears all caches to ensure fresh data
 */
export const resetUsageStats = async (): Promise<void> => {
  await AsyncStorage.removeItem(USAGE_STATS_KEY);
  await AsyncStorage.removeItem(DAILY_USAGE_KEY);

  // Also clear all caches so user sees fresh filtered results
  await AsyncStorage.removeItem('@vibecheck:cached_results');
  await AsyncStorage.removeItem('@vibecheck:cached_place_details');
  await AsyncStorage.removeItem('@vibecheck:grid_cache');

  console.log('✅ Usage stats reset');
  console.log('🗑️ All caches cleared');
};

/**
 * Export all usage data for analytics
 */
export const exportUsageData = async (): Promise<{
  stats: UsageStats;
  daily: DailyUsage[];
  weekly: { searches: number; placeViews: number };
}> => {
  const stats = await getUsageStats();
  const daily = await getDailyUsage();
  const weekly = await getWeeklySummary();

  return { stats, daily, weekly };
};
