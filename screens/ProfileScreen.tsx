import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert, ActionSheetIOS, Platform, Switch, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, Pencil, Check, X, ChevronRight, Footprints, Bike, PersonStanding, LogOut, Trash2, Shield, Camera, Zap, Users } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';
import { EventModeService } from '../services/EventModeService';
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
  const [isDevUser, setIsDevUser] = useState(false);
  const [eventModeEnabled, setEventModeEnabled] = useState(false);
  const [togglingEventMode, setTogglingEventMode] = useState(false);
  const [eventNameModalVisible, setEventNameModalVisible] = useState(false);
  const [eventNameInput, setEventNameInput] = useState('');
  const [eventDuration, setEventDuration] = useState(120); // minutes

  const initialLoadComplete = React.useRef(false);
  const isFetching = React.useRef(false);
  const lastFetchTimeRef = React.useRef(0);

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

        const isDev = EventModeService.isDevUser(session.user.email);
        setIsDevUser(isDev);
        if (isDev) {
          const eventMode = await EventModeService.getEventMode();
          setEventModeEnabled(eventMode);
        }
      }
    } catch (err) {
      console.error('Fetch data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetching.current = false;
      lastFetchTimeRef.current = Date.now();
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
      const STALENESS_MS = 60_000;
      if (Date.now() - lastFetchTimeRef.current < STALENESS_MS) return;
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

                      await Promise.allSettled([
                        supabase.from('analytics_events').delete().eq('user_id', userId),
                        supabase.from('territory_invasions').delete().or(`invaded_user_id.eq.${userId},invader_user_id.eq.${userId}`),
                        supabase.from('post_comments').delete().eq('user_id', userId),
                        supabase.from('post_likes').delete().eq('user_id', userId),
                        supabase.from('posts').delete().eq('user_id', userId),
                        supabase.from('friendships').delete().or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
                        supabase.from('territories').delete().eq('owner_id', userId),
                        supabase.from('activities').delete().eq('user_id', userId),
                        supabase.from('user_reports').delete().eq('reporter_id', userId),
                        supabase.from('user_reports').delete().eq('reported_user_id', userId),
                        supabase.from('user_blocks').delete().eq('blocker_id', userId),
                        supabase.from('user_blocks').delete().eq('blocked_id', userId),
                      ]);

                      await supabase.from('users').delete().eq('id', userId);
                      await supabase.auth.signOut();
                    } catch (err) {
                      console.error('Account deletion error:', err);
                      Alert.alert('Error', 'Failed to delete account. Please try again or contact support at conqrrunning@gmail.com');
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

  const handleToggleEventMode = (newValue: boolean) => {
    if (togglingEventMode) return;

    if (!newValue) {
      Alert.alert(
        'End Event?',
        'This will end the event for all participants. Territories claimed during the event will be preserved. Normal territory conquering resumes for future activities.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Event',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Are you sure?',
                'This cannot be undone. The event will be archived to past events.',
                [
                  { text: 'Go Back', style: 'cancel' },
                  {
                    text: 'Yes, End Event',
                    style: 'destructive',
                    onPress: async () => {
                      setTogglingEventMode(true);
                      const result = await EventModeService.endEvent();
                      if (result.success) {
                        setEventModeEnabled(false);
                        Alert.alert('Event Ended', 'The event has been archived. Normal territory conquering is restored.');
                      } else {
                        Alert.alert('Error', result.error || 'Failed to end event.');
                      }
                      setTogglingEventMode(false);
                    },
                  },
                ]
              );
            },
          },
        ]
      );
    } else {
      setEventNameInput('');
      setEventDuration(120);
      setEventNameModalVisible(true);
    }
  };

  const handleStartEvent = async () => {
    const name = eventNameInput.trim();
    if (!name) {
      Alert.alert('Event Name Required', 'Please enter a name for the event.');
      return;
    }
    setEventNameModalVisible(false);
    setTogglingEventMode(true);
    const result = await EventModeService.startEvent(name, eventDuration);
    if (result.success) {
      setEventModeEnabled(true);
    } else {
      Alert.alert('Error', result.error || 'Failed to start event.');
    }
    setTogglingEventMode(false);
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
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'record') navigation.navigate('Record');
    else if (tab === 'friends') navigation.navigate('Friends');
    else if (tab === 'leaderboard') navigation.navigate('Leaderboard');
    else if (tab === 'feed') navigation.navigate('Feed');
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'RUN': return <Footprints color="#E65100" size={16} />;
      case 'RIDE': return <Bike color="#E65100" size={16} />;
      case 'WALK': return <PersonStanding color="#E65100" size={16} />;
      default: return <Footprints color="#E65100" size={16} />;
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

  const memberSince = useMemo(() => {
    if (!profile?.createdAt) return '';
    return new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [profile?.createdAt]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" />
      </View>
    );
  }

  const totalDist = stats?.totalDistance || 0;
  const distStr = totalDist < 1000 ? `${Math.round(totalDist)} m` : `${(totalDist / 1000).toFixed(1)} km`;

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {isEditing ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={cancelEditing} style={styles.headerBtn} activeOpacity={0.6}>
                <X color="#999999" size={20} />
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdits} disabled={saving} style={styles.headerBtn} activeOpacity={0.6}>
                {saving ? <ActivityIndicator size="small" color="#E65100" /> : <Check color="#E65100" size={20} />}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={startEditing} style={styles.headerBtn} activeOpacity={0.6}>
              <Pencil color="#999999" size={18} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E65100"
              colors={['#E65100']}
            />
          }
        >
          {/* Identity */}
          <View style={styles.identity}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handleChangeAvatar}
              disabled={updatingAvatar}
              activeOpacity={0.8}
            >
              <View style={styles.avatarBorder}>
                {updatingAvatar ? (
                  <View style={styles.avatarFallback}>
                    <ActivityIndicator color="#E65100" size="small" />
                  </View>
                ) : profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <User color="#E65100" size={32} />
                  </View>
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Camera color="#FFFFFF" size={11} />
              </View>
            </TouchableOpacity>

            <Text style={styles.username}>{profile?.username || 'your_username'}</Text>

            {profile?.bio && !isEditing ? (
              <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
            ) : null}

            {memberSince ? (
              <Text style={styles.memberSince}>Joined {memberSince}</Text>
            ) : null}

            {isEditing && (
              <TextInput
                style={styles.bioInput}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Add a bio..."
                placeholderTextColor="#BBBBBB"
                multiline
                maxLength={120}
              />
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats?.totalActivities || 0}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{distStr}</Text>
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

          {/* This Week */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>This Week</Text>
            <View style={styles.weekCard}>
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{thisWeekStats.count}</Text>
                <Text style={styles.weekLabel}>Activities</Text>
              </View>
              <View style={styles.weekDivider} />
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{formatDistance(thisWeekStats.distance)}</Text>
                <Text style={styles.weekLabel}>Distance</Text>
              </View>
              <View style={styles.weekDivider} />
              <View style={styles.weekItem}>
                <Text style={styles.weekValue}>{formatDuration(thisWeekStats.duration)}</Text>
                <Text style={styles.weekLabel}>Time</Text>
              </View>
            </View>
          </View>

          {/* Empty State */}
          {activities.length === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No activities yet</Text>
              <Text style={styles.emptySubtext}>Record your first activity to claim territory</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('Record')}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Start Recording</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Recent Activities */}
          {activities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Recent Activities</Text>
              {activities.slice(0, 10).map((activity) => (
                <TouchableOpacity
                  key={activity.id}
                  style={styles.activityRow}
                  onPress={() => navigation.navigate('ActivityDetails', { activityId: activity.id })}
                  activeOpacity={0.6}
                >
                  <View style={styles.activityIcon}>
                    {getActivityTypeIcon(activity.type)}
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>
                      {activity.type === 'RUN' ? 'Run' : activity.type === 'RIDE' ? 'Ride' : 'Walk'}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {formatDistance(activity.distance)}
                      {'  '}
                      {formatDuration(activity.duration)}
                      {activity.averageSpeed && activity.averageSpeed > 0
                        ? `  ${Math.floor(1000 / activity.averageSpeed / 60)}:${Math.floor((1000 / activity.averageSpeed) % 60).toString().padStart(2, '0')} /km`
                        : ''}
                    </Text>
                  </View>
                  <Text style={styles.activityDate}>
                    {new Date(activity.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                  <ChevronRight color="#CCCCCC" size={16} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Event Mode (dev only) */}
          {isDevUser && (
            <View style={styles.section}>
              <View style={styles.card}>
                <View style={styles.menuRow}>
                  <Zap color={eventModeEnabled ? '#E65100' : '#999999'} size={18} />
                  <Text style={[styles.menuText, eventModeEnabled && styles.menuTextActive]}>Event Mode</Text>
                  {togglingEventMode ? (
                    <ActivityIndicator size="small" color="#E65100" />
                  ) : (
                    <Switch
                      value={eventModeEnabled}
                      onValueChange={handleToggleEventMode}
                      trackColor={{ false: '#E0E0E0', true: 'rgba(230, 81, 0, 0.4)' }}
                      thumbColor={eventModeEnabled ? '#E65100' : '#CCCCCC'}
                    />
                  )}
                </View>
                {eventModeEnabled && (
                  <Text style={styles.eventHint}>Territory conquering is disabled. All claims coexist.</Text>
                )}
              </View>
            </View>
          )}

          {/* Settings */}
          <View style={styles.section}>
            <View style={styles.card}>
              <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Friends')} activeOpacity={0.6}>
                <Users color="#999999" size={18} />
                <Text style={styles.menuText}>Friends</Text>
                <ChevronRight color="#CCCCCC" size={16} />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuRow} onPress={handlePrivacyPolicy} activeOpacity={0.6}>
                <Shield color="#999999" size={18} />
                <Text style={styles.menuText}>Privacy Policy</Text>
                <ChevronRight color="#CCCCCC" size={16} />
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuRow} onPress={handleSignOut} activeOpacity={0.6}>
                <LogOut color="#FF3B30" size={18} />
                <Text style={[styles.menuText, styles.menuTextDanger]}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.6}>
            <Trash2 color="#FF3B30" size={12} />
            <Text style={styles.deleteText}>Delete Account</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      <BottomTabBar activeTab="profile" onTabPress={handleTabPress} />

      {/* Event Name Modal */}
      <Modal
        visible={eventNameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEventNameModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Start Event</Text>
            <Text style={styles.modalSubtitle}>
              Enter a name for this event. It will appear on the leaderboard.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={eventNameInput}
              onChangeText={setEventNameInput}
              placeholder="e.g. Spring Challenge 2025"
              placeholderTextColor="#999"
              autoFocus
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={handleStartEvent}
            />
            <Text style={styles.modalDurationLabel}>Duration</Text>
            <View style={styles.modalDurationRow}>
              {[60, 120, 180].map(mins => (
                <TouchableOpacity
                  key={mins}
                  style={[styles.modalDurationBtn, eventDuration === mins && styles.modalDurationBtnActive]}
                  onPress={() => setEventDuration(mins)}
                >
                  <Text style={[styles.modalDurationBtnText, eventDuration === mins && styles.modalDurationBtnTextActive]}>
                    {mins / 60}h
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEventNameModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !eventNameInput.trim() && styles.modalConfirmDisabled]}
                onPress={handleStartEvent}
                disabled={!eventNameInput.trim()}
              >
                <Text style={styles.modalConfirmText}>Start Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  // Header — matches Leaderboard, Feed, Friends
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // Identity
  identity: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarBorder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#E65100',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(230, 81, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  username: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 48,
    lineHeight: 20,
  },
  memberSince: {
    fontSize: 12,
    color: '#999999',
    marginTop: 6,
    fontWeight: '500',
  },
  bioInput: {
    marginTop: 16,
    marginHorizontal: 32,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    color: '#1A1A1A',
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
    alignSelf: 'stretch',
  },

  // Stats strip
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 11,
    color: '#999999',
    marginTop: 3,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#F0F0F0',
  },

  // Sections
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999999',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // This Week
  weekCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 18,
  },
  weekItem: {
    flex: 1,
    alignItems: 'center',
  },
  weekValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E65100',
  },
  weekLabel: {
    fontSize: 11,
    color: '#999999',
    marginTop: 3,
    fontWeight: '600',
  },
  weekDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#F0F0F0',
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999999',
    marginTop: 4,
  },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#E65100',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Activity rows
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  activityMeta: {
    fontSize: 13,
    color: '#999999',
    marginTop: 2,
  },
  activityDate: {
    fontSize: 12,
    color: '#BBBBBB',
    marginRight: 4,
  },

  // Menu / Settings card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  menuTextActive: {
    color: '#E65100',
    fontWeight: '600',
  },
  menuTextDanger: {
    color: '#FF3B30',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginLeft: 48,
  },
  eventHint: {
    fontSize: 12,
    color: '#E65100',
    paddingHorizontal: 48,
    paddingBottom: 12,
    marginTop: -6,
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  deleteText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.6,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#F5F5F5',
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E65100',
    alignItems: 'center',
  },
  modalConfirmDisabled: {
    backgroundColor: '#CCCCCC',
  },
  modalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalDurationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
    marginTop: 4,
  },
  modalDurationRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  modalDurationBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  modalDurationBtnActive: {
    backgroundColor: '#E65100',
  },
  modalDurationBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
  },
  modalDurationBtnTextActive: {
    color: '#FFFFFF',
  },
});
