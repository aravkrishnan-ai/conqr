import * as React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Swords, ShieldAlert, X, User, UserPlus, MapPin, Check, Zap, Crosshair, Map, Clock, Settings } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import MapContainer, { MapContainerHandle } from '../components/MapContainer';
import BottomTabBar from '../components/BottomTabBar';
import { Territory, GPSPoint, TerritoryInvasion } from '../lib/types';
import { TerritoryService } from '../services/TerritoryService';
import { ActivityService } from '../services/ActivityService';
import { FriendService } from '../services/FriendService';
import { LocationService } from '../services/LocationService';
import { EventModeService } from '../services/EventModeService';
import { supabase } from '../lib/supabase';
import { useScreenTracking } from '../lib/useScreenTracking';
import { showToast } from '../components/Toast';

const ONBOARDING_KEY = 'conqr_onboarding_shown_v1';
const LOCATION_DISCLOSURE_KEY = 'conqr_location_disclosure_v1';

interface HomeScreenProps {
  navigation: any;
  route?: {
    params?: {
      focusTerritoryLat?: number;
      focusTerritoryLng?: number;
    };
  };
}

export default function HomeScreen({ navigation, route }: HomeScreenProps) {
  useScreenTracking('Home');
  const [location, setLocation] = React.useState<GPSPoint | null>(null);
  const [territories, setTerritories] = React.useState<Territory[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(undefined);
  const [eventModeActive, setEventModeActive] = React.useState(false);
  const [eventName, setEventName] = React.useState<string | null>(null);
  const [eventCountdown, setEventCountdown] = React.useState<string | null>(null);
  const [eventExpired, setEventExpired] = React.useState(false);
  const currentEventRef = React.useRef<import('../services/EventModeService').EventInfo | null>(null);
  const [recentEventEnded, setRecentEventEnded] = React.useState<string | null>(null);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const mapRef = React.useRef<MapContainerHandle>(null);
  const lastFetchTimeRef = React.useRef(0);
  const usernameCacheRef = React.useRef<Record<string, string>>({});
  const pendingRealtimeTerritories = React.useRef<Territory[]>([]);
  const realtimeBatchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [onboardingStep, setOnboardingStep] = React.useState(0);

  // Location disclosure state (Google Play requirement)
  const [showLocationDisclosure, setShowLocationDisclosure] = React.useState(false);
  const [locationDisclosureAccepted, setLocationDisclosureAccepted] = React.useState(false);

  // Invasion modal state
  const [invasionModal, setInvasionModal] = React.useState<{
    visible: boolean;
    invasions: TerritoryInvasion[];
  }>({ visible: false, invasions: [] });

  // Territory popup state
  const [territoryPopup, setTerritoryPopup] = React.useState<{
    visible: boolean;
    ownerId: string;
    ownerName: string;
    territoryName: string;
    territoryArea: number;
    claimedAt: number;
    isOwnTerritory: boolean;
    friendStatus: 'none' | 'pending' | 'accepted' | 'loading';
  }>({ visible: false, ownerId: '', ownerName: '', territoryName: '', territoryArea: 0, claimedAt: 0, isOwnTerritory: false, friendStatus: 'none' });
  const [sendingRequest, setSendingRequest] = React.useState(false);

  const formatArea = (sqMeters: number): string => {
    if (sqMeters >= 1000000) return `${(sqMeters / 1000000).toFixed(4)} km²`;
    if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
    return `${Math.round(sqMeters)} m²`;
  };

  // Check onboarding and location disclosure on mount
  React.useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ONBOARDING_KEY).catch(() => null),
      AsyncStorage.getItem(LOCATION_DISCLOSURE_KEY).catch(() => null),
    ]).then(([onboardingVal, disclosureVal]) => {
      if (disclosureVal === 'true') {
        setLocationDisclosureAccepted(true);
      }
      if (onboardingVal !== 'true') {
        setShowOnboarding(true);
      } else if (disclosureVal !== 'true') {
        // Returning user who saw onboarding but not the disclosure yet
        setShowLocationDisclosure(true);
      }
    });
  }, []);

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').catch(() => {});
    // Show location disclosure after onboarding if not yet accepted
    if (!locationDisclosureAccepted) {
      setShowLocationDisclosure(true);
    }
  };

  const acceptLocationDisclosure = () => {
    setShowLocationDisclosure(false);
    setLocationDisclosureAccepted(true);
    AsyncStorage.setItem(LOCATION_DISCLOSURE_KEY, 'true').catch(() => {});
  };

  const advanceOnboarding = () => {
    if (onboardingStep < 2) {
      setOnboardingStep(prev => prev + 1);
    } else {
      dismissOnboarding();
    }
  };

  const showInvasionAlert = (invasions: TerritoryInvasion[]) => {
    setInvasionModal({ visible: true, invasions });
  };

  const dismissInvasionModal = () => {
    const ids = invasionModal.invasions.map(inv => inv.id).filter(Boolean);
    TerritoryService.markInvasionsSeen(ids).catch(err => {
      console.error('Failed to mark invasions seen:', err);
    });
    setInvasionModal({ visible: false, invasions: [] });
  };

  const handleTerritoryPress = React.useCallback(async (territory: { id: string; ownerId: string; ownerName: string }) => {
    const isOwn = currentUserId === territory.ownerId;

    // Look up full territory data from state
    const fullTerritory = territories.find(t => t.id === territory.id);

    setTerritoryPopup({
      visible: true,
      ownerId: territory.ownerId,
      ownerName: territory.ownerName || 'Unknown',
      territoryName: fullTerritory?.name || '',
      territoryArea: fullTerritory?.area || 0,
      claimedAt: fullTerritory?.claimedAt || 0,
      isOwnTerritory: isOwn,
      friendStatus: 'loading',
    });

    if (!isOwn && currentUserId) {
      try {
        const result = await FriendService.getFriendshipStatus(currentUserId, territory.ownerId);
        setTerritoryPopup(prev => ({
          ...prev,
          friendStatus: result.status === 'accepted' ? 'accepted' : result.status === 'pending' ? 'pending' : 'none',
        }));
      } catch {
        setTerritoryPopup(prev => ({ ...prev, friendStatus: 'none' }));
      }
    } else {
      setTerritoryPopup(prev => ({ ...prev, friendStatus: 'none' }));
    }
  }, [currentUserId, territories]);

  const handleSendFriendRequest = async () => {
    setSendingRequest(true);
    try {
      await FriendService.sendFriendRequest(territoryPopup.ownerId);
      setTerritoryPopup(prev => ({ ...prev, friendStatus: 'pending' }));
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Friend request sent', 'success');
    } catch (err) {
      console.error('Failed to send friend request:', err);
      showToast('Failed to send request', 'error');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleViewProfile = () => {
    setTerritoryPopup(prev => ({ ...prev, visible: false }));
    if (territoryPopup.isOwnTerritory) {
      navigation.navigate('Profile');
    } else {
      navigation.navigate('UserProfile', { userId: territoryPopup.ownerId });
    }
  };

  // Reload territories on focus, with staleness guard to avoid redundant fetches
  // Also sync any pending activities in background to ensure data reaches the cloud
  useFocusEffect(
    React.useCallback(() => {
      // Sync pending activities in background (low cost, always run)
      ActivityService.syncPendingActivities().catch(err => {
        console.error('Failed to sync pending activities:', err);
      });

      const STALENESS_MS = 60_000;
      if (Date.now() - lastFetchTimeRef.current < STALENESS_MS && territories.length > 0) {
        // Data is fresh enough, skip expensive territory fetch but still check invasions
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              const invasions = await TerritoryService.getUnseenInvasions(session.user.id);
              if (invasions.length > 0) showInvasionAlert(invasions);
            }
          } catch { /* ignore */ }
        })();
        return;
      }

      const loadTerritories = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            setCurrentUserId(session.user.id);
            // Fetch all territories to show everyone's claimed areas
            const allTerritories = await TerritoryService.getAllTerritories();
            setTerritories(allTerritories);
            lastFetchTimeRef.current = Date.now();

            // Check event mode status and get event details
            const [eventMode, currentEvt, pastEvts] = await Promise.all([
              EventModeService.getEventMode(),
              EventModeService.getCurrentEvent(),
              EventModeService.getPastEvents(),
            ]);
            setEventModeActive(eventMode);
            setEventName(currentEvt?.name || null);
            currentEventRef.current = currentEvt;

            // Check if an event ended recently (within 24 hours) (#8)
            if (!eventMode && pastEvts.length > 0) {
              const latest = pastEvts[0];
              if (latest.endedAt) {
                const endedAgo = Date.now() - new Date(latest.endedAt).getTime();
                if (endedAgo < 24 * 60 * 60 * 1000) {
                  setRecentEventEnded(latest.name);
                } else {
                  setRecentEventEnded(null);
                }
              }
            } else {
              setRecentEventEnded(null);
            }

            // Check for invasion notifications
            const invasions = await TerritoryService.getUnseenInvasions(session.user.id);
            if (invasions.length > 0) {
              showInvasionAlert(invasions);
            }
          }
        } catch (err) {
          console.error('Failed to load territories:', err);
          showToast('Failed to load map data', 'error');
        }
      };
      loadTerritories();
    }, [territories.length])
  );

  // Live countdown timer for active event
  React.useEffect(() => {
    if (!eventModeActive || !currentEventRef.current) {
      setEventCountdown(null);
      setEventExpired(false);
      return;
    }

    const updateCountdown = () => {
      const remaining = EventModeService.getEventTimeRemaining(currentEventRef.current);
      if (!remaining) {
        setEventCountdown(null);
        setEventExpired(false);
        return;
      }
      if (remaining.isExpired) {
        setEventCountdown("Time's up!");
        setEventExpired(true);
      } else if (remaining.hours > 0) {
        setEventCountdown(`${remaining.hours}h ${remaining.minutes}m remaining`);
        setEventExpired(false);
      } else {
        setEventCountdown(`${remaining.minutes}m ${remaining.seconds}s remaining`);
        setEventExpired(false);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [eventModeActive]);

  React.useEffect(() => {
    if (!locationDisclosureAccepted) return;

    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    const startLocation = async () => {
      try {
        unsubscribe = await LocationService.startTracking(
          (point) => {
            if (mounted) {
              setLocationError(null);
              setLocation(point);
            }
          },
          (error) => {
            if (mounted) setLocationError(error?.message || 'Location unavailable');
          }
        );
      } catch (err) {
        console.error('Failed to start location:', err);
      }
    };

    startLocation();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [locationDisclosureAccepted]);

  // Batch-resolve usernames for Realtime territory inserts
  const flushRealtimeTerritories = React.useCallback(async () => {
    const pending = pendingRealtimeTerritories.current.splice(0);
    if (pending.length === 0) return;

    // Find owner IDs not yet in cache
    const unknownIds = [...new Set(
      pending.filter(t => !usernameCacheRef.current[t.ownerId]).map(t => t.ownerId)
    )];

    if (unknownIds.length > 0) {
      try {
        const { data } = await supabase
          .from('users')
          .select('id, username')
          .in('id', unknownIds);
        if (data) {
          for (const u of data) {
            usernameCacheRef.current[u.id] = u.username || 'User ' + u.id.substring(0, 6);
          }
        }
      } catch {
        // Fallback names for unknown IDs
      }
    }

    // Assign cached names to pending territories
    for (const t of pending) {
      t.ownerName = usernameCacheRef.current[t.ownerId] || 'User ' + t.ownerId.substring(0, 6);
    }

    // Merge into state
    setTerritories(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const newOnes = pending.filter(t => !existingIds.has(t.id));
      return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
    });
  }, []);

  // Realtime subscription for live territory updates from other users
  React.useEffect(() => {
    const channel = supabase
      .channel('territories-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'territories' },
        (payload: any) => {
          try {
          const row = payload.new;
          if (!row || !row.id) return;
          // Don't process our own inserts — we already have them locally
          if (row.owner_id === currentUserId) return;

          const center = typeof row.center === 'string' ? JSON.parse(row.center) : row.center;
          const polygon = typeof row.polygon === 'string' ? JSON.parse(row.polygon) : row.polygon;
          if (!Array.isArray(polygon) || polygon.length < 3) return;

          const newTerritory: Territory = {
            id: row.id,
            name: row.name || '',
            ownerId: row.owner_id,
            activityId: row.activity_id || '',
            claimedAt: row.claimed_at ? new Date(row.claimed_at).getTime() : Date.now(),
            area: typeof row.area === 'number' ? row.area : 0,
            perimeter: typeof row.perimeter === 'number' ? row.perimeter : 0,
            center: center || { lat: 0, lng: 0 },
            polygon,
            history: [],
          };

          // Check username cache first
          const cached = usernameCacheRef.current[row.owner_id];
          if (cached) {
            newTerritory.ownerName = cached;
            setTerritories(prev => {
              if (prev.some(t => t.id === newTerritory.id)) return prev;
              return [newTerritory, ...prev];
            });
          } else {
            // Queue for batched resolution
            pendingRealtimeTerritories.current.push(newTerritory);
            if (realtimeBatchTimer.current) clearTimeout(realtimeBatchTimer.current);
            realtimeBatchTimer.current = setTimeout(flushRealtimeTerritories, 500);
          }
          } catch (err) {
            console.error('[Realtime] Failed to process territory insert:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'territories' },
        (payload: any) => {
          const oldRow = payload.old;
          if (!oldRow || !oldRow.id) return;
          setTerritories(prev => prev.filter(t => t.id !== oldRow.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (realtimeBatchTimer.current) clearTimeout(realtimeBatchTimer.current);
    };
  }, [currentUserId, flushRealtimeTerritories]);

  // Center map on territory when navigated with focus params
  const focusLat = route?.params?.focusTerritoryLat;
  const focusLng = route?.params?.focusTerritoryLng;
  const lastFocusRef = React.useRef<string>('');

  React.useEffect(() => {
    if (focusLat && focusLng) {
      const focusKey = `${focusLat},${focusLng}`;
      if (focusKey === lastFocusRef.current) return;
      lastFocusRef.current = focusKey;
      // Small delay to ensure map is ready
      const timer = setTimeout(() => {
        mapRef.current?.centerOnLocation(focusLat, focusLng, 17);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [focusLat, focusLng]);

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'record') {
      navigation.navigate('Record');
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

  const hasDestroyed = invasionModal.invasions.some(inv => inv.territoryWasDestroyed);

  const ONBOARDING_STEPS = [
    {
      title: 'Welcome to Conqr!',
      body: 'This map shows territories claimed by all players. Your territories are highlighted in orange.',
      icon: <Map color="#E65100" size={32} />,
    },
    {
      title: 'Record an Activity',
      body: 'Tap the red button to start recording a run, walk, or ride. Your path is tracked on the map.',
      icon: <MapPin color="#E65100" size={32} />,
    },
    {
      title: 'Claim Territory',
      body: 'Close your loop by returning to your starting point. The enclosed area becomes your territory!',
      icon: <Zap color="#E65100" size={32} />,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {eventModeActive && (
          <TouchableOpacity
            style={[styles.eventModeBanner, eventExpired && styles.eventModeBannerExpired]}
            onPress={() => navigation.navigate('Leaderboard')}
            activeOpacity={0.8}
          >
            <Zap color="#FFFFFF" size={14} />
            <Text style={styles.eventModeBannerText} numberOfLines={1}>
              {eventName ? `${eventName}` : 'Event Active'}
              {eventCountdown ? ` · ${eventCountdown}` : ''}
            </Text>
            <Text style={styles.eventModeBannerHint}>View</Text>
          </TouchableOpacity>
        )}
        {!eventModeActive && recentEventEnded && (
          <TouchableOpacity
            style={styles.eventEndedBanner}
            onPress={() => {
              setRecentEventEnded(null);
              navigation.navigate('Leaderboard');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.eventEndedBannerText}>
              "{recentEventEnded}" has ended — tap to see results
            </Text>
          </TouchableOpacity>
        )}
        <View style={styles.mapWrapper}>
          <MapContainer
            ref={mapRef}
            location={location}
            path={[]}
            territories={territories}
            currentUserId={currentUserId}
            style={styles.map}
            onTerritoryPress={handleTerritoryPress}
          />
          {locationError && (
            <TouchableOpacity
              style={styles.locationErrorBanner}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.8}
            >
              <Text style={styles.locationErrorText}>{locationError}</Text>
              <View style={styles.locationErrorAction}>
                <Settings color="#FFFFFF" size={12} />
                <Text style={styles.locationErrorActionText}>Open Settings</Text>
              </View>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={() => mapRef.current?.centerOnUser()}
            activeOpacity={0.7}
          >
            <Crosshair color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      <BottomTabBar activeTab="home" onTabPress={handleTabPress} />

      {/* Onboarding overlay */}
      <Modal
        visible={showOnboarding}
        transparent
        animationType="fade"
        onRequestClose={dismissOnboarding}
      >
        <View style={styles.onboardingBackdrop}>
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingIconCircle}>
              {ONBOARDING_STEPS[onboardingStep].icon}
            </View>
            <Text style={styles.onboardingTitle}>{ONBOARDING_STEPS[onboardingStep].title}</Text>
            <Text style={styles.onboardingBody}>{ONBOARDING_STEPS[onboardingStep].body}</Text>

            <View style={styles.onboardingDots}>
              {ONBOARDING_STEPS.map((_, i) => (
                <View key={i} style={[styles.onboardingDot, i === onboardingStep && styles.onboardingDotActive]} />
              ))}
            </View>

            <TouchableOpacity style={styles.onboardingBtn} onPress={advanceOnboarding}>
              <Text style={styles.onboardingBtnText}>
                {onboardingStep < 2 ? 'Next' : 'Got it!'}
              </Text>
            </TouchableOpacity>
            {onboardingStep < 2 && (
              <TouchableOpacity onPress={dismissOnboarding} style={styles.onboardingSkip}>
                <Text style={styles.onboardingSkipText}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Location disclosure (Google Play requirement) */}
      <Modal
        visible={showLocationDisclosure}
        transparent
        animationType="fade"
        onRequestClose={acceptLocationDisclosure}
      >
        <View style={styles.onboardingBackdrop}>
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingIconCircle}>
              <MapPin color="#E65100" size={32} />
            </View>
            <Text style={styles.onboardingTitle}>Location Access</Text>
            <Text style={styles.locationDisclosureBody}>
              Conqr collects your GPS location to track your walking, running, and cycling routes in real time — including when the app is in the background or the screen is off during an active activity.
            </Text>
            <Text style={styles.locationDisclosureBody}>
              Your location data is used to record activity paths and claim territories on the map. Location is only tracked while you are recording an activity.
            </Text>
            <Text style={styles.locationDisclosureBody}>
              You can revoke location access at any time in your device settings.
            </Text>
            <TouchableOpacity style={styles.onboardingBtn} onPress={acceptLocationDisclosure}>
              <Text style={styles.onboardingBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Territory tap popup */}
      <Modal
        visible={territoryPopup.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setTerritoryPopup(prev => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity
          style={styles.popupBackdrop}
          activeOpacity={1}
          onPress={() => setTerritoryPopup(prev => ({ ...prev, visible: false }))}
        >
          <View style={styles.popupContainer}>
            <View style={styles.popupHandle} />

            <TouchableOpacity
              style={styles.popupProfileRow}
              onPress={handleViewProfile}
              activeOpacity={0.7}
            >
              <View style={styles.popupAvatar}>
                <User color="#E65100" size={20} />
              </View>
              <View style={styles.popupUserInfo}>
                <Text style={styles.popupUsername} numberOfLines={1}>
                  {territoryPopup.isOwnTerritory ? 'Your Territory' : territoryPopup.ownerName}
                </Text>
                {territoryPopup.territoryName ? (
                  <Text style={styles.popupTerritoryName} numberOfLines={1}>
                    {territoryPopup.territoryName}
                  </Text>
                ) : (
                  <Text style={styles.popupHint}>Tap to view profile</Text>
                )}
              </View>
              <MapPin color="#999999" size={16} />
            </TouchableOpacity>

            {/* Territory details */}
            {territoryPopup.territoryArea > 0 && (
              <View style={styles.popupDetails}>
                <View style={styles.popupDetailItem}>
                  <Map color="#E65100" size={14} />
                  <Text style={styles.popupDetailText}>{formatArea(territoryPopup.territoryArea)}</Text>
                </View>
                {territoryPopup.claimedAt > 0 && (
                  <View style={styles.popupDetailItem}>
                    <Clock color="#999999" size={14} />
                    <Text style={styles.popupDetailTextMuted}>
                      {new Date(territoryPopup.claimedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {!territoryPopup.isOwnTerritory && (
              <View style={styles.popupActions}>
                {territoryPopup.friendStatus === 'loading' ? (
                  <View style={styles.popupActionBtn}>
                    <ActivityIndicator size="small" color="#E65100" />
                  </View>
                ) : territoryPopup.friendStatus === 'accepted' ? (
                  <View style={[styles.popupActionBtn, styles.popupActionBtnAccepted]}>
                    <Check color="#10B981" size={16} />
                    <Text style={styles.popupActionTextAccepted}>Friends</Text>
                  </View>
                ) : territoryPopup.friendStatus === 'pending' ? (
                  <View style={[styles.popupActionBtn, styles.popupActionBtnPending]}>
                    <UserPlus color="#999999" size={16} />
                    <Text style={styles.popupActionTextPending}>Request Sent</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.popupActionBtn, styles.popupActionBtnAdd]}
                    onPress={handleSendFriendRequest}
                    disabled={sendingRequest}
                  >
                    {sendingRequest ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <UserPlus color="#FFFFFF" size={16} />
                        <Text style={styles.popupActionTextAdd}>Add Friend</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invasion modal */}
      <Modal
        visible={invasionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={dismissInvasionModal}
      >
        <View style={styles.invasionBackdrop}>
          <View style={styles.invasionContainer}>
            <TouchableOpacity
              style={styles.invasionClose}
              onPress={dismissInvasionModal}
            >
              <X color="#999999" size={24} />
            </TouchableOpacity>

            <View style={[styles.invasionIconCircle, hasDestroyed && styles.invasionIconCircleDestroyed]}>
              {hasDestroyed ? (
                <ShieldAlert color="#FFFFFF" size={32} />
              ) : (
                <Swords color="#FFFFFF" size={32} />
              )}
            </View>

            <Text style={styles.invasionTitle}>
              {invasionModal.invasions.length === 1
                ? 'Territory Invaded!'
                : `${invasionModal.invasions.length} Invasions!`}
            </Text>

            <ScrollView
              style={styles.invasionList}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {invasionModal.invasions.map((inv, index) => (
                <View
                  key={inv.id || index}
                  style={[
                    styles.invasionCard,
                    inv.territoryWasDestroyed && styles.invasionCardDestroyed,
                  ]}
                >
                  <View style={styles.invasionCardHeader}>
                    <View style={styles.invasionUserBadge}>
                      <User color="#E65100" size={14} />
                    </View>
                    <Text style={styles.invasionUsername} numberOfLines={1}>
                      {inv.invaderUsername || 'Someone'}
                    </Text>
                  </View>

                  <Text style={styles.invasionDescription}>
                    {inv.territoryWasDestroyed
                      ? 'Completely conquered your territory!'
                      : 'Invaded part of your territory'}
                  </Text>

                  <View style={styles.invasionAreaRow}>
                    <Swords color={inv.territoryWasDestroyed ? '#FF3B30' : '#E65100'} size={14} />
                    <Text style={[
                      styles.invasionAreaText,
                      inv.territoryWasDestroyed && styles.invasionAreaTextDestroyed,
                    ]}>
                      {formatArea(inv.overlapArea)} {inv.territoryWasDestroyed ? 'lost' : 'taken'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.invasionDismissBtn}
              onPress={dismissInvasionModal}
            >
              <Text style={styles.invasionDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  eventModeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E65100',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  eventModeBannerExpired: {
    backgroundColor: '#999999',
  },
  eventModeBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  eventModeBannerHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  eventEndedBanner: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  eventEndedBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  locationErrorBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationErrorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  locationErrorAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginLeft: 8,
  },
  locationErrorActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  recenterButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },

  // Onboarding
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  onboardingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  onboardingIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 10,
    textAlign: 'center',
  },
  onboardingBody: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  locationDisclosureBody: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 12,
  },
  onboardingDots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  onboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  onboardingDotActive: {
    backgroundColor: '#E65100',
    width: 24,
  },
  onboardingBtn: {
    backgroundColor: '#E65100',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  onboardingBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  onboardingSkip: {
    marginTop: 12,
    paddingVertical: 8,
  },
  onboardingSkipText: {
    color: '#999999',
    fontSize: 14,
    fontWeight: '500',
  },

  // Territory popup
  popupBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  popupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 90,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  popupHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  popupProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  popupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  popupUserInfo: {
    flex: 1,
  },
  popupUsername: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  popupTerritoryName: {
    fontSize: 14,
    color: '#E65100',
    marginTop: 2,
    fontWeight: '500',
  },
  popupHint: {
    fontSize: 13,
    color: '#999999',
    marginTop: 2,
  },
  popupDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  popupDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popupDetailText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  popupDetailTextMuted: {
    fontSize: 13,
    color: '#999999',
  },
  popupActions: {
    marginTop: 16,
  },
  popupActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  popupActionBtnAdd: {
    backgroundColor: '#E65100',
  },
  popupActionBtnPending: {
    backgroundColor: '#F5F5F5',
  },
  popupActionBtnAccepted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  popupActionTextAdd: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  popupActionTextPending: {
    color: '#999999',
    fontSize: 15,
    fontWeight: '600',
  },
  popupActionTextAccepted: {
    color: '#10B981',
    fontSize: 15,
    fontWeight: '600',
  },

  // Invasion modal
  invasionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  invasionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    position: 'relative' as const,
  },
  invasionClose: {
    position: 'absolute' as const,
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 1,
  },
  invasionIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  invasionIconCircleDestroyed: {
    backgroundColor: '#FF3B30',
  },
  invasionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  invasionList: {
    width: '100%',
    maxHeight: 260,
    marginBottom: 20,
  },
  invasionCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  invasionCardDestroyed: {
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
  },
  invasionCardHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    marginBottom: 6,
  },
  invasionUserBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  invasionUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
  },
  invasionDescription: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 8,
  },
  invasionAreaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 6,
  },
  invasionAreaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
  },
  invasionAreaTextDestroyed: {
    color: '#FF3B30',
  },
  invasionDismissBtn: {
    backgroundColor: '#E65100',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  invasionDismissText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
