import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polyline as SvgPolyline, Circle, Polygon as SvgPolygon } from 'react-native-svg';
import { Post } from '../lib/types';
import {
    SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, BRAND_COLOR, BRAND_COLOR_LIGHT,
    DOWNLOAD_TEXT, DOWNLOAD_URL,
    formatDistance, formatDuration, formatPace, formatArea, formatDate,
    gpsPointsToSvgPath, flattenPolylines, territoryPolygonToSvg,
} from '../utils/shareCardUtils';

interface ShareCardPostProps {
    post: Post;
}

const SVG_WIDTH = SHARE_CARD_WIDTH - 120;
const SVG_HEIGHT_ACTIVITY = 520;
const SVG_HEIGHT_TERRITORY = 480;

export default function ShareCardPost({ post }: ShareCardPostProps) {
    const hasActivity = post.postType === 'activity_share' && post.activity;
    const hasTerritory = post.postType === 'territory_share' && post.territory;

    const flatPath = useMemo(
        () => hasActivity ? flattenPolylines(post.activity!.polylines || []) : [],
        [hasActivity, post.activity]
    );

    const activitySvgData = useMemo(
        () => flatPath.length > 1 ? gpsPointsToSvgPath(flatPath, SVG_WIDTH, SVG_HEIGHT_ACTIVITY) : null,
        [flatPath]
    );

    const territorySvgData = useMemo(
        () => hasTerritory ? territoryPolygonToSvg(post.territory!.polygon || [], SVG_WIDTH, SVG_HEIGHT_TERRITORY) : null,
        [hasTerritory, post.territory]
    );

    const getActivityTypeLabel = (type: string): string => {
        switch (type?.toUpperCase()) {
            case 'RUN': return 'RUN';
            case 'RIDE': return 'RIDE';
            case 'WALK': return 'WALK';
            default: return 'ACTIVITY';
        }
    };

    return (
        <View style={styles.card}>
            <LinearGradient
                colors={['#0A0A0A', '#141008', '#1A1100', '#1E1400']}
                locations={[0, 0.4, 0.7, 1]}
                style={styles.gradient}
            >
                {/* Header: Logo + Branding */}
                <View style={styles.header}>
                    <Image
                        source={require('../assets/conqr-logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.brandName}>CONQR</Text>
                </View>

                {/* Post author info */}
                <View style={styles.authorRow}>
                    <View style={styles.authorAvatar}>
                        {post.userAvatarUrl ? (
                            <Image source={{ uri: post.userAvatarUrl }} style={styles.authorAvatarImage} />
                        ) : (
                            <Text style={styles.authorAvatarFallback}>
                                {(post.username || '?')[0].toUpperCase()}
                            </Text>
                        )}
                    </View>
                    <View>
                        <Text style={styles.authorName}>{post.username}</Text>
                        <Text style={styles.postDate}>{formatDate(post.createdAt)}</Text>
                    </View>
                </View>

                {/* Post content text */}
                {post.content ? (
                    <View style={styles.contentContainer}>
                        <Text style={styles.contentText} numberOfLines={6}>
                            {post.content}
                        </Text>
                    </View>
                ) : null}

                {/* Activity visualization */}
                {hasActivity && post.activity && (
                    <>
                        <View style={styles.typePillRow}>
                            <View style={styles.typePill}>
                                <Text style={styles.typePillText}>
                                    {getActivityTypeLabel(post.activity.type)}
                                </Text>
                            </View>
                        </View>

                        {activitySvgData && (
                            <View style={styles.vizContainer}>
                                <Svg
                                    width={SVG_WIDTH}
                                    height={SVG_HEIGHT_ACTIVITY}
                                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT_ACTIVITY}`}
                                >
                                    {/* Glow */}
                                    <SvgPolyline
                                        points={activitySvgData.points}
                                        fill="none"
                                        stroke="rgba(230, 81, 0, 0.4)"
                                        strokeWidth={12}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {/* Main route */}
                                    <SvgPolyline
                                        points={activitySvgData.points}
                                        fill="none"
                                        stroke="#FFFFFF"
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {/* Start marker */}
                                    <Circle
                                        cx={activitySvgData.startPoint.x}
                                        cy={activitySvgData.startPoint.y}
                                        r={10}
                                        fill="#00D26A"
                                    />
                                    {/* End marker */}
                                    <Circle
                                        cx={activitySvgData.endPoint.x}
                                        cy={activitySvgData.endPoint.y}
                                        r={10}
                                        fill="#E65100"
                                    />
                                </Svg>
                            </View>
                        )}

                        {/* Activity stats */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatDistance(post.activity.distance)}</Text>
                                <Text style={styles.statLabel}>DISTANCE</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatDuration(post.activity.duration)}</Text>
                                <Text style={styles.statLabel}>DURATION</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatPace(post.activity.averageSpeed || 0)}</Text>
                                <Text style={styles.statLabel}>PACE /KM</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Territory visualization */}
                {hasTerritory && post.territory && (
                    <>
                        <View style={styles.typePillRow}>
                            <View style={[styles.typePill, styles.territoryPill]}>
                                <Text style={styles.typePillText}>TERRITORY CONQUERED</Text>
                            </View>
                        </View>

                        <Text style={styles.territoryName}>
                            {post.territory.name || 'Unnamed Territory'}
                        </Text>

                        {territorySvgData && (
                            <View style={styles.vizContainer}>
                                <Svg
                                    width={SVG_WIDTH}
                                    height={SVG_HEIGHT_TERRITORY}
                                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT_TERRITORY}`}
                                >
                                    <SvgPolygon
                                        points={territorySvgData.points}
                                        fill={BRAND_COLOR_LIGHT}
                                        stroke={BRAND_COLOR}
                                        strokeWidth={4}
                                        strokeLinejoin="round"
                                    />
                                </Svg>
                            </View>
                        )}

                        {/* Territory stats */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatArea(post.territory.area)}</Text>
                                <Text style={styles.statLabel}>AREA</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatDistance(post.territory.perimeter)}</Text>
                                <Text style={styles.statLabel}>PERIMETER</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Text-only post: larger content display */}
                {post.postType === 'text' && !hasActivity && !hasTerritory && (
                    <View style={styles.textOnlySection}>
                        <View style={styles.quoteBar} />
                    </View>
                )}

                {/* Spacer */}
                <View style={styles.spacer} />

                {/* Engagement stats */}
                <View style={styles.engagementRow}>
                    {post.likeCount > 0 && (
                        <Text style={styles.engagementText}>
                            {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}
                        </Text>
                    )}
                    {post.commentCount > 0 && (
                        <Text style={styles.engagementText}>
                            {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
                        </Text>
                    )}
                </View>

                {/* Footer: Download CTA */}
                <View style={styles.footer}>
                    <View style={styles.footerDivider} />
                    <Text style={styles.downloadText}>{DOWNLOAD_TEXT}</Text>
                    <Text style={styles.downloadUrl}>{DOWNLOAD_URL}</Text>
                </View>
            </LinearGradient>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
    },
    gradient: {
        flex: 1,
        paddingHorizontal: 60,
        paddingTop: 80,
        paddingBottom: 60,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 50,
    },
    logo: {
        width: 48,
        height: 48,
        borderRadius: 12,
    },
    brandName: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 4,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        marginBottom: 30,
    },
    authorAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: 'rgba(230, 81, 0, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    authorAvatarImage: {
        width: 64,
        height: 64,
        borderRadius: 32,
    },
    authorAvatarFallback: {
        fontSize: 28,
        fontWeight: '700',
        color: BRAND_COLOR,
    },
    authorName: {
        fontSize: 28,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    postDate: {
        fontSize: 18,
        color: '#888888',
        marginTop: 4,
    },
    contentContainer: {
        marginBottom: 30,
        paddingLeft: 16,
        borderLeftWidth: 4,
        borderLeftColor: BRAND_COLOR,
    },
    contentText: {
        fontSize: 26,
        color: '#EEEEEE',
        lineHeight: 38,
    },
    typePillRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    typePill: {
        backgroundColor: BRAND_COLOR,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
    },
    territoryPill: {
        backgroundColor: '#2E7D32',
    },
    typePillText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 2,
    },
    territoryName: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 16,
    },
    vizContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 40,
        fontWeight: '700',
    },
    statLabel: {
        color: '#888888',
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1.5,
        marginTop: 6,
    },
    statDivider: {
        width: 1,
        height: 50,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    textOnlySection: {
        flex: 1,
        justifyContent: 'center',
    },
    quoteBar: {
        width: 6,
        height: 60,
        backgroundColor: BRAND_COLOR,
        borderRadius: 3,
        alignSelf: 'center',
    },
    spacer: {
        flex: 1,
    },
    engagementRow: {
        flexDirection: 'row',
        gap: 24,
        marginBottom: 30,
    },
    engagementText: {
        fontSize: 18,
        color: '#888888',
        fontWeight: '500',
    },
    footer: {
        alignItems: 'center',
    },
    footerDivider: {
        width: 80,
        height: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: 24,
    },
    downloadText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 8,
    },
    downloadUrl: {
        color: BRAND_COLOR,
        fontSize: 18,
        fontWeight: '500',
    },
});
