import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Image, Modal, Dimensions, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Trophy, User, Crown, Medal, Share2, X, Link, Image as ImageIcon, Zap, Calendar, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import ShareCardLeaderboard from '../components/ShareCardLeaderboard';
import { ImageShareService } from '../services/ImageShareService';
import { TerritoryService } from '../services/TerritoryService';
import { AuthService } from '../services/AuthService';
import { EventModeService, EventInfo } from '../services/EventModeService';
import { supabase } from '../lib/supabase';
import { useScreenTracking } from '../lib/useScreenTracking';
import { SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, DOWNLOAD_URL } from '../utils/shareCardUtils';

// Try to import ViewShot - may not be available if native module isn't in the build
let ViewShot: any = null;
try {
    ViewShot = require('react-native-view-shot').default;
} catch {
    // Native module not available in this build
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SHARE_PREVIEW_PADDING = 32;
const SHARE_PREVIEW_WIDTH = SCREEN_WIDTH - SHARE_PREVIEW_PADDING * 2;
const SHARE_SCALE = SHARE_PREVIEW_WIDTH / SHARE_CARD_WIDTH;
const SHARE_PREVIEW_HEIGHT = SHARE_CARD_HEIGHT * SHARE_SCALE;

interface LeaderboardScreenProps {
  navigation: any;
}

type TimePeriod = 'week' | 'month' | 'year' | 'all';
type LeaderboardTab = TimePeriod | 'events';

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

function buildLeaderboardFromTerritories(
  territories: { ownerId: string; ownerName?: string; area: number; claimedAt: number }[],
): LeaderboardEntry[] {
  const userMap = new Map<string, LeaderboardEntry>();
  for (const t of territories) {
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
    return `${Math.round(sqMeters).toLocaleString()} m\u00B2`;
  }
  return `${(sqMeters / 10000).toFixed(2)} ha`;
}

function formatEventDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  all: 'All Time',
};

const TAB_LABELS: Record<LeaderboardTab, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All Time',
  events: 'Events',
};

export default function LeaderboardScreen({ navigation }: LeaderboardScreenProps) {
  useScreenTracking('Leaderboard');
  const [tab, setTab] = useState<LeaderboardTab>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [eventModeActive, setEventModeActive] = useState(false);
  const viewShotRef = useRef<any>(null);

  // Event-specific state
  const [currentEvent, setCurrentEvent] = useState<EventInfo | null>(null);
  const [pastEvents, setPastEvents] = useState<EventInfo[]>([]);
  const [eventLeaderboard, setEventLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [pastEventLeaderboard, setPastEventLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingPastEvent, setLoadingPastEvent] = useState(false);
  const [hasJoinedEvent, setHasJoinedEvent] = useState(false);
  const [joiningEvent, setJoiningEvent] = useState(false);
  const [eventParticipantCount, setEventParticipantCount] = useState(0);
  const [eventCountdown, setEventCountdown] = useState<string | null>(null);
  const [eventExpired, setEventExpired] = useState(false);
  // Cache all territories for event leaderboard building
  const allTerritoriesRef = useRef<{ ownerId: string; ownerName?: string; area: number; claimedAt: number }[]>([]);

  // Fetch generation counter — incremented on every new fetch so stale responses are discarded
  const fetchGenRef = useRef(0);
  const lastFetchTimeRef = useRef(0);

  const fetchLeaderboard = useCallback(async (activeTab: LeaderboardTab, showRefreshing = false) => {
    const fetchId = ++fetchGenRef.current;
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const [session, eventMode, currentEvt, pastEvts, joined] = await Promise.all([
        supabase.auth.getSession(),
        EventModeService.getEventMode(),
        EventModeService.getCurrentEvent(),
        EventModeService.getPastEvents(),
        EventModeService.hasJoinedCurrentEvent(),
      ]);

      // Stale guard: if a newer fetch was started, discard this result
      if (fetchId !== fetchGenRef.current) return;

      if (session.data.session?.user) {
        setCurrentUserId(session.data.session.user.id);
      }
      setEventModeActive(eventMode);
      setCurrentEvent(currentEvt);
      setPastEvents(pastEvts);
      setHasJoinedEvent(joined);

      if (activeTab === 'events') {
        // Load all territories for event leaderboard
        const territories = await TerritoryService.getLeaderboardTerritories();
        if (fetchId !== fetchGenRef.current) return;

        allTerritoriesRef.current = territories.map(t => ({
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
            if (fetchId !== fetchGenRef.current) return;
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

        // Build current event leaderboard — only count territories from participants (#2)
        if (currentEvt) {
          const startTime = new Date(currentEvt.startedAt).getTime();
          const participants = await EventModeService.getEventParticipants(currentEvt.id);
          if (fetchId !== fetchGenRef.current) return;
          setEventParticipantCount(participants.length);
          const eventTerritories = participants.length === 0
            ? []
            : allTerritoriesRef.current.filter(t =>
                t.claimedAt >= startTime && participants.includes(t.ownerId)
              );
          setEventLeaderboard(buildLeaderboardFromTerritories(eventTerritories));
        } else {
          setEventLeaderboard([]);
          setEventParticipantCount(0);
        }
      } else {
        // Regular period-based leaderboard — use server-side aggregation RPC
        const startDate = getStartDate(activeTab as TimePeriod);
        const sinceISO = startDate ? new Date(startDate).toISOString() : null;

        const rpcResults = await TerritoryService.getLeaderboardRPC(sinceISO, 100);
        if (fetchId !== fetchGenRef.current) return;

        if (rpcResults.length > 0) {
          const entries: LeaderboardEntry[] = rpcResults.map(r => ({
            userId: r.userId,
            username: r.username,
            avatarUrl: r.avatarUrl,
            totalArea: r.totalArea,
            territoryCount: r.territoryCount,
          }));
          setLeaderboard(entries);

          // Build avatar map from RPC results (avatarUrl is already included)
          const newMap = new Map<string, string>();
          for (const r of rpcResults) {
            if (r.avatarUrl) newMap.set(r.userId, r.avatarUrl);
          }
          setAvatarMap(newMap);
        } else {
          setLeaderboard([]);
        }
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
      // On error, clear the board so stale data from a different tab isn't shown
      if (fetchId === fetchGenRef.current) {
        if (activeTab === 'events') {
          setEventLeaderboard([]);
        } else {
          setLeaderboard([]);
        }
      }
    } finally {
      if (fetchId === fetchGenRef.current) {
        setLoading(false);
        setRefreshing(false);
        lastFetchTimeRef.current = Date.now();
      }
    }
  }, []);

  // Re-fetch when tab changes — pass the tab value directly (no ref needed)
  useEffect(() => {
    fetchLeaderboard(tab);
  }, [tab, fetchLeaderboard]);

  // Also refresh on screen focus (skip if data was fetched recently to avoid double-fetch on mount)
  useFocusEffect(
    useCallback(() => {
      const STALENESS_MS = 60_000;
      if (Date.now() - lastFetchTimeRef.current >= STALENESS_MS) {
        fetchLeaderboard(tab);
      }

      // Set up auto-refresh every 15 minutes
      autoRefreshRef.current = setInterval(() => {
        fetchLeaderboard(tab);
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
          autoRefreshRef.current = null;
        }
      };
    }, [tab, fetchLeaderboard])
  );

  const onRefresh = useCallback(() => {
    fetchLeaderboard(tab, true);
  }, [tab, fetchLeaderboard]);

  // Live countdown timer for active event
  useEffect(() => {
    if (!eventModeActive || !currentEvent) {
      setEventCountdown(null);
      setEventExpired(false);
      return;
    }

    const updateCountdown = () => {
      const remaining = EventModeService.getEventTimeRemaining(currentEvent);
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
  }, [eventModeActive, currentEvent]);

  // Load a past event's leaderboard on demand
  const handleExpandPastEvent = useCallback(async (event: EventInfo) => {
    if (expandedEventId === event.id) {
      setExpandedEventId(null);
      setLoadingPastEvent(false);
      return;
    }

    setLoadingPastEvent(true);
    setExpandedEventId(event.id);

    try {
      // Use cached territories if available, otherwise fetch
      if (allTerritoriesRef.current.length === 0) {
        const territories = await TerritoryService.getLeaderboardTerritories();
        allTerritoriesRef.current = territories.map(t => ({
          ownerId: t.ownerId,
          ownerName: t.ownerName,
          area: t.area,
          claimedAt: t.claimedAt,
        }));
      }

      const startTime = new Date(event.startedAt).getTime();
      const endTime = event.endedAt ? new Date(event.endedAt).getTime() : Date.now();
      const participants = event.participants || [];
      const eventTerritories = participants.length === 0
        ? []
        : allTerritoriesRef.current.filter(
            t => t.claimedAt >= startTime && t.claimedAt <= endTime &&
              participants.includes(t.ownerId)
          );
      setPastEventLeaderboard(buildLeaderboardFromTerritories(eventTerritories));
    } catch (err) {
      console.error('Failed to load past event leaderboard:', err);
      setPastEventLeaderboard([]);
    } finally {
      setLoadingPastEvent(false);
    }
  }, [expandedEventId]);

  const handleJoinEvent = useCallback(async () => {
    if (!currentUserId) return;
    setJoiningEvent(true);
    try {
      const success = await EventModeService.joinEvent(currentUserId);
      if (success) {
        setHasJoinedEvent(true);
        // Refresh to get updated participant list
        EventModeService.clearCache();
        fetchLeaderboard('events');
      }
    } catch (err: any) {
      if (err?.message === 'Event is full') {
        Alert.alert('Event Full', 'This event has reached the maximum number of participants (100).');
      } else if (err?.message === 'Event has ended') {
        Alert.alert('Event Ended', 'This event\u2019s time has expired. You can no longer join.');
      } else {
        Alert.alert('Join Failed', 'Could not join the event. Please check your connection and try again.');
      }
      // Refresh to get latest state
      EventModeService.clearCache();
      fetchLeaderboard('events');
    }
    finally { setJoiningEvent(false); }
  }, [currentUserId, fetchLeaderboard]);

  const handleLeaveEvent = useCallback(async () => {
    if (!currentUserId) return;
    setJoiningEvent(true);
    try {
      await EventModeService.leaveEvent(currentUserId);
      setHasJoinedEvent(false);
      EventModeService.clearCache();
      fetchLeaderboard('events');
    } catch { /* ignore */ }
    finally { setJoiningEvent(false); }
  }, [currentUserId, fetchLeaderboard]);

  const handleTabPress = (navTab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (navTab === 'home') navigation.navigate('Home');
    else if (navTab === 'record') navigation.navigate('Record');
    else if (navTab === 'profile') navigation.navigate('Profile');
    else if (navTab === 'friends') navigation.navigate('Friends');
    else if (navTab === 'feed') navigation.navigate('Feed');
  };

  const renderRankBadge = (rank: number) => {
    if (rank === 1) return <Crown color="#FFD700" size={22} fill="#FFD700" />;
    if (rank === 2) return <Medal color="#C0C0C0" size={20} />;
    if (rank === 3) return <Medal color="#CD7F32" size={20} />;
    return <Text style={styles.rankNumber}>{rank}</Text>;
  };

  const getDisplayLabel = (): string => {
    if (tab === 'events') {
      return currentEvent ? currentEvent.name : 'Events';
    }
    return PERIOD_LABELS[tab as TimePeriod];
  };

  const getDisplayLeaderboard = (): LeaderboardEntry[] => {
    if (tab === 'events') return eventLeaderboard;
    return leaderboard;
  };

  const buildLeaderboardMessage = (): string => {
    const displayBoard = getDisplayLeaderboard();
    const lines: string[] = ['Conqr Leaderboard - ' + getDisplayLabel()];
    displayBoard.slice(0, 4).forEach((entry, i) => {
      const rank = i + 1;
      const prefix = rank === 1 ? '\uD83D\uDC51' : rank === 2 ? '\uD83E\uDD48' : rank === 3 ? '\uD83E\uDD49' : `${rank}.`;
      lines.push(`${prefix} ${entry.username} - ${formatArea(entry.totalArea)}`);
    });
    if (currentUserId) {
      const idx = displayBoard.findIndex(e => e.userId === currentUserId);
      if (idx >= 4) {
        lines.push('...');
        lines.push(`${idx + 1}. ${displayBoard[idx].username} (Me) - ${formatArea(displayBoard[idx].totalArea)}`);
      }
    }
    lines.push('', `Download Conqr Beta: ${DOWNLOAD_URL}`);
    return lines.join('\n');
  };

  // Share text with clickable download URL (for WhatsApp, Instagram DMs, etc.)
  const handleShareLink = async () => {
    setSharing(true);
    try {
      await Share.share({ message: buildLeaderboardMessage(), title: 'Conqr Leaderboard' });
    } catch {
      // User cancelled
    } finally {
      setSharing(false);
    }
  };

  // Share the card as an image (for Instagram Stories, saving, etc.)
  const handleShareImage = async () => {
    setSharing(true);
    try {
      if (ViewShot && viewShotRef.current) {
        try {
          const uri = await viewShotRef.current.capture({
            format: 'png',
            quality: 0.9,
            result: 'tmpfile',
            width: 540,
            height: 960,
          });
          if (uri) {
            await ImageShareService.shareImage(uri);
            return;
          }
        } catch (captureErr) {
          console.error('[Share] Leaderboard image capture failed:', captureErr);
        }
      }
      await Share.share({ message: buildLeaderboardMessage(), title: 'Conqr Leaderboard' });
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        try {
          await Share.share({ message: buildLeaderboardMessage(), title: 'Conqr Leaderboard' });
        } catch {
          // User cancelled
        }
      }
    } finally {
      setSharing(false);
    }
  };

  const renderLeaderboardRows = (entries: LeaderboardEntry[]) => {
    return entries.map((entry, index) => {
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
            {(avatarMap.get(entry.userId) || entry.avatarUrl) ? (
              <Image source={{ uri: avatarMap.get(entry.userId) || entry.avatarUrl }} style={styles.avatarImage} />
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
    });
  };

  const renderEventsContent = () => {
    return (
      <>
        {/* Current Event */}
        {currentEvent && eventModeActive && (
          <View style={styles.eventSection}>
            <View style={styles.eventSectionHeader}>
              <View style={styles.eventLiveBadge}>
                <Zap color="#FFFFFF" size={12} fill="#FFFFFF" />
                <Text style={styles.eventLiveText}>LIVE</Text>
              </View>
              <Text style={styles.eventSectionTitle} numberOfLines={1}>{currentEvent.name}</Text>
            </View>
            <Text style={styles.eventDateText}>
              Started {formatEventDate(currentEvent.startedAt)}
              {eventParticipantCount > 0
                ? ` \u00B7 ${eventParticipantCount}/100 participants`
                : ''}
            </Text>
            {eventCountdown && (
              <Text style={[styles.eventCountdownText, eventExpired && styles.eventCountdownExpired]}>
                {eventCountdown}
              </Text>
            )}
            {!eventExpired && currentEvent.durationMinutes && (() => {
              const remaining = EventModeService.getEventTimeRemaining(currentEvent);
              const pct = remaining ? remaining.totalSeconds / (currentEvent.durationMinutes * 60) : 0;
              return pct > 0.9 ? (
                <Text style={styles.eventPhaseText}>Registration open — event starts soon</Text>
              ) : null;
            })()}

            {/* Join / Leave button */}
            <TouchableOpacity
              style={[
                styles.eventJoinBtn,
                hasJoinedEvent && styles.eventLeaveBtn,
                (!hasJoinedEvent && (eventExpired || eventParticipantCount >= 100)) && styles.eventJoinBtnDisabled,
              ]}
              onPress={hasJoinedEvent ? handleLeaveEvent : handleJoinEvent}
              disabled={joiningEvent || (!hasJoinedEvent && (eventExpired || eventParticipantCount >= 100))}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.eventJoinBtnText,
                hasJoinedEvent && styles.eventLeaveBtnText,
                (!hasJoinedEvent && (eventExpired || eventParticipantCount >= 100)) && styles.eventJoinBtnTextDisabled,
              ]}>
                {joiningEvent ? '...'
                  : hasJoinedEvent ? 'Leave Event'
                  : eventExpired ? "Event Time's Up"
                  : eventParticipantCount >= 100 ? 'Event Full (100/100)'
                  : `Join Event (${eventParticipantCount}/100)`}
              </Text>
            </TouchableOpacity>
            {hasJoinedEvent && (
              <Text style={styles.eventJoinedHint}>
                Territories you claim won't overlap others during this event
              </Text>
            )}

            {eventLeaderboard.length > 0 ? (
              renderLeaderboardRows(eventLeaderboard)
            ) : (
              <View style={styles.eventEmptyState}>
                <Text style={styles.eventEmptyText}>No territories claimed yet in this event</Text>
              </View>
            )}
          </View>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <View style={styles.pastEventsSection}>
            <Text style={styles.pastEventsTitle}>Past Events</Text>
            {pastEvents.map((event) => (
              <View key={event.id} style={styles.pastEventCard}>
                <TouchableOpacity
                  style={styles.pastEventHeader}
                  onPress={() => handleExpandPastEvent(event)}
                  activeOpacity={0.7}
                >
                  <Calendar color="#666666" size={16} />
                  <View style={styles.pastEventInfo}>
                    <Text style={styles.pastEventName} numberOfLines={1}>{event.name}</Text>
                    <Text style={styles.pastEventDates}>
                      {formatEventDate(event.startedAt)}
                      {event.endedAt ? ` - ${formatEventDate(event.endedAt)}` : ''}
                    </Text>
                  </View>
                  {expandedEventId === event.id ? (
                    <ChevronDown color="#999999" size={18} />
                  ) : (
                    <ChevronRight color="#999999" size={18} />
                  )}
                </TouchableOpacity>
                {expandedEventId === event.id && (
                  <View style={styles.pastEventLeaderboard}>
                    {loadingPastEvent ? (
                      <ActivityIndicator color="#E65100" size="small" style={{ paddingVertical: 16 }} />
                    ) : pastEventLeaderboard.length > 0 ? (
                      renderLeaderboardRows(pastEventLeaderboard)
                    ) : (
                      <Text style={styles.pastEventEmpty}>No territories were claimed during this event</Text>
                    )}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Empty state when no events at all */}
        {!currentEvent && pastEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Calendar color="#CCCCCC" size={48} />
            <Text style={styles.emptyText}>No events yet</Text>
            <Text style={styles.emptySubtext}>Events will appear here when they are started</Text>
          </View>
        )}
      </>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" size="large" />
      </View>
    );
  }

  const displayBoard = getDisplayLeaderboard();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft} />
          <View style={styles.headerCenter}>
            <Trophy color="#E65100" size={24} />
            <Text style={styles.headerTitle}>Leaderboard</Text>
            {eventModeActive && (
              <View style={styles.eventBadge}>
                <Zap color="#FFFFFF" size={10} />
                <Text style={styles.eventBadgeText}>EVENT</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.shareHeaderBtn}
            onPress={() => setShareModalVisible(true)}
            disabled={tab === 'events' ? eventLeaderboard.length === 0 : leaderboard.length === 0}
          >
            <Share2
              color={(tab === 'events' ? eventLeaderboard.length === 0 : leaderboard.length === 0) ? '#CCCCCC' : '#1A1A1A'}
              size={22}
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodTabsScroll}
          contentContainerStyle={styles.periodTabsContent}
        >
          {(['week', 'month', 'year', 'all', 'events'] as LeaderboardTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.periodTab, tab === t && styles.periodTabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.periodTabText, tab === t && styles.periodTabTextActive]}>
                {TAB_LABELS[t]}
              </Text>
              {t === 'events' && eventModeActive && tab !== 'events' && (
                <View style={styles.eventDot} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

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
          {tab === 'events' ? (
            renderEventsContent()
          ) : (
            <>
              {displayBoard.length === 0 ? (
                <View style={styles.emptyState}>
                  <Trophy color="#CCCCCC" size={48} />
                  <Text style={styles.emptyText}>No territories claimed yet</Text>
                  <Text style={styles.emptySubtext}>
                    {tab === 'all' ? 'Be the first to conquer territory!' : `No territory claimed ${PERIOD_LABELS[tab as TimePeriod].toLowerCase()}`}
                  </Text>
                </View>
              ) : (
                renderLeaderboardRows(displayBoard)
              )}
            </>
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
      <BottomTabBar activeTab="leaderboard" onTabPress={handleTabPress} />

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.shareBackdrop}>
          <SafeAreaView style={styles.shareContainer} edges={['top', 'bottom']}>
            <View style={styles.shareHeader}>
              <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShareModalVisible(false)}>
                <X color="#FFFFFF" size={24} />
              </TouchableOpacity>
              <Text style={styles.shareHeaderTitle}>Share Leaderboard</Text>
              <View style={styles.shareClosePlaceholder} />
            </View>

            <View style={styles.sharePreviewContainer}>
              <View style={styles.sharePreviewWrapper}>
                <View style={{
                  width: SHARE_PREVIEW_WIDTH,
                  height: SHARE_PREVIEW_HEIGHT,
                  overflow: 'hidden',
                  borderRadius: 16,
                }}>
                  {ViewShot ? (
                    <ViewShot
                      ref={viewShotRef}
                      options={{ format: 'png', quality: 1 }}
                      style={{
                        width: SHARE_CARD_WIDTH,
                        height: SHARE_CARD_HEIGHT,
                        transform: [{ scale: SHARE_SCALE }],
                        transformOrigin: 'top left',
                      }}
                    >
                      <ShareCardLeaderboard
                        leaderboard={displayBoard}
                        currentUserId={currentUserId}
                        periodLabel={getDisplayLabel()}
                      />
                    </ViewShot>
                  ) : (
                    <View style={{
                      width: SHARE_CARD_WIDTH,
                      height: SHARE_CARD_HEIGHT,
                      transform: [{ scale: SHARE_SCALE }],
                      transformOrigin: 'top left',
                    }}>
                      <ShareCardLeaderboard
                        leaderboard={displayBoard}
                        currentUserId={currentUserId}
                        periodLabel={getDisplayLabel()}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View style={styles.shareActions}>
              <TouchableOpacity
                style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
                onPress={handleShareLink}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Link color="#FFFFFF" size={20} />
                    <Text style={styles.shareBtnText}>Share Link</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shareImageBtn, sharing && styles.shareBtnDisabled]}
                onPress={handleShareImage}
                disabled={sharing}
              >
                <>
                  <ImageIcon color="#FFFFFF" size={20} />
                  <Text style={styles.shareBtnText}>Share Image</Text>
                </>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerLeft: {
    width: 40,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E65100',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
    marginLeft: 4,
  },
  eventBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  shareHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodTabsScroll: {
    flexGrow: 0,
  },
  periodTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  periodTab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: '#F0EDE8',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  periodTabActive: {
    backgroundColor: '#E65100',
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  periodTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E65100',
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
    textAlign: 'center',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  topThreeRow: {
    backgroundColor: '#FFF8F0',
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  currentUserRow: {
    backgroundColor: 'rgba(230, 81, 0, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(230, 81, 0, 0.25)',
    borderLeftWidth: 4,
    borderLeftColor: '#E65100',
  },
  rankBadge: {
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#AAAAAA',
  },
  userAvatar: {
    marginRight: 12,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
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
    fontWeight: '700',
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
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  topThreeArea: {
    color: '#E65100',
    fontSize: 16,
  },
  bottomPadding: {
    height: 20,
  },

  // Event section styles
  eventSection: {
    marginBottom: 24,
  },
  eventSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  eventLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E65100',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  eventLiveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  eventSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
  },
  eventDateText: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 4,
    marginLeft: 2,
  },
  eventCountdownText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 4,
    marginLeft: 2,
  },
  eventCountdownExpired: {
    color: '#999999',
  },
  eventPhaseText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 2,
  },
  eventJoinBtn: {
    backgroundColor: '#E65100',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  eventLeaveBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DDD',
  },
  eventJoinBtnDisabled: {
    backgroundColor: '#CCCCCC',
  },
  eventJoinBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  eventLeaveBtnText: {
    color: '#666',
  },
  eventJoinBtnTextDisabled: {
    color: '#FFFFFF',
  },
  eventJoinedHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 12,
  },
  eventEmptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  eventEmptyText: {
    fontSize: 14,
    color: '#999999',
  },

  // Past events styles
  pastEventsSection: {
    marginTop: 8,
  },
  pastEventsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  pastEventCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  pastEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  pastEventInfo: {
    flex: 1,
  },
  pastEventName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  pastEventDates: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },
  pastEventLeaderboard: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  pastEventEmpty: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Share modal styles
  shareBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  shareContainer: {
    flex: 1,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  shareCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareClosePlaceholder: {
    width: 40,
  },
  shareHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  sharePreviewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SHARE_PREVIEW_PADDING,
  },
  sharePreviewWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  shareActions: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E65100',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
  },
  shareImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
  },
  shareBtnDisabled: {
    backgroundColor: '#666666',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
