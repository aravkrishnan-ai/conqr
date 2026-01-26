import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Image, ScrollView, RefreshControl } from 'react-native';
import { ArrowLeft, User, Mail, Footprints, PersonStanding, Bike, Map, Clock, Route } from 'lucide-react-native';
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

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color="#22d3ee" />
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
            case 'RUN': return <PersonStanding color="#22d3ee" size={20} />;
            case 'RIDE': return <Bike color="#22d3ee" size={20} />;
            default: return <Footprints color="#22d3ee" size={20} />;
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
                <View style={{ width: 24 }} />
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
                                <User color="#22d3ee" size={40} />
                            </View>
                        )}
                        <Text style={styles.username}>{profile?.username || 'Conqueror'}</Text>
                        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                    </View>

                    {/* Activity Stats */}
                    {stats && stats.totalActivities > 0 && (
                        <View style={styles.statsSection}>
                            <Text style={styles.sectionTitle}>Your Stats</Text>
                            <View style={styles.statsGrid}>
                                <View style={styles.statCard}>
                                    <Route color="#22d3ee" size={24} />
                                    <Text style={styles.statValue}>{formatDistance(stats.totalDistance)}</Text>
                                    <Text style={styles.statLabel}>Total Distance</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Clock color="#22d3ee" size={24} />
                                    <Text style={styles.statValue}>{formatDuration(stats.totalDuration)}</Text>
                                    <Text style={styles.statLabel}>Total Time</Text>
                                </View>
                                <View style={styles.statCard}>
                                    <Map color="#22d3ee" size={24} />
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
                                                <Footprints color="#22d3ee" size={16} />
                                            </View>
                                            <Text style={styles.typeName}>Walks</Text>
                                            <Text style={styles.typeCount}>{stats.byType['WALK'].count}</Text>
                                            <Text style={styles.typeDistance}>{formatDistance(stats.byType['WALK'].distance)}</Text>
                                        </View>
                                    )}
                                    {stats.byType['RUN'] && (
                                        <View style={styles.typeRow}>
                                            <View style={styles.typeIconContainer}>
                                                <PersonStanding color="#22d3ee" size={16} />
                                            </View>
                                            <Text style={styles.typeName}>Runs</Text>
                                            <Text style={styles.typeCount}>{stats.byType['RUN'].count}</Text>
                                            <Text style={styles.typeDistance}>{formatDistance(stats.byType['RUN'].distance)}</Text>
                                        </View>
                                    )}
                                    {stats.byType['RIDE'] && (
                                        <View style={styles.typeRow}>
                                            <View style={styles.typeIconContainer}>
                                                <Bike color="#22d3ee" size={16} />
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
                                                <Map color="#22d3ee" size={12} />
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    scrollContent: {
        flex: 1,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    profileHeader: {
        alignItems: 'center',
        marginBottom: 32,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#22d3ee33',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#22d3ee66',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#22d3ee',
    },
    username: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    bio: {
        color: '#a1a1aa',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    sectionTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    statsSection: {
        width: '100%',
        marginBottom: 24,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#27272a',
    },
    statValue: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 8,
    },
    statLabel: {
        color: '#71717a',
        fontSize: 11,
        marginTop: 4,
    },
    typeBreakdown: {
        marginTop: 16,
        backgroundColor: '#18181b',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    typeIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#22d3ee22',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    typeName: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
    },
    typeCount: {
        color: '#71717a',
        fontSize: 13,
        marginRight: 12,
    },
    typeDistance: {
        color: '#22d3ee',
        fontSize: 13,
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
        padding: 32,
        backgroundColor: '#18181b',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    emptyText: {
        color: '#71717a',
        fontSize: 16,
        marginTop: 12,
    },
    emptyHint: {
        color: '#52525b',
        fontSize: 14,
        marginTop: 4,
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#18181b',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    activityIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#22d3ee22',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    activityInfo: {
        flex: 1,
    },
    activityType: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    activityDate: {
        color: '#71717a',
        fontSize: 12,
        marginTop: 2,
    },
    activityStats: {
        alignItems: 'flex-end',
    },
    activityDistance: {
        color: '#22d3ee',
        fontSize: 14,
        fontWeight: 'bold',
    },
    activityDuration: {
        color: '#71717a',
        fontSize: 12,
        marginTop: 2,
    },
    territoryBadge: {
        marginLeft: 8,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#22d3ee22',
        alignItems: 'center',
        justifyContent: 'center',
    },
    showMoreButton: {
        marginTop: 8,
        padding: 12,
        backgroundColor: '#18181b',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#27272a',
    },
    showMoreText: {
        color: '#22d3ee',
        fontSize: 14,
        fontWeight: '600',
    },
    infoSection: {
        width: '100%',
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        color: '#fff',
        fontSize: 16,
    },
    signOutButton: {
        width: '100%',
        padding: 16,
        backgroundColor: '#ef444422',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ef444444',
        marginBottom: 40,
    },
    signOutText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
