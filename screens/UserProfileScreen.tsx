import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, User, Activity, MapPin, Clock, Calendar } from 'lucide-react-native';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';
import { UserProfile, Activity as ActivityType, Territory } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';

interface UserProfileScreenProps {
  navigation: any;
  route?: {
    params?: {
      userId?: string;
    };
  };
}

export default function UserProfileScreen({ navigation, route }: UserProfileScreenProps) {
  useScreenTracking('UserProfile');
  const userId = route?.params?.userId;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [totalArea, setTotalArea] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      // Fetch independently so one failure doesn't break the others
      const [profileResult, activitiesResult, territoriesResult] = await Promise.allSettled([
        AuthService.getUserProfile(userId),
        ActivityService.getUserActivities(userId, false),
        TerritoryService.getUserTerritories(userId)
      ]);

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        console.error('Failed to load profile:', profileResult.reason);
      }

      if (activitiesResult.status === 'fulfilled') {
        setActivities(activitiesResult.value);
      } else {
        console.error('Failed to load activities:', activitiesResult.reason);
      }

      if (territoriesResult.status === 'fulfilled') {
        const userTerritories = territoriesResult.value;
        setTerritories(userTerritories);
        setTotalArea(userTerritories.reduce((sum, t) => sum + (t.area || 0), 0));
      } else {
        console.error('Failed to load territories:', territoriesResult.reason);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatArea = (sqMeters: number): string => {
    if (sqMeters < 10000) {
      return `${Math.round(sqMeters)} m²`;
    }
    return `${(sqMeters / 10000).toFixed(2)} ha`;
  };

  const getTotalStats = () => {
    const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
    const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    return { totalDistance, totalDuration, totalActivities: activities.length };
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>User not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stats = getTotalStats();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#1A1A1A" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerSpacer} />
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
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User color="#E65100" size={40} />
                </View>
              )}
            </View>
            <Text style={styles.username}>{profile.username}</Text>
            {profile.bio ? (
              <Text style={styles.bio}>{profile.bio}</Text>
            ) : null}
            <Text style={styles.joinDate}>
              <Calendar color="#999999" size={12} /> Joined {formatDate(profile.createdAt)}
            </Text>
          </View>

          <View style={styles.statsSection}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalActivities}</Text>
              <Text style={styles.statLabel}>Activities</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatDistance(stats.totalDistance)}</Text>
              <Text style={styles.statLabel}>Total Distance</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatArea(totalArea)}</Text>
              <Text style={styles.statLabel}>Territory</Text>
            </View>
          </View>

          {territories.length > 0 && (
            <View style={styles.territoriesSection}>
              <Text style={styles.sectionTitle}>Territories ({territories.length})</Text>
              {territories.slice(0, 5).map((territory) => (
                <TouchableOpacity
                  key={territory.id}
                  style={styles.territoryCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (territory.center && territory.center.lat && territory.center.lng) {
                      navigation.navigate('Home', {
                        focusTerritoryLat: territory.center.lat,
                        focusTerritoryLng: territory.center.lng,
                      });
                    }
                  }}
                >
                  <View style={styles.territoryIcon}>
                    <MapPin color="#E65100" size={20} />
                  </View>
                  <View style={styles.territoryInfo}>
                    <Text style={styles.territoryName}>
                      {territory.name || 'Territory'}
                    </Text>
                    <Text style={styles.territoryArea}>{formatArea(territory.area)}</Text>
                    <Text style={styles.territoryDate}>{formatDate(territory.claimedAt)}</Text>
                  </View>
                  <ArrowLeft color="#CCCCCC" size={16} style={{ transform: [{ rotate: '180deg' }] }} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.activitiesSection}>
            <Text style={styles.sectionTitle}>Recent Activities</Text>

            {activities.length === 0 ? (
              <View style={styles.noActivities}>
                <Activity color="#CCCCCC" size={32} />
                <Text style={styles.noActivitiesText}>No activities yet</Text>
              </View>
            ) : (
              activities.slice(0, 10).map((activity) => (
                <View key={activity.id} style={styles.activityCard}>
                  <View style={styles.activityIcon}>
                    <Activity color="#E65100" size={20} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityType}>{activity.type}</Text>
                    <View style={styles.activityStats}>
                      <View style={styles.activityStat}>
                        <MapPin color="#999999" size={12} />
                        <Text style={styles.activityStatText}>{formatDistance(activity.distance)}</Text>
                      </View>
                      <View style={styles.activityStat}>
                        <Clock color="#999999" size={12} />
                        <Text style={styles.activityStatText}>{formatDuration(activity.duration)}</Text>
                      </View>
                    </View>
                    <Text style={styles.activityDate}>{formatDate(activity.startTime)}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  joinDate: {
    fontSize: 12,
    color: '#999999',
  },
  statsSection: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 20,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E0E0E0',
  },
  territoriesSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  territoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  territoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  territoryInfo: {
    flex: 1,
  },
  territoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  territoryArea: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  territoryDate: {
    fontSize: 11,
    color: '#999999',
    marginTop: 2,
  },
  activitiesSection: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  noActivities: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noActivitiesText: {
    marginTop: 12,
    fontSize: 14,
    color: '#999999',
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
  errorText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#E65100',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
