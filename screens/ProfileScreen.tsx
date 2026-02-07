import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, Flame, Pencil, Check, X, ChevronRight, MapPin, Clock, Footprints, Bike, PersonStanding, LogOut } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';
import { UserProfile, Activity as ActivityType } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';
import { formatDistance, formatDuration } from '../utils/shareCardUtils';

interface ProfileScreenProps {
  navigation: any;
}

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  useScreenTracking('Profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [territoryCount, setTerritoryCount] = useState(0);
  const [stats, setStats] = useState<{
    totalActivities: number;
    totalDistance: number;
    totalDuration: number;
    byType: { [key: string]: { count: number; distance: number; duration: number } };
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  const initialLoadComplete = React.useRef(false);
  const isFetching = React.useRef(false);

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (isFetching.current) return;
    isFetching.current = true;

    if (showRefreshing) setRefreshing(true);
    try {
      const p = await AuthService.getCurrentProfile();
      setProfile(p);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const userActivities = await ActivityService.getUserActivities(session.user.id);
        setActivities(userActivities);
        const activityStats = await ActivityService.getActivityStats(session.user.id, userActivities);
        setStats(activityStats);

        const userTerritories = await TerritoryService.getUserTerritories(session.user.id);
        setTerritoryCount(userTerritories.length);
      }
    } catch (err) {
      console.error('Fetch data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (!initialLoadComplete.current) {
      initialLoadComplete.current = true;
      fetchData();
    }
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      if (loading) return;
      fetchData();
    }, [fetchData, loading])
  );

  const onRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const startEditing = () => {
    setEditBio(profile?.bio || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await AuthService.updateProfile({
        bio: editBio.trim(),
      });
      setProfile(prev => prev ? { ...prev, bio: editBio.trim() } : prev);
      setIsEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') {
      navigation.navigate('Home');
    } else if (tab === 'record') {
      navigation.navigate('Record');
    } else if (tab === 'friends') {
      navigation.navigate('Friends');
    } else if (tab === 'leaderboard') {
      navigation.navigate('Leaderboard');
    } else if (tab === 'feed') {
      navigation.navigate('Feed');
    }
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'RUN': return <Footprints color="#E65100" size={20} />;
      case 'RIDE': return <Bike color="#E65100" size={20} />;
      case 'WALK': return <PersonStanding color="#E65100" size={20} />;
      default: return <Footprints color="#E65100" size={20} />;
    }
  };

  const thisWeekStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startMs = startOfWeek.getTime();

    const weekActivities = activities.filter(a => a.startTime >= startMs);
    return {
      count: weekActivities.length,
      distance: weekActivities.reduce((sum, a) => sum + (a.distance || 0), 0),
      duration: weekActivities.reduce((sum, a) => sum + (a.duration || 0), 0),
    };
  }, [activities]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" />
      </View>
    );
  }

  const streak = 0;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E65100"
              colors={['#E65100']}
            />
          }
        >
          {/* Edit button row */}
          <View style={styles.editRow}>
            {isEditing ? (
              <View style={styles.editActions}>
                <TouchableOpacity onPress={cancelEditing} style={styles.editActionBtn}>
                  <X color="#666666" size={20} />
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEdits} disabled={saving} style={styles.editActionBtn}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#E65100" />
                  ) : (
                    <Check color="#E65100" size={20} />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={startEditing} style={styles.editBtn}>
                <Pencil color="#666666" size={18} />
              </TouchableOpacity>
            )}
          </View>

          {/* Centered profile header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User color="#E65100" size={44} />
                </View>
              )}
            </View>
            <Text style={styles.username}>{profile?.username || 'your_username'}</Text>
            {profile?.bio && !isEditing ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : null}
            <View style={styles.streakBadge}>
              <Flame color="#FF6B00" size={16} fill="#FF6B00" />
              <Text style={styles.streakText}>{streak} day streak</Text>
            </View>
          </View>

          {/* Bio editor */}
          {isEditing && (
            <View style={styles.bioSection}>
              <TextInput
                style={styles.bioInput}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Add a bio..."
                placeholderTextColor="#999999"
                multiline
                maxLength={120}
              />
            </View>
          )}

          {/* Stats bar */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.totalActivities || 0}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDistance(stats?.totalDistance || 0)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDuration(stats?.totalDuration || 0)}</Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{territoryCount}</Text>
              <Text style={styles.statLabel}>Territories</Text>
            </View>
          </View>

          {/* This Week summary */}
          <View style={styles.weekCard}>
            <Text style={styles.weekTitle}>This Week</Text>
            <View style={styles.weekStatsRow}>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>{thisWeekStats.count}</Text>
                <Text style={styles.weekStatLabel}>Activities</Text>
              </View>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>{formatDistance(thisWeekStats.distance)}</Text>
                <Text style={styles.weekStatLabel}>Distance</Text>
              </View>
              <View style={styles.weekStatItem}>
                <Text style={styles.weekStatValue}>{formatDuration(thisWeekStats.duration)}</Text>
                <Text style={styles.weekStatLabel}>Time</Text>
              </View>
            </View>
          </View>

          {/* Empty state */}
          {activities.length === 0 && (
            <Text style={styles.emptyMessage}>do your first run !</Text>
          )}

          {/* Recent Activities */}
          {activities.length > 0 && (
            <View style={styles.activitiesSection}>
              <Text style={styles.sectionTitle}>Recent Activities</Text>
              {activities.slice(0, 10).map((activity) => (
                <TouchableOpacity
                  key={activity.id}
                  style={styles.activityCard}
                  onPress={() => navigation.navigate('ActivityDetails', { activityId: activity.id })}
                >
                  <View style={styles.activityIcon}>
                    {getActivityTypeIcon(activity.type)}
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityType}>{activity.type}</Text>
                    <View style={styles.activityStatsRow}>
                      <View style={styles.activityStat}>
                        <MapPin color="#999999" size={12} />
                        <Text style={styles.activityStatText}>
                          {formatDistance(activity.distance)}
                        </Text>
                      </View>
                      <View style={styles.activityStat}>
                        <Clock color="#999999" size={12} />
                        <Text style={styles.activityStatText}>
                          {Math.floor(activity.duration / 60)}min
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.activityDate}>
                      {new Date(activity.startTime).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </Text>
                  </View>
                  <ChevronRight color="#CCCCCC" size={20} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut color="#FF3B30" size={18} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <BottomTabBar activeTab="profile" onTabPress={handleTabPress} />
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
  scrollContent: {
    flex: 1,
  },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  editBtn: {
    padding: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 16,
  },
  editActionBtn: {
    padding: 8,
  },
  profileHeader: {
    alignItems: 'center',
    paddingBottom: 24,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 40,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
    marginTop: 8,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF6B00',
  },
  bioSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  bioInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    color: '#1A1A1A',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 20,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E0E0E0',
  },
  weekCard: {
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  weekStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  weekStatItem: {
    alignItems: 'center',
  },
  weekStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E65100',
  },
  weekStatLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 32,
    fontStyle: 'italic',
  },
  activitiesSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityStatsRow: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 12,
  },
  activityStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityStatText: {
    fontSize: 12,
    color: '#666666',
  },
  activityDate: {
    fontSize: 11,
    color: '#999999',
    marginTop: 4,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 40,
    gap: 8,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
