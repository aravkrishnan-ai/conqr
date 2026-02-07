import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy, User, Crown, Medal } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import { TerritoryService } from '../services/TerritoryService';
import { AuthService } from '../services/AuthService';
import { supabase } from '../lib/supabase';
import { useScreenTracking } from '../lib/useScreenTracking';

interface LeaderboardScreenProps {
  navigation: any;
}

type TimePeriod = 'week' | 'month' | 'year' | 'all';

interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  totalArea: number;
  territoryCount: number;
}

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

function getStartDate(period: TimePeriod): number | null {
  if (period === 'all') return null;
  const now = new Date();
  switch (period) {
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return d.getTime();
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return d.getTime();
    }
  }
}

function buildLeaderboard(
  territories: { ownerId: string; ownerName?: string; area: number; claimedAt: number }[],
  period: TimePeriod
): LeaderboardEntry[] {
  const startDate = getStartDate(period);
  const filtered = startDate
    ? territories.filter(t => t.claimedAt >= startDate)
    : territories;

  const userMap = new Map<string, LeaderboardEntry>();
  for (const t of filtered) {
    const existing = userMap.get(t.ownerId);
    if (existing) {
      existing.totalArea += t.area;
      existing.territoryCount += 1;
    } else {
      userMap.set(t.ownerId, {
        userId: t.ownerId,
        username: t.ownerName || 'Unknown',
        totalArea: t.area,
        territoryCount: 1,
      });
    }
  }

  return Array.from(userMap.values())
    .sort((a, b) => b.totalArea - a.totalArea);
}

function formatArea(sqMeters: number): string {
  if (sqMeters < 10000) {
    return `${Math.round(sqMeters).toLocaleString()} m²`;
  }
  return `${(sqMeters / 10000).toFixed(2)} ha`;
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  all: 'All Time',
};

export default function LeaderboardScreen({ navigation }: LeaderboardScreenProps) {
  useScreenTracking('Leaderboard');
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const territoriesRef = useRef<{ ownerId: string; ownerName?: string; area: number; claimedAt: number }[]>([]);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());

  const periodRef = useRef<TimePeriod>(period);
  periodRef.current = period;

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [session, territories] = await Promise.all([
        supabase.auth.getSession(),
        TerritoryService.getLeaderboardTerritories(),
      ]);

      if (session.data.session?.user) {
        setCurrentUserId(session.data.session.user.id);
      }

      territoriesRef.current = territories.map(t => ({
        ownerId: t.ownerId,
        ownerName: t.ownerName,
        area: t.area,
        claimedAt: t.claimedAt,
      }));

      // Fetch avatars for unique users
      const uniqueUserIds = [...new Set(territories.map(t => t.ownerId))];
      if (uniqueUserIds.length > 0) {
        try {
          const { data: users } = await supabase
            .from('users')
            .select('id, avatar_url')
            .in('id', uniqueUserIds);
          if (users) {
            const newMap = new Map<string, string>();
            for (const u of users) {
              if (u.avatar_url) newMap.set(u.id, u.avatar_url);
            }
            setAvatarMap(newMap);
          }
        } catch {
          // Avatar fetch is best-effort
        }
      }

      setLeaderboard(buildLeaderboard(territoriesRef.current, periodRef.current));
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Rebuild leaderboard when period changes (using cached data)
  useEffect(() => {
    if (territoriesRef.current.length > 0) {
      setLeaderboard(buildLeaderboard(territoriesRef.current, period));
    }
  }, [period]);

  // Load data on focus
  useFocusEffect(
    useCallback(() => {
      fetchData();

      // Set up auto-refresh every 15 minutes
      autoRefreshRef.current = setInterval(() => {
        fetchData();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
          autoRefreshRef.current = null;
        }
      };
    }, [fetchData])
  );

  const onRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'record') navigation.navigate('Record');
    else if (tab === 'profile') navigation.navigate('Profile');
    else if (tab === 'friends') navigation.navigate('Friends');
    else if (tab === 'feed') navigation.navigate('Feed');
  };

  const renderRankBadge = (rank: number) => {
    if (rank === 1) return <Crown color="#FFD700" size={22} fill="#FFD700" />;
    if (rank === 2) return <Medal color="#C0C0C0" size={20} />;
    if (rank === 3) return <Medal color="#CD7F32" size={20} />;
    return <Text style={styles.rankNumber}>{rank}</Text>;
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Trophy color="#E65100" size={24} />
          <Text style={styles.headerTitle}>Leaderboard</Text>
        </View>

        <View style={styles.periodTabs}>
          {(['week', 'month', 'year', 'all'] as TimePeriod[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {PERIOD_LABELS[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E65100"
              colors={['#E65100']}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {leaderboard.length === 0 ? (
            <View style={styles.emptyState}>
              <Trophy color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>No territories claimed yet</Text>
              <Text style={styles.emptySubtext}>
                {period === 'all' ? 'Be the first to conquer territory!' : `No territory claimed ${PERIOD_LABELS[period].toLowerCase()}`}
              </Text>
            </View>
          ) : (
            leaderboard.map((entry, index) => {
              const rank = index + 1;
              const isCurrentUser = entry.userId === currentUserId;
              return (
                <TouchableOpacity
                  key={entry.userId}
                  style={[
                    styles.leaderboardRow,
                    rank <= 3 && styles.topThreeRow,
                    isCurrentUser && styles.currentUserRow,
                  ]}
                  onPress={() => {
                    if (isCurrentUser) {
                      navigation.navigate('Profile');
                    } else {
                      navigation.navigate('UserProfile', { userId: entry.userId });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.rankBadge}>
                    {renderRankBadge(rank)}
                  </View>

                  <View style={styles.userAvatar}>
                    {avatarMap.get(entry.userId) ? (
                      <Image source={{ uri: avatarMap.get(entry.userId) }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <User color="#E65100" size={18} />
                      </View>
                    )}
                  </View>

                  <View style={styles.userInfo}>
                    <Text style={[styles.username, isCurrentUser && styles.currentUserText]} numberOfLines={1}>
                      {entry.username}{isCurrentUser ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.territoryCount}>
                      {entry.territoryCount} {entry.territoryCount === 1 ? 'territory' : 'territories'}
                    </Text>
                  </View>

                  <View style={styles.areaContainer}>
                    <Text style={[styles.areaValue, rank <= 3 && styles.topThreeArea]}>
                      {formatArea(entry.totalArea)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
      <BottomTabBar activeTab="leaderboard" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  periodTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: '#E65100',
  },
  periodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    marginTop: 8,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#FAFAFA',
  },
  topThreeRow: {
    backgroundColor: '#FFF8F0',
  },
  currentUserRow: {
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(230, 81, 0, 0.2)',
  },
  rankBadge: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999999',
  },
  userAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginRight: 8,
  },
  username: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  currentUserText: {
    color: '#E65100',
  },
  territoryCount: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },
  areaContainer: {
    alignItems: 'flex-end',
  },
  areaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  topThreeArea: {
    color: '#E65100',
  },
  bottomPadding: {
    height: 20,
  },
});
