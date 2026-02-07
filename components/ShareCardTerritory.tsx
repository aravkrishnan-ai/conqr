import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polygon as SvgPolygon } from 'react-native-svg';
import { Territory } from '../lib/types';
import {
    SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, BRAND_COLOR, BRAND_COLOR_LIGHT,
    DOWNLOAD_TEXT, DOWNLOAD_URL,
    formatArea, formatDistance, formatDate,
    territoryPolygonToSvg,
} from '../utils/shareCardUtils';

interface ShareCardTerritoryProps {
    territory: Territory;
}

const SVG_WIDTH = SHARE_CARD_WIDTH - 120;
const SVG_HEIGHT = 700;

export default function ShareCardTerritory({ territory }: ShareCardTerritoryProps) {
    const svgData = useMemo(
        () => territoryPolygonToSvg(territory.polygon || [], SVG_WIDTH, SVG_HEIGHT),
        [territory.polygon]
    );

    const area = formatArea(territory.area);
    const perimeter = formatDistance(territory.perimeter);
    const date = formatDate(territory.claimedAt);

    return (
        <View style={styles.card}>
            <LinearGradient
                colors={['#0A0A0A', '#0F0D08', '#1A1100', '#1E1400']}
                locations={[0, 0.3, 0.6, 1]}
                style={styles.gradient}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Image
                        source={require('../assets/conqr-logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.brandName}>CONQR</Text>
                </View>

                {/* Title */}
                <View style={styles.titleRow}>
                    <View style={styles.titlePill}>
                        <Text style={styles.titlePillText}>TERRITORY CONQUERED</Text>
                    </View>
                </View>

                {/* Territory name */}
                <Text style={styles.territoryName}>{territory.name || 'Unnamed Territory'}</Text>
                <Text style={styles.claimedDate}>{date}</Text>

                {/* Territory polygon SVG */}
                <View style={styles.polygonContainer}>
                    {territory.polygon && territory.polygon.length > 2 ? (
                        <Svg
                            width={SVG_WIDTH}
                            height={SVG_HEIGHT}
                            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                        >
                            <SvgPolygon
                                points={svgData.points}
                                fill={BRAND_COLOR_LIGHT}
                                stroke={BRAND_COLOR}
                                strokeWidth={4}
                                strokeLinejoin="round"
                            />
                        </Svg>
                    ) : (
                        <View style={styles.noDataContainer}>
                            <Text style={styles.noDataText}>Territory shape unavailable</Text>
                        </View>
                    )}
                </View>

                {/* Stats row */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{area}</Text>
                        <Text style={styles.statLabel}>AREA</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{perimeter}</Text>
                        <Text style={styles.statLabel}>PERIMETER</Text>
                    </View>
                </View>

                {/* Spacer */}
                <View style={styles.spacer} />

                {/* Footer */}
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
    titleRow: {
        marginBottom: 16,
    },
    titlePill: {
        alignSelf: 'flex-start',
        backgroundColor: BRAND_COLOR,
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
    },
    titlePillText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 2,
    },
    territoryName: {
        color: '#FFFFFF',
        fontSize: 32,
        fontWeight: '700',
        marginBottom: 8,
    },
    claimedDate: {
        color: '#888888',
        fontSize: 18,
        marginBottom: 30,
    },
    polygonContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: SVG_HEIGHT,
        marginBottom: 40,
    },
    noDataContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noDataText: {
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
        fontSize: 44,
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
