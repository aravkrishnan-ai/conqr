import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Footprints, Bike, PersonStanding, Trophy, MapPin, Clock, Gauge, Map, X, Swords, Share2 } from 'lucide-react-native';
import MapContainer, { MapContainerHandle } from '../components/MapContainer';
import BottomTabBar from '../components/BottomTabBar';
import { LocationService } from '../services/LocationService';
import { GameEngine } from '../services/GameEngine';
import { TerritoryService } from '../services/TerritoryService';
import { ActivityService } from '../services/ActivityService';
import { AuthService } from '../services/AuthService';
import { TrackingStore } from '../services/TrackingStore';
import { GPSPoint, ActivityType, Territory, Activity, ConquerResult } from '../lib/types';
import SharePreviewModal from '../components/SharePreviewModal';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { useScreenTracking } from '../lib/useScreenTracking';
import { AnalyticsService } from '../services/AnalyticsService';

interface RecordScreenProps {
  navigation: any;
}

export default function RecordScreen({ navigation }: RecordScreenProps) {
  useScreenTracking('Record');

  // Map display state (local to this component)
  const [location, setLocation] = React.useState<GPSPoint | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [savedTerritories, setSavedTerritories] = React.useState<Territory[]>([]);

  // Tracking state — synced from TrackingStore (persists across navigation)
  const [path, setPath] = React.useState<GPSPoint[]>(TrackingStore.path);
  const [isTracking, setIsTracking] = React.useState(TrackingStore.isTracking);
  const [activityType, setActivityType] = React.useState<ActivityType | null>(TrackingStore.activityType);
  const [trackingStartTime, setTrackingStartTime] = React.useState<number | null>(TrackingStore.startTime);
  const [currentDistance, setCurrentDistance] = React.useState(TrackingStore.runningDistance);

  // Local UI state
  const [elapsedTime, setElapsedTime] = React.useState(0);
  const [currentSpeed, setCurrentSpeed] = React.useState(0);
  const [showActivityPicker, setShowActivityPicker] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [showShareModal, setShowShareModal] = React.useState(false);
  const [completedActivity, setCompletedActivity] = React.useState<Activity | null>(null);
  const [completedTerritory, setCompletedTerritory] = React.useState<Territory | null>(null);
  const [successModal, setSuccessModal] = React.useState<{
    visible: boolean;
    title: string;
    distance: string;
    duration: string;
    pace: string;
    territory?: string;
    conquered?: string;
    message?: string;
  }>({ visible: false, title: '', distance: '', duration: '', pace: '' });

  const mapRef = React.useRef<MapContainerHandle>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Load territories on mount
  React.useEffect(() => {
    const loadTerritories = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const territories = await TerritoryService.getUserTerritories(session.user.id);
          setSavedTerritories(territories);
        }
      } catch (err) {
        console.error('Failed to load territories:', err);
      }
    };
    loadTerritories();
  }, []);

  // Subscribe to TrackingStore for persistent tracking state
  React.useEffect(() => {
    const syncFromStore = () => {
      setIsTracking(TrackingStore.isTracking);
      setPath(TrackingStore.path);
      setCurrentDistance(TrackingStore.runningDistance);
      setActivityType(TrackingStore.activityType);
      setTrackingStartTime(TrackingStore.startTime);
    };

    // Sync initial state (handles returning to screen during active tracking)
    syncFromStore();
    if (TrackingStore.isTracking && TrackingStore.startTime) {
      setElapsedTime(Math.floor((Date.now() - TrackingStore.startTime) / 1000));
    }

    const unsubscribe = TrackingStore.subscribe(syncFromStore);
    return unsubscribe;
  }, []);

  // Location subscription for map display only (separate from tracking)
  React.useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    const start = async () => {
      try {
        unsubscribe = await LocationService.startTracking(
          (point) => {
            if (!mounted) return;
            setLocationError(null);
            setLocation(point);
          },
          (error) => {
            if (!mounted) return;
            setLocationError(error?.message || 'Location access denied');
          }
        );
      } catch {
        if (mounted) setLocationError('Failed to start location tracking');
      }
    };

    start();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
      // Do NOT release WakeLock or stop tracking here — TrackingStore manages that
    };
  }, []);

  // Timer for elapsed time and speed (recomputed locally)
  React.useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isTracking && trackingStartTime) {
      const updateStats = () => {
        const elapsed = Math.floor((Date.now() - trackingStartTime) / 1000);
        setElapsedTime(elapsed);

        const storePath = TrackingStore.path;
        const recentPath = storePath.slice(-5);
        if (recentPath.length >= 2) {
          const recentSpeeds = recentPath
            .map(p => p.speed)
            .filter((s): s is number => s !== null && s !== undefined && s >= 0);
          if (recentSpeeds.length > 0) {
            setCurrentSpeed(recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length);
          }
        }
      };

      updateStats();
      timerRef.current = setInterval(updateStats, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isTracking, trackingStartTime]);

  const handleStartPress = async () => {
    if (locationError) {
      Alert.alert("Location Required", "Please enable location access to use CONQR.");
      return;
    }

    if (isSaving) return;

    if (isTracking) {
      // Stop tracking — get final accumulated state from the store
      setIsSaving(true);
      const trackingResult = TrackingStore.stop();

      const currentPath = trackingResult.path;
      const currentActivityType = trackingResult.activityType;
      const startTime = trackingResult.startTime || Date.now();
      const endTime = Date.now();

      const SAVE_TIMEOUT_MS = 20000;
      const saveTimeout = setTimeout(() => {
        setIsSaving(false);
        resetTrackingState();
        Alert.alert("Save Timeout", "Activity save took too long.");
      }, SAVE_TIMEOUT_MS);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || 'anonymous';
        const activityId = uuidv4();

        const distance = ActivityService.calculateDistance(currentPath);
        const duration = Math.round((endTime - startTime) / 1000);
        const averageSpeed = ActivityService.calculateAverageSpeed(currentPath);
        const currentArea = GameEngine.calculateArea(currentPath);

        let savedTerritory: Territory | null = null;
        let conqueredArea = 0;
        const { isClosed } = GameEngine.checkLoopClosure(currentPath);

        if (isClosed && currentArea > 0) {
          const territory = GameEngine.processTerritory(currentPath, userId, activityId);
          if (territory) {
            let username: string | undefined;
            try {
              const currentProfile = await AuthService.getCurrentProfile();
              if (currentProfile?.username) {
                territory.ownerName = currentProfile.username;
                username = currentProfile.username;
              }
            } catch { /* proceed without ownerName */ }

            // Fetch all territories to check for overlaps
            let allTerritories: Territory[] = [];
            try {
              allTerritories = await TerritoryService.getAllTerritories();
            } catch (err) {
              console.error('Failed to fetch territories for overlap check:', err);
            }

            // Use conquering flow
            const conquerResult = await TerritoryService.saveTerritoryWithConquering(
              territory, allTerritories, username
            );

            savedTerritory = conquerResult.newTerritory;
            conqueredArea = conquerResult.totalConqueredArea;

            AnalyticsService.trackEvent('territory_claimed', {
              area: savedTerritory?.area,
              conqueredArea,
              hadInvasion: conqueredArea > 0,
            });

            // Update local territory state to reflect modifications
            setSavedTerritories(prev => {
              let updated = [...prev];
              // Remove deleted territories
              updated = updated.filter(t => !conquerResult.deletedTerritoryIds.includes(t.id));
              // Update modified territories
              for (const mod of conquerResult.modifiedTerritories) {
                const idx = updated.findIndex(t => t.id === mod.id);
                if (idx >= 0) updated[idx] = mod;
              }
              // Add new territory
              updated.unshift(savedTerritory!);
              return updated;
            });
          }
        }

        const activity: Activity = {
          id: activityId,
          userId,
          type: currentActivityType || 'WALK',
          startTime,
          endTime,
          distance,
          duration,
          polylines: [currentPath],
          isSynced: false,
          territoryId: savedTerritory?.id,
          averageSpeed
        };

        const savedActivity = await ActivityService.saveActivity(activity);

        AnalyticsService.trackEvent('activity_saved');
        AnalyticsService.trackEvent('activity_completed', {
          activityType: currentActivityType,
          distance,
          duration,
          loopClosed: !!savedTerritory,
        });

        // Store completed data for share card (before reset clears state)
        setCompletedActivity(activity);
        setCompletedTerritory(savedTerritory || null);

        if (savedActivity) {
          const durationFormatted = ActivityService.formatDuration(duration);
          const paceFormatted = averageSpeed > 0 ? ActivityService.calculatePace(averageSpeed) : '--:--';

          if (savedTerritory) {
            setSuccessModal({
              visible: true,
              title: conqueredArea > 0 ? 'Territory Invaded!' : 'Territory Conquered!',
              distance: `${(distance / 1000).toFixed(2)} km`,
              duration: durationFormatted,
              pace: `${paceFormatted} /km`,
              territory: `${(savedTerritory.area / 1000000).toFixed(4)} km²`,
              conquered: conqueredArea > 0
                ? `${(conqueredArea / 1000000).toFixed(4)} km²`
                : undefined,
            });
          } else {
            setSuccessModal({
              visible: true,
              title: 'Activity Saved!',
              distance: `${(distance / 1000).toFixed(2)} km`,
              duration: durationFormatted,
              pace: `${paceFormatted} /km`,
              message: 'Close your loop to claim territory!'
            });
          }
        } else {
          Alert.alert("Activity Too Short", "Move more to record your activity.");
        }
      } catch {
        Alert.alert("Error", "Failed to save activity.");
      } finally {
        clearTimeout(saveTimeout);
        setIsSaving(false);
        resetTrackingState();
      }
    } else {
      setShowActivityPicker(true);
    }
  };

  const resetTrackingState = () => {
    setElapsedTime(0);
    setCurrentSpeed(0);
  };

  const startTracking = async (type: ActivityType) => {
    setShowActivityPicker(false);
    setElapsedTime(0);
    setCurrentSpeed(0);
    await TrackingStore.start(type);
    AnalyticsService.trackEvent('activity_started', { activityType: type });
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatPace = (speed: number): string => {
    if (speed <= 0) return '0.00';
    const paceSeconds = 1000 / speed;
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    if (mins > 99) return '0.00';
    return `${mins}.${secs.toString().padStart(2, '0')}`;
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') {
      navigation.navigate('Home');
    } else if (tab === 'profile') {
      navigation.navigate('Profile');
    } else if (tab === 'friends') {
      navigation.navigate('Friends');
    } else if (tab === 'leaderboard') {
      navigation.navigate('Leaderboard');
    } else if (tab === 'feed') {
      navigation.navigate('Feed');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.content}>
          <Text style={styles.mapsLabel}>maps</Text>

          <View style={styles.mapContainer}>
            <MapContainer
              ref={mapRef}
              location={location}
              path={path}
              territories={savedTerritories}
              style={styles.map}
            />
            <View style={styles.mapDivider} />
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {(currentDistance / 1000).toFixed(2)}km
                </Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDuration(elapsedTime)}</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatPace(currentSpeed)}</Text>
                <Text style={styles.statLabel}>Average pace</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.startButton,
                isTracking && styles.stopButton,
                isSaving && styles.savingButton
              ]}
              onPress={handleStartPress}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              <Text style={styles.startButtonText}>
                {isSaving ? 'saving...' : isTracking ? 'stop activity' : 'start activity'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <BottomTabBar activeTab="record" onTabPress={handleTabPress} />

      <Modal
        visible={showActivityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActivityPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowActivityPicker(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Activity</Text>

            <TouchableOpacity
              style={styles.activityRow}
              onPress={() => startTracking('RUN')}
            >
              <View style={styles.activityIcon}>
                <PersonStanding color="#E65100" size={24} />
              </View>
              <Text style={styles.activityName}>Run</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.activityRow}
              onPress={() => startTracking('WALK')}
            >
              <View style={styles.activityIcon}>
                <Footprints color="#E65100" size={24} />
              </View>
              <Text style={styles.activityName}>Walk</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.activityRow}
              onPress={() => startTracking('RIDE')}
            >
              <View style={styles.activityIcon}>
                <Bike color="#E65100" size={24} />
              </View>
              <Text style={styles.activityName}>Ride</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowActivityPicker(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={successModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessModal(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalContainer}>
            <TouchableOpacity
              style={styles.successModalClose}
              onPress={() => setSuccessModal(prev => ({ ...prev, visible: false }))}
            >
              <X color="#999999" size={24} />
            </TouchableOpacity>

            <View style={styles.successIconContainer}>
              <Trophy color="#FFFFFF" size={32} />
            </View>

            <Text style={styles.successTitle}>{successModal.title}</Text>

            <View style={styles.successStatsGrid}>
              <View style={styles.successStatBox}>
                <MapPin color="#E65100" size={20} />
                <Text style={styles.successStatValue}>{successModal.distance}</Text>
                <Text style={styles.successStatLabel}>Distance</Text>
              </View>
              <View style={styles.successStatBox}>
                <Clock color="#E65100" size={20} />
                <Text style={styles.successStatValue}>{successModal.duration}</Text>
                <Text style={styles.successStatLabel}>Duration</Text>
              </View>
              <View style={styles.successStatBox}>
                <Gauge color="#E65100" size={20} />
                <Text style={styles.successStatValue}>{successModal.pace}</Text>
                <Text style={styles.successStatLabel}>Pace</Text>
              </View>
              {successModal.territory && (
                <View style={styles.successStatBox}>
                  <Map color="#E65100" size={20} />
                  <Text style={styles.successStatValue}>{successModal.territory}</Text>
                  <Text style={styles.successStatLabel}>Territory</Text>
                </View>
              )}
              {successModal.conquered && (
                <View style={styles.successStatBox}>
                  <Swords color="#E65100" size={20} />
                  <Text style={styles.successStatValue}>{successModal.conquered}</Text>
                  <Text style={styles.successStatLabel}>Conquered</Text>
                </View>
              )}
            </View>

            {successModal.message && (
              <Text style={styles.successMessage}>{successModal.message}</Text>
            )}

            <View style={styles.successButtonRow}>
              <TouchableOpacity
                style={styles.successShareButton}
                onPress={() => {
                  setSuccessModal(prev => ({ ...prev, visible: false }));
                  setShowShareModal(true);
                }}
              >
                <Share2 color="#FFFFFF" size={18} />
                <Text style={styles.successShareText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successDoneButton}
                onPress={() => setSuccessModal(prev => ({ ...prev, visible: false }))}
              >
                <Text style={styles.successDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <SharePreviewModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        cardType="activity"
        activity={completedActivity || undefined}
        territory={completedTerritory || undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  mapsLabel: {
    fontSize: 18,
    color: '#333333',
    textAlign: 'center',
    paddingVertical: 16,
    fontWeight: '400',
  },
  mapContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  map: {
    flex: 1,
  },
  mapDivider: {
    height: 4,
    backgroundColor: '#333333',
    marginHorizontal: 60,
    borderRadius: 2,
    marginTop: 8,
  },
  statsContainer: {
    paddingVertical: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
    marginTop: 4,
  },
  startButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  savingButton: {
    backgroundColor: '#999999',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    textAlign: 'center',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  activityName: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '500',
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    position: 'relative' as const,
  },
  successModalClose: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    padding: 4,
  },
  successIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  successStatsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
    width: '100%',
  },
  successStatBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    minWidth: 100,
    flex: 1,
    maxWidth: '48%',
  },
  successStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 6,
  },
  successStatLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  successMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center' as const,
    marginBottom: 20,
    fontStyle: 'italic' as const,
  },
  successButtonRow: {
    flexDirection: 'row' as const,
    gap: 10,
    width: '100%',
  },
  successShareButton: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
    gap: 8,
  },
  successShareText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successDoneButton: {
    backgroundColor: '#E65100',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    flex: 1,
    alignItems: 'center',
  },
  successDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
