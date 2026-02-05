import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { User, Flame, Activity, BarChart3, Pencil, Check, X, ChevronRight, MapPin, Clock } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { UserProfile, Activity as ActivityType } from '../lib/types';

interface ProfileScreenProps {
  navigation: any;
}

export default function ProfileScreen({ navigation }: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [stats, setStats] = useState<{
    totalActivities: number;
    totalDistance: number;
    totalDuration: number;
    byType: { [key: string]: { count: number; distance: number; duration: number } };
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState('');
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
    setEditUsername(profile?.username || '');
    setEditBio(profile?.bio || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveEdits = async () => {
    const trimmed = editUsername.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    if (trimmed.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    setSaving(true);
    try {
      await AuthService.updateProfile({
        username: trimmed,
        bio: editBio.trim(),
      });
      setProfile(prev => prev ? { ...prev, username: trimmed, bio: editBio.trim() } : prev);
      setIsEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'search') => {
    if (tab === 'home') {
      navigation.navigate('Home');
    } else if (tab === 'record') {
      navigation.navigate('Record');
    } else if (tab === 'search') {
      navigation.navigate('Search');
    }
  };

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
          <View style={styles.content}>
            <View style={styles.header}>
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

            <View style={styles.profileSection}>
              <View style={styles.avatarContainer}>
                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <User color="#E65100" size={40} />
                  </View>
                )}
              </View>

              <View style={styles.userInfo}>
                {isEditing ? (
                  <TextInput
                    style={styles.editInput}
                    value={editUsername}
                    onChangeText={setEditUsername}
                    placeholder="Username"
                    placeholderTextColor="#999999"
                    autoCapitalize="none"
                    maxLength={24}
                  />
                ) : (
                  <Text style={styles.username}>{profile?.username || 'your_username'}</Text>
                )}
                <Text style={styles.runsCount}>
                  runs{'\n'}{stats?.totalActivities || 0}
                </Text>
              </View>

              <View style={styles.streakContainer}>
                <Flame color="#FF6B00" size={20} fill="#FF6B00" />
                <Text style={styles.streakCount}>{streak}</Text>
              </View>
            </View>

            {activities.length === 0 && (
              <Text style={styles.emptyMessage}>do your first run !</Text>
            )}

            <View style={styles.dashboardSection}>
              <Text style={styles.sectionTitle}>Your Activities</Text>

              {activities.length > 0 ? (
                activities.slice(0, 10).map((activity) => (
                  <TouchableOpacity
                    key={activity.id}
                    style={styles.activityCard}
                    onPress={() => navigation.navigate('ActivityDetails', { activityId: activity.id })}
                  >
                    <View style={styles.activityIcon}>
                      <Activity color="#E65100" size={20} />
                    </View>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityType}>{activity.type}</Text>
                      <View style={styles.activityStats}>
                        <View style={styles.activityStat}>
                          <MapPin color="#999999" size={12} />
                          <Text style={styles.activityStatText}>
                            {activity.distance < 1000
                              ? `${Math.round(activity.distance)}m`
                              : `${(activity.distance / 1000).toFixed(2)}km`}
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
                ))
              ) : null}
            </View>

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

            <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
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
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
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
  profileSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  runsCount: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'left',
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 32,
    fontStyle: 'italic',
  },
  dashboardSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
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
  activityStats: {
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
  editInput: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#E65100',
    paddingVertical: 4,
    marginBottom: 8,
  },
  bioSection: {
    marginBottom: 24,
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
  signOutButton: {
    backgroundColor: '#F5F5F5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
