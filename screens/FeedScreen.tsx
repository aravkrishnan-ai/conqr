import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Image, TextInput, RefreshControl,
  Modal, Alert, KeyboardAvoidingView, Platform, Share
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  Newspaper, Plus, User, Heart, MessageCircle, Share2,
  X, Send, MapPin, Clock, Map, Trash2, Activity
} from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import BottomTabBar from '../components/BottomTabBar';
import { FeedService } from '../services/FeedService';
import { ActivityService } from '../services/ActivityService';
import { TerritoryService } from '../services/TerritoryService';
import { supabase } from '../lib/supabase';
import { Post, PostComment, PostType, Activity as ActivityType, Territory } from '../lib/types';
import { useScreenTracking } from '../lib/useScreenTracking';
import { AnalyticsService } from '../services/AnalyticsService';

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

  const handleSharePost = async (post: Post) => {
    try {
      let message = post.content;
      if (post.postType === 'activity_share') {
        message += '\n\nShared via Conqr';
      } else if (post.postType === 'territory_share') {
        message += '\n\nShared via Conqr';
      }
      await Share.share({ message, title: 'Conqr Post' });
    } catch (err) {
      // User cancelled or error
    }
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

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const formatArea = (sqMeters: number): string => {
    if (sqMeters < 10000) return `${Math.round(sqMeters)} m²`;
    return `${(sqMeters / 10000).toFixed(2)} ha`;
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

  const renderPostCard = ({ item }: { item: Post }) => {
    const isOwner = item.userId === currentUserId;

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
              <Text style={styles.postTime}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
          </TouchableOpacity>
          {isOwner && (
            <TouchableOpacity onPress={() => handleDeletePost(item.id)} style={styles.deleteBtn}>
              <Trash2 color="#999999" size={16} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.postContent}>{item.content}</Text>

        {item.postType === 'activity_share' && item.activityId && (
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

        {item.postType === 'territory_share' && item.territoryId && (
          <View style={styles.attachmentCard}>
            <View style={styles.attachmentIcon}>
              <Map color="#E65100" size={20} />
            </View>
            <View style={styles.attachmentInfo}>
              <Text style={styles.attachmentTitle}>Territory Claimed</Text>
              <Text style={styles.attachmentDetail}>Tap to view on map</Text>
            </View>
          </View>
        )}

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

          {isOwner && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleSharePost(item)}
            >
              <Share2 color="#999999" size={20} />
            </TouchableOpacity>
          )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(230, 81, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  postAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
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

  // Attachment card
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
    fontSize: 11,
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
