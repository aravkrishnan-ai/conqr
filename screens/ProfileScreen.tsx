import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert, ActionSheetIOS, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, Flame, Pencil, Check, X, ChevronRight, MapPin, Clock, Footprints, Bike, PersonStanding, LogOut, Map, TrendingUp, Trash2, Shield, Camera } from 'lucide-react-native';
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
  const [updatingAvatar, setUpdatingAvatar] = useState(false);

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

  const handleChangeAvatar = async () => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    const cancelIndex = 2;

    const handleSelection = async (index: number) => {
      if (index === cancelIndex) return;

      setUpdatingAvatar(true);
      try {
        const ImagePicker = await import('expo-image-picker');

        if (index === 0) {
          // Take photo
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera access is needed to take a profile photo.');
            setUpdatingAvatar(false);
            return;
          }

          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
          });

          if (!result.canceled && result.assets?.[0]?.base64) {
            const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
            await saveAvatar(base64Uri);
          }
        } else if (index === 1) {
          // Choose from library
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library access is needed to choose a profile picture.');
            setUpdatingAvatar(false);
            return;
          }

          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
            base64: true,
          });

          if (!result.canceled && result.assets?.[0]?.base64) {
            const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
            await saveAvatar(base64Uri);
          }
        }
      } catch (err: any) {
        console.error('Image picker error:', err);
        Alert.alert('Not Available', 'Photo picker is not available. Please update the app to use this feature.');
      } finally {
        setUpdatingAvatar(false);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex },
        handleSelection
      );
    } else {
      // Android: use Alert as action sheet
      Alert.alert('Change Profile Picture', 'Choose an option', [
        { text: 'Take Photo', onPress: () => handleSelection(0) },
        { text: 'Choose from Library', onPress: () => handleSelection(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const saveAvatar = async (avatarUri: string) => {
    try {
      await AuthService.updateProfile({
        avatarUrl: avatarUri,
      });
      setProfile(prev => prev ? { ...prev, avatarUrl: avatarUri } : prev);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile picture');
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
      <StatusBar style="dark" />
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
          {/* Profile header */}
          <View style={styles.headerSection}>
            <View style={styles.headerTop}>
              <View style={{ width: 36 }} />
              <Text style={styles.headerTitle}>Profile</Text>
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

            {/* Centered avatar with camera overlay */}
            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={styles.avatarTouchable}
                onPress={handleChangeAvatar}
                disabled={updatingAvatar}
                activeOpacity={0.8}
              >
                <View style={styles.avatarRing}>
                  {updatingAvatar ? (
                    <View style={styles.avatarPlaceholder}>
                      <ActivityIndicator color="#E65100" size="small" />
                    </View>
                  ) : profile?.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <User color="#E65100" size={36} />
                    </View>
                  )}
                </View>
                <View style={styles.cameraOverlay}>
                  <Camera color="#FFFFFF" size={14} />
                </View>
              </TouchableOpacity>
              <Text style={styles.username}>{profile?.username || 'your_username'}</Text>
              {profile?.bio && !isEditing ? (
                <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
              ) : null}
            </View>

            {/* Bio editor */}
            {isEditing && (
              <View style={styles.bioSection}>
                <TextInput
                  style={styles.bioInput}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Add a bio..."
                  placeholderTextColor="#AAAAAA"
                  multiline
                  maxLength={120}
                />
              </View>
            )}
          </View>

          {/* Stats strip */}
          <View style={styles.statsStrip}>
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{stats?.totalActivities || 0}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{heroDistanceStr}<Text style={styles.statUnit}> {heroDistanceUnit}</Text></Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{formatDuration(stats?.totalDuration || 0)}</Text>
              <Text style={styles.statLabel}>Time</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statNumber}>{territoryCount}</Text>
              <Text style={styles.statLabel}>Territories</Text>
            </View>
          </View>

          {/* This Week card */}
          <View style={styles.weekCard}>
            <View style={styles.weekCardHeader}>
              <View style={styles.weekCardAccent} />
              <Text style={styles.weekCardTitle}>This Week</Text>
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
            <View style={styles.emptyState}>
              <Footprints color="#DDDDDD" size={40} />
              <Text style={styles.emptyText}>No activities yet</Text>
              <Text style={styles.emptySubtext}>Record your first run to see it here</Text>
            </View>
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
                  <View style={styles.activityAccent} />
                  <View style={styles.activityBody}>
                    <View style={styles.activityHeader}>
                      <View style={styles.activityTypeRow}>
                        {getActivityTypeIcon(activity.type)}
                        <Text style={styles.activityType}>
                          {activity.type === 'RUN' ? 'Run' : activity.type === 'RIDE' ? 'Ride' : 'Walk'}
                        </Text>
                      </View>
                      <Text style={styles.activityDate}>
                        {new Date(activity.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    <View style={styles.activityMetricsRow}>
                      <View style={styles.activityMetric}>
                        <Text style={styles.metricValue}>{formatDistance(activity.distance)}</Text>
                        <Text style={styles.metricLabel}>Distance</Text>
                      </View>
                      <View style={styles.activityMetric}>
                        <Text style={styles.metricValue}>{formatDuration(activity.duration)}</Text>
                        <Text style={styles.metricLabel}>Time</Text>
                      </View>
                      {activity.averageSpeed ? (
                        <View style={styles.activityMetric}>
                          <Text style={styles.metricValue}>{(activity.averageSpeed * 3.6).toFixed(1)} km/h</Text>
                          <Text style={styles.metricLabel}>Pace</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <ChevronRight color="#CCCCCC" size={18} style={{ marginRight: 12 }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Settings */}
          <View style={styles.settingsSection}>
            <TouchableOpacity style={styles.settingsRow} onPress={handlePrivacyPolicy}>
              <Shield color="#666666" size={18} />
              <Text style={styles.settingsText}>Privacy Policy</Text>
              <ChevronRight color="#CCCCCC" size={16} />
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <TouchableOpacity style={styles.settingsRow} onPress={handleSignOut}>
              <LogOut color="#FF3B30" size={18} />
              <Text style={[styles.settingsText, { color: '#FF3B30' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* Delete account */}
          <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
            <Trash2 color="#FF3B30" size={14} />
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </SafeAreaView>

      <BottomTabBar activeTab="profile" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },

  // Header
  headerSection: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  editBtn: {
    padding: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editActionBtn: {
    padding: 8,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingTop: 4,
  },
  avatarTouchable: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: '#E65100',
    padding: 2,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  bio: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  bioSection: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  bioInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    color: '#1A1A1A',
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
    paddingVertical: 20,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statUnit: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888888',
  },
  statLabel: {
    fontSize: 11,
    color: '#888888',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#EEEEEE',
  },

  // This Week
  weekCard: {
    backgroundColor: '#FFFFFF',
    marginTop: 8,
    marginHorizontal: 0,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  weekCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  weekCardAccent: {
    width: 4,
    height: 18,
    backgroundColor: '#E65100',
    borderRadius: 2,
  },
  weekCardTitle: {
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
    fontSize: 22,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#BBBBBB',
    marginTop: 4,
  },

  // Activities section
  activitiesSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888888',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 1,
    overflow: 'hidden',
  },
  activityAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#E65100',
  },
  activityBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activityTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  activityDate: {
    fontSize: 13,
    color: '#999999',
  },
  activityMetricsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  activityMetric: {},
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#999999',
    marginTop: 1,
  },

  // Settings
  settingsSection: {
    marginTop: 24,
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
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
  settingsDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 46,
  },

  // Delete account
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  deleteAccountText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.6,
  },
});
