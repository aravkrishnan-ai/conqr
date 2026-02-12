import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Image, TextInput, RefreshControl,
  Modal, Alert, KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Newspaper, Plus, User, Heart, MessageCircle, Share2,
  X, Send, MapPin, Clock, Map, Trash2, Activity,
  Footprints, Bike, PersonStanding
} from 'lucide-react-native';
import Svg, { Polyline as SvgPolyline, Circle, Polygon as SvgPolygon, Line, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import SharePreviewModal from '../components/SharePreviewModal';
import { FeedService } from '../services/FeedService';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';
import { supabase } from '../lib/supabase';
import { Post, PostComment, PostType, Activity as ActivityType, Territory, GPSPoint } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';
import { AnalyticsService } from '../services/AnalyticsService';
import {
  gpsPointsToSvgPath, territoryPolygonToSvg, flattenPolylines,
  formatDistance, formatDuration, formatPace, formatArea,
} from '../utils/shareCardUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_MAP_WIDTH = SCREEN_WIDTH - 72; // 20px list padding * 2 + 16px card padding * 2
const CARD_MAP_HEIGHT = 220;

interface FeedScreenProps {
  navigation: any;
}

export default function FeedScreen({ navigation }: FeedScreenProps) {
  useScreenTracking('Feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Create post state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState<PostType>('text');
  const [creating, setCreating] = useState(false);
  const [userActivities, setUserActivities] = useState<ActivityType[]>([]);
  const [userTerritories, setUserTerritories] = useState<Territory[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | undefined>();
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | undefined>();
  const [showAttachPicker, setShowAttachPicker] = useState(false);

  // Comment state
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    };
    init();
  }, []);

  const loadFeed = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const feed = await FeedService.getFeed();
      setPosts(feed);
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  const onRefresh = useCallback(() => {
    loadFeed(true);
  }, [loadFeed]);

  const loadUserContent = async () => {
    if (!currentUserId) return;
    try {
      const [activities, territories] = await Promise.all([
        ActivityService.getUserActivities(currentUserId),
        TerritoryService.getUserTerritories(currentUserId),
      ]);
      setUserActivities(activities);
      setUserTerritories(territories);
    } catch (err) {
      console.error('Failed to load user content:', err);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) {
      Alert.alert('Error', 'Post content cannot be empty');
      return;
    }

    setCreating(true);
    try {
      await FeedService.createPost(
        newPostContent.trim(),
        newPostType,
        selectedActivityId,
        selectedTerritoryId
      );
      AnalyticsService.trackEvent('post_created', { postType: newPostType });
      setNewPostContent('');
      setNewPostType('text');
      setSelectedActivityId(undefined);
      setSelectedTerritoryId(undefined);
      setShowCreateModal(false);
      await loadFeed();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create post');
    } finally {
      setCreating(false);
    }
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setActionLoading(postId);
    try {
      if (isLiked) {
        await FeedService.unlikePost(postId);
      } else {
        await FeedService.likePost(postId);
        AnalyticsService.trackEvent('post_liked', { postId });
      }
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? {
              ...p,
              isLikedByMe: !isLiked,
              likeCount: isLiked ? p.likeCount - 1 : p.likeCount + 1,
            }
          : p
      ));
    } catch (err) {
      console.error('Like error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleComments = async (postId: string) => {
    if (expandedComments === postId) {
      setExpandedComments(null);
      setComments([]);
      return;
    }

    setExpandedComments(postId);
    setCommentsLoading(true);
    try {
      const postComments = await FeedService.getComments(postId);
      setComments(postComments);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async (postId: string) => {
    if (!newComment.trim()) return;

    setSendingComment(true);
    try {
      const comment = await FeedService.addComment(postId, newComment.trim());
      AnalyticsService.trackEvent('comment_added', { postId });
      setComments(prev => [...prev, comment]);
      setNewComment('');
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
      ));
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add comment');
    } finally {
      setSendingComment(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await FeedService.deletePost(postId);
            setPosts(prev => prev.filter(p => p.id !== postId));
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to delete post');
          }
        }
      },
    ]);
  };

  const handleSharePost = (post: Post) => {
    setSharePost(post);
    setShowShareModal(true);
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getActivityTypeLabel = (type: string): string => {
    switch (type?.toUpperCase()) {
      case 'RUN': return 'Run';
      case 'RIDE': return 'Ride';
      case 'WALK': return 'Walk';
      default: return 'Activity';
    }
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'RUN': return <Footprints color="#FFFFFF" size={14} />;
      case 'RIDE': return <Bike color="#FFFFFF" size={14} />;
      case 'WALK': return <PersonStanding color="#FFFFFF" size={14} />;
      default: return <Activity color="#FFFFFF" size={14} />;
    }
  };

  const handleTabPress = (tab: 'home' | 'record' | 'profile' | 'friends' | 'leaderboard' | 'feed') => {
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'record') navigation.navigate('Record');
    else if (tab === 'profile') navigation.navigate('Profile');
    else if (tab === 'friends') navigation.navigate('Friends');
    else if (tab === 'leaderboard') navigation.navigate('Leaderboard');
  };

  const openCreateModal = () => {
    setNewPostContent('');
    setNewPostType('text');
    setSelectedActivityId(undefined);
    setSelectedTerritoryId(undefined);
    setShowAttachPicker(false);
    loadUserContent();
    setShowCreateModal(true);
  };

  // Render subtle grid background for map cards (Strava-like depth)
  const renderMapGrid = () => {
    const lines = [];
    const gridSpacing = 28;
    const gridColor = 'rgba(255, 255, 255, 0.04)';
    for (let x = gridSpacing; x < CARD_MAP_WIDTH; x += gridSpacing) {
      lines.push(
        <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={CARD_MAP_HEIGHT} stroke={gridColor} strokeWidth={0.5} />
      );
    }
    for (let y = gridSpacing; y < CARD_MAP_HEIGHT; y += gridSpacing) {
      lines.push(
        <Line key={`h${y}`} x1={0} y1={y} x2={CARD_MAP_WIDTH} y2={y} stroke={gridColor} strokeWidth={0.5} />
      );
    }
    return lines;
  };

  // Render inline SVG route map for activity posts
  const renderActivityMap = (activity: ActivityType) => {
    const flatPath = flattenPolylines(activity.polylines || []);
    if (flatPath.length < 2) return null;

    const svgData = gpsPointsToSvgPath(flatPath, CARD_MAP_WIDTH, CARD_MAP_HEIGHT);
    const pace = formatPace(activity.averageSpeed || 0);

    return (
      <TouchableOpacity
        style={styles.activityMapCard}
        onPress={() => navigation.navigate('ActivityDetails', { activityId: activity.id })}
        activeOpacity={0.8}
      >
        {/* Route visualization */}
        <View style={styles.mapContainer}>
          <Svg
            width={CARD_MAP_WIDTH}
            height={CARD_MAP_HEIGHT}
            viewBox={`0 0 ${CARD_MAP_WIDTH} ${CARD_MAP_HEIGHT}`}
          >
            <Defs>
              <LinearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#FC4C02" stopOpacity={1} />
                <Stop offset="100%" stopColor="#FDBA74" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            {/* Dark background */}
            <Rect x={0} y={0} width={CARD_MAP_WIDTH} height={CARD_MAP_HEIGHT} fill="#111111" />
            {/* Grid lines for depth */}
            {renderMapGrid()}
            {/* Wide soft glow */}
            <SvgPolyline
              points={svgData.points}
              fill="none"
              stroke="rgba(252, 76, 2, 0.12)"
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Inner glow */}
            <SvgPolyline
              points={svgData.points}
              fill="none"
              stroke="rgba(252, 76, 2, 0.25)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Main route line */}
            <SvgPolyline
              points={svgData.points}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Start marker - outer ring */}
            <Circle
              cx={svgData.startPoint.x}
              cy={svgData.startPoint.y}
              r={8}
              fill="none"
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth={1.5}
            />
            {/* Start marker - inner dot */}
            <Circle
              cx={svgData.startPoint.x}
              cy={svgData.startPoint.y}
              r={4}
              fill="#00D26A"
            />
            {/* End marker - outer ring */}
            <Circle
              cx={svgData.endPoint.x}
              cy={svgData.endPoint.y}
              r={8}
              fill="none"
              stroke="rgba(255, 255, 255, 0.5)"
              strokeWidth={1.5}
            />
            {/* End marker - inner dot */}
            <Circle
              cx={svgData.endPoint.x}
              cy={svgData.endPoint.y}
              r={4}
              fill="#FC4C02"
            />
          </Svg>
        </View>

        {/* Stats row */}
        <View style={styles.activityStatsRow}>
          <View style={styles.activityTypeBadge}>
            {getActivityTypeIcon(activity.type)}
            <Text style={styles.activityTypeBadgeText}>{getActivityTypeLabel(activity.type)}</Text>
          </View>
          <View style={styles.activityStatsGroup}>
            <View style={styles.activityStat}>
              <Text style={styles.activityStatValue}>{formatDistance(activity.distance)}</Text>
              <Text style={styles.activityStatLabel}>Distance</Text>
            </View>
            <View style={styles.activityStatDivider} />
            <View style={styles.activityStat}>
              <Text style={styles.activityStatValue}>{formatDuration(activity.duration)}</Text>
              <Text style={styles.activityStatLabel}>Time</Text>
            </View>
            <View style={styles.activityStatDivider} />
            <View style={styles.activityStat}>
              <Text style={styles.activityStatValue}>{pace}</Text>
              <Text style={styles.activityStatLabel}>Pace</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render inline SVG territory polygon for territory posts
  const renderTerritoryMap = (territory: Territory) => {
    if (!territory.polygon || territory.polygon.length < 3) return null;

    const svgData = territoryPolygonToSvg(territory.polygon, CARD_MAP_WIDTH, CARD_MAP_HEIGHT);

    return (
      <TouchableOpacity
        style={styles.activityMapCard}
        onPress={() => {
          navigation.navigate('Home', {
            focusTerritoryLat: territory.center.lat,
            focusTerritoryLng: territory.center.lng,
          });
        }}
        activeOpacity={0.8}
      >
        {/* Territory polygon visualization */}
        <View style={styles.mapContainer}>
          <Svg
            width={CARD_MAP_WIDTH}
            height={CARD_MAP_HEIGHT}
            viewBox={`0 0 ${CARD_MAP_WIDTH} ${CARD_MAP_HEIGHT}`}
          >
            <Defs>
              <LinearGradient id="territoryFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#FC4C02" stopOpacity={0.3} />
                <Stop offset="100%" stopColor="#FC4C02" stopOpacity={0.1} />
              </LinearGradient>
            </Defs>
            {/* Dark background */}
            <Rect x={0} y={0} width={CARD_MAP_WIDTH} height={CARD_MAP_HEIGHT} fill="#111111" />
            {/* Grid lines for depth */}
            {renderMapGrid()}
            {/* Outer glow */}
            <SvgPolygon
              points={svgData.points}
              fill="none"
              stroke="rgba(252, 76, 2, 0.15)"
              strokeWidth={8}
              strokeLinejoin="round"
            />
            {/* Filled polygon */}
            <SvgPolygon
              points={svgData.points}
              fill="url(#territoryFill)"
              stroke="rgba(252, 76, 2, 0.5)"
              strokeWidth={3}
              strokeLinejoin="round"
            />
            {/* Crisp border */}
            <SvgPolygon
              points={svgData.points}
              fill="none"
              stroke="#FC4C02"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
        </View>

        {/* Territory info */}
        <View style={styles.activityStatsRow}>
          <View style={[styles.activityTypeBadge, styles.territoryBadge]}>
            <Map color="#FFFFFF" size={14} />
            <Text style={styles.activityTypeBadgeText}>Territory</Text>
          </View>
          <View style={styles.activityStatsGroup}>
            <View style={styles.activityStat}>
              <Text style={styles.activityStatValue} numberOfLines={1}>
                {territory.name || 'Unnamed'}
              </Text>
              <Text style={styles.activityStatLabel}>Name</Text>
            </View>
            <View style={styles.activityStatDivider} />
            <View style={styles.activityStat}>
              <Text style={styles.activityStatValue}>{formatArea(territory.area)}</Text>
              <Text style={styles.activityStatLabel}>Area</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPostCard = ({ item }: { item: Post }) => {
    const isOwner = item.userId === currentUserId;
    const hasActivityMap = item.postType === 'activity_share' && item.activity;
    const hasTerritoryMap = item.postType === 'territory_share' && item.territory;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <TouchableOpacity
            style={styles.postUserRow}
            onPress={() => {
              if (isOwner) {
                navigation.navigate('Profile');
              } else {
                navigation.navigate('UserProfile', { userId: item.userId });
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.postAvatar}>
              {item.userAvatarUrl ? (
                <Image source={{ uri: item.userAvatarUrl }} style={styles.postAvatarImage} />
              ) : (
                <User color="#E65100" size={20} />
              )}
            </View>
            <View>
              <Text style={styles.postUsername}>{item.username}</Text>
              <Text style={styles.postTime}>
                {formatTimeAgo(item.createdAt)}
                {hasActivityMap && ` \u00B7 ${getActivityTypeLabel(item.activity!.type)}`}
                {hasTerritoryMap && ' \u00B7 Territory'}
              </Text>
            </View>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity onPress={() => handleDeletePost(item.id)} style={styles.deleteBtn}>
              <Trash2 color="#999999" size={16} />
            </TouchableOpacity>
          )}
        </View>

        {/* Strava-like activity map card */}
        {hasActivityMap && renderActivityMap(item.activity!)}

        {/* Strava-like territory map card */}
        {hasTerritoryMap && renderTerritoryMap(item.territory!)}

        {/* Fallback attachment card for posts without loaded data */}
        {item.postType === 'activity_share' && item.activityId && !item.activity && (
          <TouchableOpacity
            style={styles.attachmentCard}
            onPress={() => navigation.navigate('ActivityDetails', { activityId: item.activityId })}
            activeOpacity={0.7}
          >
            <View style={styles.attachmentIcon}>
              <Activity color="#E65100" size={20} />
            </View>
            <View style={styles.attachmentInfo}>
              <Text style={styles.attachmentTitle}>Activity</Text>
              <Text style={styles.attachmentDetail}>Tap to view details</Text>
            </View>
          </TouchableOpacity>
        )}

        {item.postType === 'territory_share' && item.territoryId && !item.territory && (
          <TouchableOpacity
            style={styles.attachmentCard}
            onPress={async () => {
              try {
                const territory = await TerritoryService.getTerritoryById(item.territoryId!);
                if (territory) {
                  navigation.navigate('Home', {
                    focusTerritoryLat: territory.center.lat,
                    focusTerritoryLng: territory.center.lng,
                  });
                } else {
                  Alert.alert('Not Found', 'This territory could not be found.');
                }
              } catch {
                Alert.alert('Error', 'Failed to load territory.');
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.attachmentIcon}>
              <Map color="#E65100" size={20} />
            </View>
            <View style={styles.attachmentInfo}>
              <Text style={styles.attachmentTitle}>Territory Claimed</Text>
              <Text style={styles.attachmentDetail}>Tap to view on map</Text>
            </View>
          </TouchableOpacity>
        )}

        {item.content ? (
          <Text style={styles.postContent}>{item.content}</Text>
        ) : null}

        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleLike(item.id, item.isLikedByMe)}
            disabled={actionLoading === item.id}
          >
            <Heart
              color={item.isLikedByMe ? '#E65100' : '#999999'}
              size={20}
              fill={item.isLikedByMe ? '#E65100' : 'transparent'}
            />
            {item.likeCount > 0 && (
              <Text style={[styles.actionCount, item.isLikedByMe && styles.actionCountActive]}>
                {item.likeCount}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleToggleComments(item.id)}
          >
            <MessageCircle
              color={expandedComments === item.id ? '#E65100' : '#999999'}
              size={20}
            />
            {item.commentCount > 0 && (
              <Text style={[styles.actionCount, expandedComments === item.id && styles.actionCountActive]}>
                {item.commentCount}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSharePost(item)}
          >
            <Share2 color="#999999" size={20} />
          </TouchableOpacity>
        </View>

        {expandedComments === item.id && (
          <View style={styles.commentsSection}>
            {commentsLoading ? (
              <ActivityIndicator size="small" color="#E65100" style={styles.commentsLoader} />
            ) : (
              <>
                {comments.map((comment) => (
                  <View key={comment.id} style={styles.commentRow}>
                    <View style={styles.commentAvatar}>
                      {comment.userAvatarUrl ? (
                        <Image source={{ uri: comment.userAvatarUrl }} style={styles.commentAvatarImage} />
                      ) : (
                        <User color="#E65100" size={14} />
                      )}
                    </View>
                    <View style={styles.commentContent}>
                      <Text style={styles.commentUsername}>{comment.username}</Text>
                      <Text style={styles.commentText}>{comment.content}</Text>
                      <Text style={styles.commentTime}>{formatTimeAgo(comment.createdAt)}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.commentInputRow}>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Write a comment..."
                    placeholderTextColor="#999999"
                    value={newComment}
                    onChangeText={setNewComment}
                    maxLength={500}
                  />
                  <TouchableOpacity
                    style={[styles.commentSendBtn, !newComment.trim() && styles.commentSendBtnDisabled]}
                    onPress={() => handleAddComment(item.id)}
                    disabled={!newComment.trim() || sendingComment}
                  >
                    {sendingComment ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Send color="#FFFFFF" size={16} />
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#E65100" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Newspaper color="#E65100" size={28} />
            <Text style={styles.headerTitle}>Feed</Text>
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={openCreateModal}>
            <Plus color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={posts}
          renderItem={renderPostCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E65100" colors={['#E65100']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Newspaper color="#CCCCCC" size={48} />
              <Text style={styles.emptyText}>No posts yet</Text>
              <Text style={styles.emptyHint}>Be the first to share something!</Text>
            </View>
          }
        />
      </SafeAreaView>
      <BottomTabBar activeTab="feed" onTabPress={handleTabPress} />

      {/* Create Post Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <X color="#666666" size={24} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Post</Text>
            <TouchableOpacity
              style={[styles.postBtn, (!newPostContent.trim() || creating) && styles.postBtnDisabled]}
              onPress={handleCreatePost}
              disabled={!newPostContent.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.postBtnText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.modalContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TextInput
              style={styles.postInput}
              placeholder="What's on your mind?"
              placeholderTextColor="#999999"
              value={newPostContent}
              onChangeText={setNewPostContent}
              multiline
              maxLength={1000}
              autoFocus
            />

            <View style={styles.postTypeRow}>
              {(['text', 'activity_share', 'territory_share'] as PostType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.postTypeBtn, newPostType === type && styles.postTypeBtnActive]}
                  onPress={() => {
                    setNewPostType(type);
                    setSelectedActivityId(undefined);
                    setSelectedTerritoryId(undefined);
                    if (type !== 'text') setShowAttachPicker(true);
                    else setShowAttachPicker(false);
                  }}
                >
                  {type === 'text' && <Newspaper size={16} color={newPostType === type ? '#FFFFFF' : '#666666'} />}
                  {type === 'activity_share' && <Activity size={16} color={newPostType === type ? '#FFFFFF' : '#666666'} />}
                  {type === 'territory_share' && <Map size={16} color={newPostType === type ? '#FFFFFF' : '#666666'} />}
                  <Text style={[styles.postTypeText, newPostType === type && styles.postTypeTextActive]}>
                    {type === 'text' ? 'Text' : type === 'activity_share' ? 'Run' : 'Territory'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {showAttachPicker && newPostType === 'activity_share' && (
              <View style={styles.attachPicker}>
                <Text style={styles.attachPickerTitle}>Select an activity:</Text>
                {userActivities.length === 0 ? (
                  <Text style={styles.attachPickerEmpty}>No activities yet</Text>
                ) : (
                  userActivities.slice(0, 10).map((act) => (
                    <TouchableOpacity
                      key={act.id}
                      style={[styles.attachItem, selectedActivityId === act.id && styles.attachItemSelected]}
                      onPress={() => setSelectedActivityId(act.id)}
                    >
                      <Activity size={16} color={selectedActivityId === act.id ? '#E65100' : '#666666'} />
                      <Text style={[styles.attachItemText, selectedActivityId === act.id && styles.attachItemTextSelected]}>
                        {act.type} - {formatDistance(act.distance)} - {Math.floor(act.duration / 60)}min
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {showAttachPicker && newPostType === 'territory_share' && (
              <View style={styles.attachPicker}>
                <Text style={styles.attachPickerTitle}>Select a territory:</Text>
                {userTerritories.length === 0 ? (
                  <Text style={styles.attachPickerEmpty}>No territories yet</Text>
                ) : (
                  userTerritories.slice(0, 10).map((ter) => (
                    <TouchableOpacity
                      key={ter.id}
                      style={[styles.attachItem, selectedTerritoryId === ter.id && styles.attachItemSelected]}
                      onPress={() => setSelectedTerritoryId(ter.id)}
                    >
                      <Map size={16} color={selectedTerritoryId === ter.id ? '#E65100' : '#666666'} />
                      <Text style={[styles.attachItemText, selectedTerritoryId === ter.id && styles.attachItemTextSelected]}>
                        {ter.name || 'Unnamed'} - {formatArea(ter.area)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Share Post Modal */}
      {sharePost && (
        <SharePreviewModal
          visible={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSharePost(null);
          }}
          cardType="post"
          post={sharePost}
        />
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  createBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
  },

  // Post card
  postCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  postUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(230, 81, 0, 0.15)',
  },
  postAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  postUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  postTime: {
    fontSize: 12,
    color: '#999999',
    marginTop: 1,
  },
  deleteBtn: {
    padding: 8,
  },
  postContent: {
    fontSize: 15,
    color: '#1A1A1A',
    lineHeight: 22,
    marginBottom: 12,
  },

  // Strava-like activity map card
  activityMapCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  mapContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  activityStatsRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#141414',
  },
  activityTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E65100',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    marginBottom: 8,
  },
  territoryBadge: {
    backgroundColor: '#2E7D32',
  },
  activityTypeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activityStatsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityStat: {
    flex: 1,
    alignItems: 'center',
  },
  activityStatValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  activityStatLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  activityStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },

  // Fallback attachment card
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  attachmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  attachmentInfo: {
    flex: 1,
  },
  attachmentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  attachmentDetail: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },

  // Actions
  postActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    paddingTop: 12,
    gap: 24,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999999',
  },
  actionCountActive: {
    color: '#E65100',
  },

  // Comments section
  commentsSection: {
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    marginTop: 12,
    paddingTop: 12,
  },
  commentsLoader: {
    paddingVertical: 16,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  commentAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  commentText: {
    fontSize: 13,
    color: '#333333',
    lineHeight: 18,
    marginTop: 2,
  },
  commentTime: {
    fontSize: 12,
    color: '#999999',
    marginTop: 4,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1A1A1A',
  },
  commentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E65100',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendBtnDisabled: {
    backgroundColor: '#CCCCCC',
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  postBtn: {
    backgroundColor: '#E65100',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  postBtnDisabled: {
    backgroundColor: '#CCCCCC',
  },
  postBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  postInput: {
    fontSize: 16,
    color: '#1A1A1A',
    lineHeight: 24,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  postTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 16,
  },
  postTypeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  postTypeBtnActive: {
    backgroundColor: '#E65100',
  },
  postTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  postTypeTextActive: {
    color: '#FFFFFF',
  },

  // Attach picker
  attachPicker: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
  },
  attachPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  attachPickerEmpty: {
    fontSize: 13,
    color: '#999999',
    fontStyle: 'italic',
  },
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  attachItemSelected: {
    backgroundColor: 'rgba(230, 81, 0, 0.08)',
  },
  attachItemText: {
    fontSize: 13,
    color: '#666666',
    flex: 1,
  },
  attachItemTextSelected: {
    color: '#E65100',
    fontWeight: '600',
  },
});
