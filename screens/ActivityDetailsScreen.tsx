import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, MapPin, Clock, Zap, Mountain, Map, ChevronRight } from 'lucide-react-native';
import { Activity, Territory, GPSPoint } from '../lib/types';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';

interface ActivityDetailsScreenProps {
  navigation: any;
  route?: {
    params?: {
      activityId?: string;
    };
  };
}

export default function ActivityDetailsScreen({ navigation, route }: ActivityDetailsScreenProps) {
  const activityId = route?.params?.activityId;
  const [activity, setActivity] = useState<Activity | null>(null);
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!activityId) {
        setLoading(false);
        return;
      }

      try {
        const activityData = await ActivityService.getActivity(activityId);
        setActivity(activityData);

        if (activityData?.territoryId) {
          const territories = await TerritoryService.getUserTerritories(activityData.userId);
          const linkedTerritory = territories.find(t => t.id === activityData.territoryId);
          setTerritory(linkedTerritory || null);
        }
      } catch (err) {
        console.error('Failed to load activity:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activityId]);

  // Calculate pace from average speed (m/s to min/km)
  const calculatePace = (speedMs: number): string => {
    if (!speedMs || speedMs <= 0) return '--:--';
    const paceSecondsPerKm = 1000 / speedMs;
    const minutes = Math.floor(paceSecondsPerKm / 60);
    const seconds = Math.floor(paceSecondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate incline/elevation gain from GPS points
  const calculateElevation = (polylines: GPSPoint[][]): { gain: number; loss: number; avgIncline: number } => {
    let totalGain = 0;
    let totalLoss = 0;
    let totalDistance = 0;

    for (const segment of polylines) {
      let prevAltitude: number | null = null;
      let prevPoint: GPSPoint | null = null;

      for (const point of segment) {
        if (point.altitude !== null && point.altitude !== undefined) {
          if (prevAltitude !== null) {
            const diff = point.altitude - prevAltitude;
            if (diff > 0) {
              totalGain += diff;
            } else {
              totalLoss += Math.abs(diff);
            }
          }
          prevAltitude = point.altitude;
        }

        if (prevPoint) {
          // Approximate distance for incline calculation
          const latDiff = point.lat - prevPoint.lat;
          const lngDiff = point.lng - prevPoint.lng;
          totalDistance += Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111000; // rough meters
        }
        prevPoint = point;
      }
    }

    // Calculate average incline percentage
    const avgIncline = totalDistance > 0 ? ((totalGain - totalLoss) / totalDistance) * 100 : 0;

    return { gain: totalGain, loss: totalLoss, avgIncline };
  };

  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Format area
  const formatArea = (sqMeters: number): string => {
    if (sqMeters < 10000) {
      return `${Math.round(sqMeters)} m²`;
    }
    return `${(sqMeters / 10000).toFixed(2)} ha`;
  };

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get incline level label
  const getInclineLevel = (avgIncline: number, gain: number): { label: string; color: string } => {
    if (gain < 5) {
      return { label: 'Flat', color: '#4CAF50' };
    } else if (avgIncline < 2 && gain < 20) {
      return { label: 'Easy', color: '#8BC34A' };
    } else if (avgIncline < 5 && gain < 50) {
      return { label: 'Moderate', color: '#FFC107' };
    } else if (avgIncline < 10 && gain < 100) {
      return { label: 'Challenging', color: '#FF9800' };
    } else {
      return { label: 'Steep', color: '#F44336' };
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" size="large" />
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Activity not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pace = calculatePace(activity.averageSpeed || 0);
  const elevation = calculateElevation(activity.polylines || []);
  const inclineLevel = getInclineLevel(elevation.avgIncline, elevation.gain);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft color="#1A1A1A" size={24} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Activity Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.dateSection}>
            <Text style={styles.activityType}>{activity.type}</Text>
            <Text style={styles.dateText}>{formatDate(activity.startTime)}</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <MapPin color="#E65100" size={24} />
              </View>
              <Text style={styles.statValue}>{formatDistance(activity.distance)}</Text>
              <Text style={styles.statLabel}>Distance</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Zap color="#E65100" size={24} />
              </View>
              <Text style={styles.statValue}>{pace}</Text>
              <Text style={styles.statLabel}>Pace (min/km)</Text>
            </View>

            <View style={styles.statCard}>
              <View style={styles.statIcon}>
                <Clock color="#E65100" size={24} />
              </View>
              <Text style={styles.statValue}>{formatDuration(activity.duration)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: `${inclineLevel.color}20` }]}>
                <Mountain color={inclineLevel.color} size={24} />
              </View>
              <Text style={[styles.statValue, { color: inclineLevel.color }]}>{inclineLevel.label}</Text>
              <Text style={styles.statLabel}>Incline Level</Text>
            </View>
          </View>

          <View style={styles.elevationSection}>
            <Text style={styles.sectionTitle}>Elevation</Text>
            <View style={styles.elevationRow}>
              <View style={styles.elevationItem}>
                <Text style={styles.elevationValue}>+{Math.round(elevation.gain)}m</Text>
                <Text style={styles.elevationLabel}>Gain</Text>
              </View>
              <View style={styles.elevationDivider} />
              <View style={styles.elevationItem}>
                <Text style={styles.elevationValue}>-{Math.round(elevation.loss)}m</Text>
                <Text style={styles.elevationLabel}>Loss</Text>
              </View>
            </View>
          </View>

          {territory ? (
            <View style={styles.territorySection}>
              <Text style={styles.sectionTitle}>Territory Claimed</Text>
              <TouchableOpacity
                style={styles.territoryCard}
                activeOpacity={0.7}
                onPress={() => {
                  navigation.navigate('Home', {
                    focusTerritoryLat: territory.center.lat,
                    focusTerritoryLng: territory.center.lng,
                  });
                }}
              >
                <View style={styles.territoryIcon}>
                  <Map color="#E65100" size={28} />
                </View>
                <View style={styles.territoryInfo}>
                  <Text style={styles.territoryName}>{territory.name || 'Unnamed Territory'}</Text>
                  <Text style={styles.territoryArea}>{formatArea(territory.area)}</Text>
                  <Text style={styles.territoryPerimeter}>Perimeter: {formatDistance(territory.perimeter)}</Text>
                </View>
                <ChevronRight color="#E65100" size={20} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noTerritorySection}>
              <Text style={styles.sectionTitle}>Territory</Text>
              <View style={styles.noTerritoryCard}>
                <Map color="#999999" size={24} />
                <Text style={styles.noTerritoryText}>No territory claimed on this activity</Text>
                <Text style={styles.noTerritoryHint}>Complete a loop to claim territory!</Text>
              </View>
            </View>
          )}
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
    padding: 20,
  },
  dateSection: {
    marginBottom: 24,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    color: '#666666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 24,
  },
  statCard: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 13,
    color: '#666666',
  },
  elevationSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  elevationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  elevationItem: {
    flex: 1,
    alignItems: 'center',
  },
  elevationValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  elevationLabel: {
    fontSize: 13,
    color: '#666666',
  },
  elevationDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
  },
  territorySection: {
    marginBottom: 24,
  },
  territoryCard: {
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  territoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  territoryInfo: {
    flex: 1,
  },
  territoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  territoryArea: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 2,
  },
  territoryPerimeter: {
    fontSize: 13,
    color: '#666666',
  },
  noTerritorySection: {
    marginBottom: 24,
  },
  noTerritoryCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  noTerritoryText: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
    textAlign: 'center',
  },
  noTerritoryHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
    fontStyle: 'italic',
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
