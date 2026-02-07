import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Image, TextInput, Alert, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { UserPlus, User, Search, X, Check, XCircle, Clock, Users } from 'lucide-react-native';
import BottomTabBar from '../components/BottomTabBar';
import { FriendService } from '../services/FriendService';
import { AuthService } from '../services/AuthService';
import { supabase } from '../lib/supabase';
import { UserProfile, FriendWithProfile, FriendshipStatus } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';
import { AnalyticsService } from '../services/AnalyticsService';

type FriendsTab = 'friends' | 'requests' | 'pending' | 'search';

interface FriendsScreenProps {
  navigation: any;
}

export default function FriendsScreen({ navigation }: FriendsScreenProps) {
  useScreenTracking('Friends');
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendWithProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, { status: FriendshipStatus; friendshipId?: string }>>({});

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
        await loadData(session.user.id);
      }
      setLoading(false);
    };
    init();
  }, []);

  const loadData = async (userId: string) => {
    try {
      const [friendsList, incoming, outgoing] = await Promise.all([
        FriendService.getFriends(userId),
        FriendService.getIncomingRequests(userId),
        FriendService.getOutgoingRequests(userId),
      ]);
      setFriends(friendsList);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      console.error('Failed to load friends data:', err);
    }
  };

  const onRefresh = useCallback(async () => {
    if (!currentUserId) return;
    setRefreshing(true);
    await loadData(currentUserId);
    setRefreshing(false);
  }, [currentUserId]);

  const handleAccept = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      await FriendService.acceptFriendRequest(friendshipId);
      AnalyticsService.trackEvent('friend_request_accepted');
      if (currentUserId) await loadData(currentUserId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to accept request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      await FriendService.rejectFriendRequest(friendshipId);
      if (currentUserId) await loadData(currentUserId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to reject request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (friendshipId: string) => {
    Alert.alert('Remove Friend', 'Are you sure you want to remove this friend?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setActionLoading(friendshipId);
          try {
            await FriendService.removeFriend(friendshipId);
            if (currentUserId) await loadData(currentUserId);
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to remove friend');
          } finally {
            setActionLoading(null);
          }
        }
      },
    ]);
  };

  const handleCancelRequest = async (friendshipId: string) => {
    setActionLoading(friendshipId);
    try {
      await FriendService.removeFriend(friendshipId);
      if (currentUserId) await loadData(currentUserId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const users = await AuthService.searchUsers(searchQuery);
      setSearchResults(users);

      // Load friendship status for each result
      if (currentUserId && users.length > 0) {
        const statuses: Record<string, { status: FriendshipStatus; friendshipId?: string }> = {};
        await Promise.all(users.map(async (user) => {
          if (user.id === currentUserId) {
            statuses[user.id] = { status: 'none' };
          } else {
            statuses[user.id] = await FriendService.getFriendshipStatus(currentUserId, user.id);
          }
        }));
        setFriendshipStatuses(statuses);
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, currentUserId]);

  const handleSendRequest = async (userId: string) => {
    setActionLoading(userId);
    try {
      await FriendService.sendFriendRequest(userId);
      AnalyticsService.trackEvent('friend_request_sent');
      setFriendshipStatuses(prev => ({
        ...prev,
        [userId]: { status: 'pending' },
      }));
      if (currentUserId) await loadData(currentUserId);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send friend request');
    } finally {
      setActionLoading(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setFriendshipStatuses({});
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'record') navigation.navigate('Record');
    else if (tab === 'profile') navigation.navigate('Profile');
    else if (tab === 'leaderboard') navigation.navigate('Leaderboard');
    else if (tab === 'feed') navigation.navigate('Feed');
  };

  const renderFriendItem = ({ item }: { item: FriendWithProfile }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => navigation.navigate('UserProfile', { userId: item.profile.id })}
      activeOpacity={0.7}
    >
      <View style={styles.userAvatar}>
        {item.profile.avatarUrl ? (
          <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <User color="#E65100" size={24} />
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.profile.username}</Text>
        {item.profile.bio ? (
          <Text style={styles.userBio} numberOfLines={1}>{item.profile.bio}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderIncomingItem = ({ item }: { item: FriendWithProfile }) => (
    <View style={styles.userCard}>
      <TouchableOpacity
        style={styles.userCardContent}
        onPress={() => navigation.navigate('UserProfile', { userId: item.profile.id })}
        activeOpacity={0.7}
      >
        <View style={styles.userAvatar}>
          {item.profile.avatarUrl ? (
            <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <User color="#E65100" size={24} />
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.profile.username}</Text>
          {item.profile.bio ? (
            <Text style={styles.userBio} numberOfLines={1}>{item.profile.bio}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <View style={styles.actionButtons}>
        {actionLoading === item.friendship.id ? (
          <ActivityIndicator size="small" color="#E65100" />
        ) : (
          <>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => handleAccept(item.friendship.id)}
            >
              <Check color="#FFFFFF" size={18} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => handleReject(item.friendship.id)}
            >
              <XCircle color="#FFFFFF" size={18} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  const renderOutgoingItem = ({ item }: { item: FriendWithProfile }) => (
    <View style={styles.userCard}>
      <TouchableOpacity
        style={styles.userCardContent}
        onPress={() => navigation.navigate('UserProfile', { userId: item.profile.id })}
        activeOpacity={0.7}
      >
        <View style={styles.userAvatar}>
          {item.profile.avatarUrl ? (
            <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <User color="#E65100" size={24} />
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.profile.username}</Text>
          <Text style={styles.pendingLabel}>Pending</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actionButtons}>
        {actionLoading === item.friendship.id ? (
          <ActivityIndicator size="small" color="#E65100" />
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancelRequest(item.friendship.id)}
          >
            <X color="#FFFFFF" size={18} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderSearchItem = ({ item }: { item: UserProfile }) => {
    const isCurrentUser = item.id === currentUserId;
    const friendshipInfo = friendshipStatuses[item.id];
    const status = friendshipInfo?.status || 'none';

    return (
      <View style={styles.userCard}>
        <TouchableOpacity
          style={styles.userCardContent}
          onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
          activeOpacity={0.7}
        >
          <View style={styles.userAvatar}>
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <User color="#E65100" size={24} />
            )}
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username}>{item.username}</Text>
            {item.bio ? (
              <Text style={styles.userBio} numberOfLines={1}>{item.bio}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
        {!isCurrentUser && (
          <View style={styles.actionButtons}>
            {actionLoading === item.id ? (
              <ActivityIndicator size="small" color="#E65100" />
            ) : status === 'none' ? (
              <TouchableOpacity
                style={styles.addFriendBtn}
                onPress={() => handleSendRequest(item.id)}
              >
                <UserPlus color="#FFFFFF" size={16} />
              </TouchableOpacity>
            ) : status === 'pending' ? (
              <View style={styles.statusBadge}>
                <Clock color="#E65100" size={14} />
                <Text style={styles.statusText}>Pending</Text>
              </View>
            ) : status === 'accepted' ? (
              <View style={styles.statusBadge}>
                <Check color="#4CAF50" size={14} />
                <Text style={[styles.statusText, { color: '#4CAF50' }]}>Friends</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContent}>
          <ActivityIndicator color="#E65100" size="large" />
        </View>
      );
    }

    switch (activeTab) {
      case 'friends':
        if (friends.length === 0) {
          return (
            <View style={styles.centerContent}>
              <Users color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>No friends yet</Text>
              <Text style={styles.emptyHint}>Search for users and send friend requests</Text>
            </View>
          );
        }
        return (
          <FlatList
            data={friends}
            renderItem={renderFriendItem}
            keyExtractor={(item) => item.friendship.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65100" />
            }
          />
        );

      case 'requests':
        if (incomingRequests.length === 0) {
          return (
            <View style={styles.centerContent}>
              <UserPlus color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>No pending requests</Text>
              <Text style={styles.emptyHint}>Friend requests will appear here</Text>
            </View>
          );
        }
        return (
          <FlatList
            data={incomingRequests}
            renderItem={renderIncomingItem}
            keyExtractor={(item) => item.friendship.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65100" />
            }
          />
        );

      case 'pending':
        if (outgoingRequests.length === 0) {
          return (
            <View style={styles.centerContent}>
              <Clock color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>No pending requests</Text>
              <Text style={styles.emptyHint}>Requests you've sent will appear here</Text>
            </View>
          );
        }
        return (
          <FlatList
            data={outgoingRequests}
            renderItem={renderOutgoingItem}
            keyExtractor={(item) => item.friendship.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65100" />
            }
          />
        );

      case 'search':
        return (
          <View style={styles.searchContent}>
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <Search color="#999999" size={20} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by username..."
                  placeholderTextColor="#999999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                    <X color="#999999" size={18} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity
                style={[styles.searchButton, searchQuery.trim().length < 2 && styles.searchButtonDisabled]}
                onPress={handleSearch}
                disabled={searchQuery.trim().length < 2}
              >
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>

            {searchLoading ? (
              <View style={styles.centerContent}>
                <ActivityIndicator color="#E65100" size="large" />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : hasSearched && searchResults.length === 0 ? (
              <View style={styles.centerContent}>
                <Users color="#CCCCCC" size={48} />
                <Text style={styles.emptyText}>No users found</Text>
                <Text style={styles.emptyHint}>Try a different search term</Text>
              </View>
            ) : !hasSearched ? (
              <View style={styles.centerContent}>
                <Search color="#CCCCCC" size={48} />
                <Text style={styles.emptyText}>Search for users</Text>
                <Text style={styles.emptyHint}>Enter at least 2 characters to search</Text>
              </View>
            ) : (
              <FlatList
                data={searchResults}
                renderItem={renderSearchItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        );
    }
  };

  const tabs: { key: FriendsTab; label: string; count?: number }[] = [
    { key: 'friends', label: 'Friends', count: friends.length },
    { key: 'requests', label: 'Requests', count: incomingRequests.length },
    { key: 'pending', label: 'Sent', count: outgoingRequests.length },
    { key: 'search', label: 'Search' },
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <UserPlus color="#E65100" size={28} />
          <Text style={styles.headerTitle}>Friends</Text>
        </View>

        <View style={styles.segmentBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.segmentTab, activeTab === tab.key && styles.segmentTabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.segmentLabel, activeTab === tab.key && styles.segmentLabelActive]}>
                {tab.label}
              </Text>
              {tab.count !== undefined && tab.count > 0 && (
                <View style={[styles.badge, activeTab === tab.key && styles.badgeActive]}>
                  <Text style={[styles.badgeText, activeTab === tab.key && styles.badgeTextActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>
          {renderContent()}
        </View>
      </SafeAreaView>
      <BottomTabBar activeTab="friends" onTabPress={handleTabPress} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  segmentBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 6,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    gap: 4,
  },
  segmentTabActive: {
    backgroundColor: '#E65100',
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  segmentLabelActive: {
    color: '#FFFFFF',
  },
  badge: {
    backgroundColor: '#E0E0E0',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666666',
  },
  badgeTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#666666',
  },
  emptyHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666666',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  userCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  userBio: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },
  pendingLabel: {
    fontSize: 12,
    color: '#E65100',
    marginTop: 2,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#999999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFriendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E65100',
  },
  searchContent: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 12,
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    backgroundColor: '#E65100',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
