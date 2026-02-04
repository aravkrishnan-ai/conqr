import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl, TextInput, Alert } from 'react-native';
import { ArrowLeft, User, Mail, Footprints, PersonStanding, Bike, Map, Clock, Route, Pencil, Check, X } from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import { ActivityService } from '../services/ActivityService';
import { UserProfile, Activity } from '../lib/types';

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [showAllActivities, setShowAllActivities] = useState(false);
    const [stats, setStats] = useState<{
        totalActivities: number;
        totalDistance: number;
        totalDuration: number;
        byType: { [key: string]: { count: number; distance: number; duration: number } };
    } | null>(null);

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false);
    const [editUsername, setEditUsername] = useState('');
    const [editBio, setEditBio] = useState('');
    const [saving, setSaving] = useState(false);

    // Track if initial load has completed to prevent double-fetching
    const initialLoadComplete = React.useRef(false);
    const isFetching = React.useRef(false);

    const fetchData = useCallback(async (showRefreshing = false) => {
        // Prevent concurrent fetches
        if (isFetching.current) {
            return;
        }
        isFetching.current = true;

        if (showRefreshing) setRefreshing(true);
        try {
            const p = await AuthService.getCurrentProfile();
            setProfile(p);

            // Fetch activities and stats
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const userActivities = await ActivityService.getUserActivities(session.user.id);
                setActivities(userActivities);
                // Pass activities to avoid double-fetching
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

    // Initial load only
    useEffect(() => {
        if (!initialLoadComplete.current) {
            initialLoadComplete.current = true;
            fetchData();
        }
    }, [fetchData]);

    // Refresh when screen comes into focus (but not on initial mount)
    useFocusEffect(
        useCallback(() => {
            // Skip if this is the initial mount (useEffect will handle it)
            if (loading) {
                return;
            }
            // Refresh data when returning to this screen
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

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color="#FC4C02" />
            </View>
        );
    }

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const formatDistance = (meters: number) => {
        if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
        return `${Math.round(meters)} m`;
    };

    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'RUN': return <PersonStanding color="#FC4C02" size={20} />;
            case 'RIDE': return <Bike color="#FC4C02" size={20} />;
            default: return <Footprints color="#FC4C02" size={20} />;
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                {isEditing ? (
                    <View style={styles.editActions}>
                        <TouchableOpacity onPress={cancelEditing} style={styles.editActionBtn}>
                            <X color="#71717a" size={20} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={saveEdits} disabled={saving} style={styles.editActionBtn}>
                            {saving ? (
                                <ActivityIndicator size="small" color="#FC4C02" />
                            ) : (
                                <Check color="#FC4C02" size={20} />
                            )}
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity onPress={startEditing}>
                        <Pencil color="#71717a" size={20} />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={styles.scrollContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#22d3ee"
                        colors={['#22d3ee']}
                    />
                }
            >
                <View style={styles.content}>
                    <View style={styles.profileHeader}>
                        {profile?.avatarUrl ? (
                            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <User color="#FC4C02" size={40} />
                            </View>
                        )}
                        {isEditing ? (
                            <View style={styles.editFields}>
                                <TextInput
                                    style={styles.editInput}
                                    value={editUsername}
                                    onChangeText={setEditUsername}
                                    placeholder="Username"
                                    placeholderTextColor="#52525b"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    maxLength={24}
                                />
                                <TextInput
                                    style={[styles.editInput, styles.editBioInput]}
                                    value={editBio}
                                    onChangeText={setEditBio}
                                    placeholder="Add a bio..."
                                    placeholderTextColor="#52525b"
                                    multiline
                                    maxLength={120}
                                />
                            </View>
                        ) : (
                            <>
                                <Text style={styles.username}>{profile?.username || 'Conqueror'}</Text>
                                {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                            </>
                        )}
                    </View>

                    {/* Activity Stats */}
                    {stats && stats.totalActivities > 0 && (
                        <View style={styles.statsSection}>
                            <Text style={styles.sectionTitle}>Your Stats</Text>
                            <View style={styles.statsGrid}>
                                <View style={styles.statCard}>
                                    <Route color="#FC4C02" size={24} />
                                    <Text style={styles.statValue}>{formatDistance(stats.totalDistance)}</Text>
                                    <Text style={styles.statLabel}>Total Distance</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Clock color="#FC4C02" size={24} />
                                    <Text style={styles.statValue}>{formatDuration(stats.totalDuration)}</Text>
                                    <Text style={styles.statLabel}>Total Time</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Map color="#FC4C02" size={24} />
                                    <Text style={styles.statValue}>{stats.totalActivities}</Text>
                                    <Text style={styles.statLabel}>Activities</Text>
                                </View>
                            </View>

                            {/* Activity Type Breakdown */}
                            {Object.keys(stats.byType).length > 0 && (
                                <View style={styles.typeBreakdown}>
                                    {stats.byType['WALK'] && (
                                        <View style={styles.typeRow}>
                                            <View style={styles.typeIconContainer}>
                                                <Footprints color="#FC4C02" size={16} />
                                            </View>
                                            <Text style={styles.typeName}>Walks</Text>
                                            <Text style={styles.typeCount}>{stats.byType['WALK'].count}</Text>
                                            <Text style={styles.typeDistance}>{formatDistance(stats.byType['WALK'].distance)}</Text>
                                        </View>
                                    )}
                                    {stats.byType['RUN'] && (
                                        <View style={styles.typeRow}>
                                            <View style={styles.typeIconContainer}>
                                                <PersonStanding color="#FC4C02" size={16} />
                                            </View>
                                            <Text style={styles.typeName}>Runs</Text>
                                            <Text style={styles.typeCount}>{stats.byType['RUN'].count}</Text>
                                            <Text style={styles.typeDistance}>{formatDistance(stats.byType['RUN'].distance)}</Text>
                                        </View>
                                    )}
                                    {stats.byType['RIDE'] && (
                                        <View style={styles.typeRow}>
                                            <View style={styles.typeIconContainer}>
                                                <Bike color="#FC4C02" size={16} />
                                            </View>
                                            <Text style={styles.typeName}>Rides</Text>
                                            <Text style={styles.typeCount}>{stats.byType['RIDE'].count}</Text>
                                            <Text style={styles.typeDistance}>{formatDistance(stats.byType['RIDE'].distance)}</Text>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {/* Activity History */}
                    <View style={styles.historySection}>
                        <Text style={styles.sectionTitle}>Activity History</Text>
                        {activities.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Footprints color="#52525b" size={40} />
                                <Text style={styles.emptyText}>No activities yet</Text>
                                <Text style={styles.emptyHint}>Start conquering to see your history!</Text>
                            </View>
                        ) : (
                            <>
                                {(showAllActivities ? activities : activities.slice(0, 5)).map((activity) => (
                                    <View key={activity.id} style={styles.activityCard}>
                                        <View style={styles.activityIcon}>
                                            {getActivityIcon(activity.type)}
                                        </View>
                                        <View style={styles.activityInfo}>
                                            <Text style={styles.activityType}>{activity.type}</Text>
                                            <Text style={styles.activityDate}>{formatDate(activity.startTime)}</Text>
                                        </View>
                                        <View style={styles.activityStats}>
                                            <Text style={styles.activityDistance}>{formatDistance(activity.distance)}</Text>
                                            <Text style={styles.activityDuration}>{formatDuration(activity.duration)}</Text>
                                        </View>
                                        {activity.territoryId && (
                                            <View style={styles.territoryBadge}>
                                                <Map color="#FC4C02" size={12} />
                                            </View>
                                        )}
                                    </View>
                                ))
                                }
                                {activities.length > 5 && (
                                    <TouchableOpacity
                                        style={styles.showMoreButton}
                                        onPress={() => setShowAllActivities(!showAllActivities)}
                                    >
                                        <Text style={styles.showMoreText}>
                                            {showAllActivities ? 'Show Less' : `Show All (${activities.length})`}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>

                    <View style={styles.infoSection}>
                        <View style={styles.infoRow}>
                            <Mail color="#71717a" size={20} />
                            <Text style={styles.infoText}>{profile?.email || 'No email linked'}</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// Strava-inspired color palette
const STRAVA_ORANGE = '#FC4C02';
const STRAVA_BG = '#121212';
const STRAVA_CARD = '#1E1E1E';
const STRAVA_BORDER = '#2D2D2D';
const STRAVA_TEXT = '#FFFFFF';
const STRAVA_TEXT_SECONDARY = '#8E8E8E';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: STRAVA_BG,
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: 8,
        borderBottomWidth: 1,
        borderBottomColor: STRAVA_BORDER,
    },
    headerTitle: {
        color: STRAVA_TEXT,
        fontSize: 18,
        fontWeight: '700',
    },
    editActions: {
        flexDirection: 'row',
        gap: 16,
    },
    editActionBtn: {
        padding: 4,
    },
    scrollContent: {
        flex: 1,
    },
    content: {
        padding: 20,
        alignItems: 'center',
    },
    profileHeader: {
        alignItems: 'center',
        marginBottom: 28,
    },
    avatarPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(252, 76, 2, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    avatar: {
        width: 96,
        height: 96,
        borderRadius: 48,
        marginBottom: 16,
    },
    username: {
        color: STRAVA_TEXT,
        fontSize: 24,
        fontWeight: '700',
    },
    bio: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 14,
        marginTop: 6,
        textAlign: 'center',
    },
    editFields: {
        width: '100%',
        maxWidth: 280,
        gap: 12,
    },
    editInput: {
        backgroundColor: STRAVA_CARD,
        borderWidth: 1,
        borderColor: STRAVA_BORDER,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: STRAVA_TEXT,
        fontSize: 16,
        textAlign: 'center',
    },
    editBioInput: {
        height: 60,
        textAlignVertical: 'top',
        textAlign: 'left',
    },
    sectionTitle: {
        color: STRAVA_TEXT,
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 12,
        alignSelf: 'flex-start',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statsSection: {
        width: '100%',
        marginBottom: 24,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    statCard: {
        flex: 1,
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },
    statValue: {
        color: STRAVA_TEXT,
        fontSize: 18,
        fontWeight: '700',
        marginTop: 8,
    },
    statLabel: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 11,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    typeBreakdown: {
        marginTop: 12,
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
        padding: 14,
    },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: STRAVA_BORDER,
    },
    typeIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(252, 76, 2, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    typeName: {
        flex: 1,
        color: STRAVA_TEXT,
        fontSize: 15,
        fontWeight: '500',
    },
    typeCount: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 14,
        marginRight: 16,
    },
    typeDistance: {
        color: STRAVA_ORANGE,
        fontSize: 14,
        fontWeight: '600',
        minWidth: 70,
        textAlign: 'right',
    },
    historySection: {
        width: '100%',
        marginBottom: 24,
    },
    emptyState: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
    },
    emptyText: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 16,
        marginTop: 12,
    },
    emptyHint: {
        color: '#606060',
        fontSize: 14,
        marginTop: 4,
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    activityIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(252, 76, 2, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    activityInfo: {
        flex: 1,
    },
    activityType: {
        color: STRAVA_TEXT,
        fontSize: 16,
        fontWeight: '600',
    },
    activityDate: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 13,
        marginTop: 2,
    },
    activityStats: {
        alignItems: 'flex-end',
    },
    activityDistance: {
        color: STRAVA_ORANGE,
        fontSize: 16,
        fontWeight: '700',
    },
    activityDuration: {
        color: STRAVA_TEXT_SECONDARY,
        fontSize: 13,
        marginTop: 2,
    },
    territoryBadge: {
        marginLeft: 10,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(252, 76, 2, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    showMoreButton: {
        marginTop: 8,
        padding: 14,
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
        alignItems: 'center',
    },
    showMoreText: {
        color: STRAVA_ORANGE,
        fontSize: 15,
        fontWeight: '600',
    },
    infoSection: {
        width: '100%',
        backgroundColor: STRAVA_CARD,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        color: STRAVA_TEXT,
        fontSize: 15,
    },
    signOutButton: {
        width: '100%',
        padding: 16,
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 40,
    },
    signOutText: {
        color: '#FF6B6B',
        fontSize: 16,
        fontWeight: '600',
    },
});
