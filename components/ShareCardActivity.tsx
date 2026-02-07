import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polyline as SvgPolyline, Circle } from 'react-native-svg';
import { Activity, Territory } from '../lib/types';
import {
    SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, BRAND_COLOR,
    ROUTE_COLOR, ROUTE_GLOW_COLOR, START_COLOR, END_COLOR,
    DOWNLOAD_TEXT, DOWNLOAD_URL,
    formatDistance, formatDuration, formatPace, formatArea, formatDate,
    gpsPointsToSvgPath, flattenPolylines,
} from '../utils/shareCardUtils';

interface ShareCardActivityProps {
    activity: Activity;
    territory?: Territory;
}

const SVG_ROUTE_WIDTH = SHARE_CARD_WIDTH - 120; // 60px padding each side
const SVG_ROUTE_HEIGHT = 680;

export default function ShareCardActivity({ activity, territory }: ShareCardActivityProps) {
    const flatPath = useMemo(
        () => flattenPolylines(activity.polylines || []),
        [activity.polylines]
    );

    const svgData = useMemo(
        () => gpsPointsToSvgPath(flatPath, SVG_ROUTE_WIDTH, SVG_ROUTE_HEIGHT),
        [flatPath]
    );

    const pace = formatPace(activity.averageSpeed || 0);
    const distance = formatDistance(activity.distance);
    const duration = formatDuration(activity.duration);
    const date = formatDate(activity.startTime);

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

                {/* Activity type + date */}
                <View style={styles.typeRow}>
                    <View style={styles.typePill}>
                        <Text style={styles.typePillText}>{activity.type}</Text>
                    </View>
                    <Text style={styles.dateText}>{date}</Text>
                </View>

                {/* Route SVG visualization */}
                <View style={styles.routeContainer}>
                    {flatPath.length > 1 ? (
                        <Svg
                            width={SVG_ROUTE_WIDTH}
                            height={SVG_ROUTE_HEIGHT}
                            viewBox={`0 0 ${SVG_ROUTE_WIDTH} ${SVG_ROUTE_HEIGHT}`}
                        >
                            {/* Glow layer */}
                            <SvgPolyline
                                points={svgData.points}
                                fill="none"
                                stroke={ROUTE_GLOW_COLOR}
                                strokeWidth={12}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Main route line */}
                            <SvgPolyline
                                points={svgData.points}
                                fill="none"
                                stroke={ROUTE_COLOR}
                                strokeWidth={4}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            {/* Start marker */}
                            <Circle
                                cx={svgData.startPoint.x}
                                cy={svgData.startPoint.y}
                                r={10}
                                fill={START_COLOR}
                            />
                            {/* End marker */}
                            <Circle
                                cx={svgData.endPoint.x}
                                cy={svgData.endPoint.y}
                                r={10}
                                fill={END_COLOR}
                            />
                        </Svg>
                    ) : (
                        <View style={styles.noRouteContainer}>
                            <Text style={styles.noRouteText}>No route data</Text>
                        </View>
                    )}
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{distance}</Text>
                        <Text style={styles.statLabel}>DISTANCE</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{duration}</Text>
                        <Text style={styles.statLabel}>DURATION</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{pace}</Text>
                        <Text style={styles.statLabel}>PACE /KM</Text>
                    </View>
                </View>

                {/* Territory section (conditional) */}
                {territory && (
                    <View style={styles.territorySection}>
                        <View style={styles.territoryBadge}>
                            <Text style={styles.territoryBadgeText}>TERRITORY CLAIMED</Text>
                        </View>
                        <Text style={styles.territoryName}>{territory.name || 'Unnamed Territory'}</Text>
                        <Text style={styles.territoryArea}>{formatArea(territory.area)}</Text>
                    </View>
                )}

                {/* Spacer */}
                <View style={styles.spacer} />

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
        marginBottom: 40,
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
    typeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 30,
    },
    typePill: {
        backgroundColor: BRAND_COLOR,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
    },
    typePillText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 2,
    },
    dateText: {
        color: '#888888',
        fontSize: 18,
    },
    routeContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: SVG_ROUTE_HEIGHT,
        marginBottom: 40,
    },
    noRouteContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noRouteText: {
        color: '#555555',
        fontSize: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        color: '#FFFFFF',
        fontSize: 48,
        fontWeight: '700',
    },
    statLabel: {
        color: '#888888',
        fontSize: 14,
        fontWeight: '600',
        letterSpacing: 1.5,
        marginTop: 6,
    },
    statDivider: {
        width: 1,
        height: 60,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
    },
    territorySection: {
        alignItems: 'center',
        paddingVertical: 24,
        backgroundColor: 'rgba(230, 81, 0, 0.1)',
        borderRadius: 16,
        marginBottom: 20,
    },
    territoryBadge: {
        backgroundColor: BRAND_COLOR,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 12,
    },
    territoryBadgeText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    territoryName: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '600',
        marginBottom: 4,
    },
    territoryArea: {
        color: BRAND_COLOR,
        fontSize: 20,
        fontWeight: '700',
    },
    spacer: {
        flex: 1,
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
