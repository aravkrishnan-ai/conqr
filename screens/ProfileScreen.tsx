import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, Flame, Pencil, Check, X, ChevronRight, MapPin, Clock, Footprints, Bike, PersonStanding, LogOut, Map, TrendingUp, Trash2, Shield } from 'lucide-react-native';
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data (activities, territories, posts). This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Type DELETE to confirm account deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session?.user) return;
                      const userId = session.user.id;

                      // Delete user data from all tables
                      await Promise.allSettled([
                        supabase.from('analytics_events').delete().eq('user_id', userId),
                        supabase.from('territory_invasions').delete().or(`invaded_user_id.eq.${userId},invader_user_id.eq.${userId}`),
                        supabase.from('post_comments').delete().eq('user_id', userId),
                        supabase.from('post_likes').delete().eq('user_id', userId),
                        supabase.from('posts').delete().eq('user_id', userId),
                        supabase.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
                        supabase.from('territories').delete().eq('owner_id', userId),
                        supabase.from('activities').delete().eq('user_id', userId),
                      ]);

                      // Delete user profile last
                      await supabase.from('users').delete().eq('id', userId);

                      // Sign out and clear local data
                      await supabase.auth.signOut();
                      Alert.alert('Account Deleted', 'Your account and all data have been permanently deleted.');
                    } catch (err) {
                      console.error('Account deletion error:', err);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support at conqrapp@gmail.com');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handlePrivacyPolicy = () => {
    navigation.navigate('PrivacyPolicy');
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

  // Format the hero distance - large display
  const heroDistance = stats?.totalDistance || 0;
  const heroDistanceStr = heroDistance < 1000
    ? `${Math.round(heroDistance)}`
    : `${(heroDistance / 1000).toFixed(1)}`;
  const heroDistanceUnit = heroDistance < 1000 ? 'm' : 'km';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E65100"
              colors={['#E65100']}
            />
          }
        >
          {/* Dark hero header */}
          <View style={styles.heroSection}>
            {/* Top bar: avatar + name + edit */}
            <View style={styles.topBar}>
              <View style={styles.profileRow}>
                <View style={styles.avatarContainer}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <User color="#E65100" size={24} />
                    </View>
                  )}
                </View>
                <View style={styles.nameBlock}>
                  <Text style={styles.username}>{profile?.username || 'your_username'}</Text>
                  {profile?.bio && !isEditing ? (
                    <Text style={styles.bio} numberOfLines={1}>{profile.bio}</Text>
                  ) : null}
                </View>
              </View>
              {isEditing ? (
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={cancelEditing} style={styles.editActionBtn}>
                    <X color="#999999" size={20} />
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
                  <Pencil color="#999999" size={18} />
                </TouchableOpacity>
              )}
            </View>

            {/* Bio editor */}
            {isEditing && (
              <View style={styles.bioSection}>
                <TextInput
                  style={styles.bioInput}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Add a bio..."
                  placeholderTextColor="#666666"
                  multiline
                  maxLength={120}
                />
              </View>
            )}

            {/* Streak badge */}
            <View style={styles.streakRow}>
              <View style={styles.streakBadge}>
                <Flame color="#FF6B00" size={14} fill="#FF6B00" />
                <Text style={styles.streakText}>{streak} day streak</Text>
              </View>
            </View>

            {/* Hero distance stat */}
            <View style={styles.heroStat}>
              <Text style={styles.heroNumber}>{heroDistanceStr}</Text>
              <Text style={styles.heroUnit}>{heroDistanceUnit}</Text>
            </View>
            <Text style={styles.heroLabel}>Total Distance</Text>

            {/* Secondary stats row */}
            <View style={styles.secondaryStats}>
              <View style={styles.secondaryStat}>
                <Text style={styles.secondaryValue}>{stats?.totalActivities || 0}</Text>
                <Text style={styles.secondaryLabel}>Activities</Text>
              </View>
              <View style={styles.secondaryDivider} />
              <View style={styles.secondaryStat}>
                <Text style={styles.secondaryValue}>{formatDuration(stats?.totalDuration || 0)}</Text>
                <Text style={styles.secondaryLabel}>Time</Text>
              </View>
              <View style={styles.secondaryDivider} />
              <View style={styles.secondaryStat}>
                <Text style={styles.secondaryValue}>{territoryCount}</Text>
                <Text style={styles.secondaryLabel}>Territories</Text>
              </View>
            </View>
          </View>

          {/* This Week card */}
          <View style={styles.weekSection}>
            <View style={styles.weekHeader}>
              <TrendingUp color="#E65100" size={18} />
              <Text style={styles.weekTitle}>This Week</Text>
            </View>
            <View style={styles.weekGrid}>
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{thisWeekStats.count}</Text>
                <Text style={styles.weekLabel}>Activities</Text>
              </View>
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{formatDistance(thisWeekStats.distance)}</Text>
                <Text style={styles.weekLabel}>Distance</Text>
              </View>
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{formatDuration(thisWeekStats.duration)}</Text>
                <Text style={styles.weekLabel}>Time</Text>
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
                  activeOpacity={0.7}
                >
                  <View style={styles.activityLeft}>
                    <View style={styles.activityIconContainer}>
                      {getActivityTypeIcon(activity.type)}
                    </View>
                    <View style={styles.activityDateCol}>
                      <Text style={styles.activityDay}>
                        {new Date(activity.startTime).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                      </Text>
                      <Text style={styles.activityDayNum}>
                        {new Date(activity.startTime).getDate()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.activityCenter}>
                    <Text style={styles.activityType}>{activity.type}</Text>
                    <View style={styles.activityMetrics}>
                      <Text style={styles.activityMetricValue}>{formatDistance(activity.distance)}</Text>
                      <Text style={styles.activityMetricSep}>  </Text>
                      <Text style={styles.activityMetricValue}>{Math.floor(activity.duration / 60)}min</Text>
                    </View>
                  </View>
                  <ChevronRight color="#CCCCCC" size={18} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Settings section */}
          <View style={styles.settingsSection}>
            <TouchableOpacity style={styles.settingsRow} onPress={handlePrivacyPolicy}>
              <Shield color="#666666" size={18} />
              <Text style={styles.settingsText}>Privacy Policy</Text>
              <ChevronRight color="#CCCCCC" size={16} />
            </TouchableOpacity>
          </View>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut color="#FF3B30" size={18} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Delete account */}
          <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
            <Trash2 color="#FF3B30" size={16} />
            <Text style={styles.deleteAccountText}>Delete Account</Text>
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
    backgroundColor: '#1A1A1A',
  },
  scrollContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Hero section - dark header
  heroSection: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: {
    marginRight: 14,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  nameBlock: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bio: {
    fontSize: 13,
    color: '#999999',
    marginTop: 2,
  },
  editBtn: {
    padding: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editActionBtn: {
    padding: 8,
  },
  bioSection: {
    marginTop: 12,
  },
  bioInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  streakRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B00',
  },

  // Hero stat
  heroStat: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 24,
  },
  heroNumber: {
    fontSize: 64,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 68,
    letterSpacing: -2,
  },
  heroUnit: {
    fontSize: 22,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
    marginLeft: 4,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 4,
  },

  // Secondary stats
  secondaryStats: {
    flexDirection: 'row',
    marginTop: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingVertical: 16,
  },
  secondaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  secondaryValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  secondaryLabel: {
    fontSize: 11,
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },

  // This Week section
  weekSection: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 18,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  weekTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  weekGrid: {
    flexDirection: 'row',
  },
  weekItem: {
    flex: 1,
    alignItems: 'center',
  },
  weekValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E65100',
  },
  weekLabel: {
    fontSize: 11,
    color: '#999999',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty state
  emptyMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginVertical: 32,
    fontStyle: 'italic',
  },

  // Activities section
  activitiesSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 14,
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityDateCol: {
    alignItems: 'center',
    width: 32,
  },
  activityDay: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 0.5,
  },
  activityDayNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 22,
  },
  activityCenter: {
    flex: 1,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activityMetrics: {
    flexDirection: 'row',
    marginTop: 3,
  },
  activityMetricValue: {
    fontSize: 13,
    color: '#666666',
  },
  activityMetricSep: {
    fontSize: 13,
    color: '#CCCCCC',
  },

  // Sign out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 32,
    marginBottom: 40,
    gap: 8,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },

  // Settings section
  settingsSection: {
    marginHorizontal: 20,
    marginTop: 32,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  settingsText: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
  },

  // Delete account
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 40,
    gap: 6,
  },
  deleteAccountText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.7,
  },
});
