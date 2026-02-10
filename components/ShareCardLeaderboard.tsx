import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
    SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT, BRAND_COLOR,
    DOWNLOAD_TEXT, DOWNLOAD_URL,
} from '../utils/shareCardUtils';

interface LeaderboardEntryData {
    userId: string;
    username: string;
    totalArea: number;
    territoryCount: number;
}

interface ShareCardLeaderboardProps {
    leaderboard: LeaderboardEntryData[];
    currentUserId?: string;
    periodLabel: string;
}

function formatArea(sqMeters: number): string {
    if (sqMeters < 10000) {
        return `${Math.round(sqMeters).toLocaleString()} m\u00B2`;
    }
    return `${(sqMeters / 10000).toFixed(2)} ha`;
}

const RANK_COLORS: Record<number, string> = {
    1: '#FFD700',
    2: '#C0C0C0',
    3: '#CD7F32',
};

const RANK_LABELS: Record<number, string> = {
    1: '\uD83D\uDC51',  // crown
    2: '\uD83E\uDD48',  // silver medal
    3: '\uD83E\uDD49',  // bronze medal
};

export default function ShareCardLeaderboard({
    leaderboard,
    currentUserId,
    periodLabel,
}: ShareCardLeaderboardProps) {
    const currentUserIndex = leaderboard.findIndex(e => e.userId === currentUserId);
    const currentUserRank = currentUserIndex >= 0 ? currentUserIndex + 1 : null;
    const isInTopFour = currentUserRank !== null && currentUserRank <= 4;

    // Always show top 4 (or fewer if leaderboard is smaller)
    const topCount = Math.min(4, leaderboard.length);
    const topEntries = leaderboard.slice(0, topCount);

    // Show current user row separately if they're outside top 4
    const showSeparateUserRow = currentUserRank !== null && !isInTopFour;
    const currentUserEntry = showSeparateUserRow ? leaderboard[currentUserIndex] : null;

    const renderRow = (entry: LeaderboardEntryData, rank: number, highlighted: boolean) => {
        const isTop3 = rank <= 3;
        const rankEmoji = RANK_LABELS[rank];
        const rankColor = RANK_COLORS[rank];

        return (
            <View
                key={entry.userId}
                style={[
                    cardStyles.row,
                    isTop3 && cardStyles.topThreeRow,
                    highlighted && cardStyles.highlightedRow,
                ]}
            >
                <View style={cardStyles.rankCell}>
                    {rankEmoji ? (
                        <Text style={cardStyles.rankEmoji}>{rankEmoji}</Text>
                    ) : (
                        <Text style={[cardStyles.rankText, rankColor ? { color: rankColor } : null]}>
                            {rank}
                        </Text>
                    )}
                </View>
                <View style={cardStyles.nameCell}>
                    <Text
                        style={[
                            cardStyles.nameText,
                            highlighted && cardStyles.highlightedName,
                        ]}
                        numberOfLines={1}
                    >
                        {entry.username}
                        {highlighted ? '  (You)' : ''}
                    </Text>
                    <Text style={cardStyles.territoryCountText}>
                        {entry.territoryCount} {entry.territoryCount === 1 ? 'territory' : 'territories'}
                    </Text>
                </View>
                <View style={cardStyles.areaCell}>
                    <Text style={[cardStyles.areaText, isTop3 && cardStyles.topThreeAreaText]}>
                        {formatArea(entry.totalArea)}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View style={cardStyles.card}>
            <LinearGradient
                colors={['#0A0A0A', '#141008', '#1A1100', '#1E1400']}
                locations={[0, 0.4, 0.7, 1]}
                style={cardStyles.gradient}
            >
                {/* Header: Logo + Branding */}
                <View style={cardStyles.header}>
                    <Image
                        source={require('../assets/conqr-logo.png')}
                        style={cardStyles.logo}
                        resizeMode="contain"
                    />
                    <Text style={cardStyles.brandName}>CONQR</Text>
                </View>

                {/* Title */}
                <View style={cardStyles.titleRow}>
                    <Text style={cardStyles.trophyEmoji}>{'\uD83C\uDFC6'}</Text>
                    <Text style={cardStyles.title}>LEADERBOARD</Text>
                </View>

                {/* Period pill */}
                <View style={cardStyles.periodRow}>
                    <View style={cardStyles.periodPill}>
                        <Text style={cardStyles.periodText}>{periodLabel}</Text>
                    </View>
                </View>

                {/* Top entries */}
                <View style={cardStyles.listContainer}>
                    {topEntries.map((entry, index) => {
                        const rank = index + 1;
                        const highlighted = entry.userId === currentUserId;
                        return renderRow(entry, rank, highlighted);
                    })}

                    {/* Separator + user row if outside top 4 */}
                    {showSeparateUserRow && currentUserEntry && currentUserRank && (
                        <>
                            <View style={cardStyles.separator}>
                                <View style={cardStyles.separatorDot} />
                                <View style={cardStyles.separatorDot} />
                                <View style={cardStyles.separatorDot} />
                            </View>
                            {renderRow(currentUserEntry, currentUserRank, true)}
                        </>
                    )}
                </View>

                {/* Spacer */}
                <View style={cardStyles.spacer} />

                {/* Footer: Download CTA */}
                <View style={cardStyles.footer}>
                    <View style={cardStyles.footerDivider} />
                    <Text style={cardStyles.downloadText}>{DOWNLOAD_TEXT}</Text>
                    <Text style={cardStyles.downloadUrl}>{DOWNLOAD_URL}</Text>
                </View>
            </LinearGradient>
        </View>
    );
}

const cardStyles = StyleSheet.create({
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
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    trophyEmoji: {
        fontSize: 44,
    },
    title: {
        fontSize: 42,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 3,
    },
    periodRow: {
        flexDirection: 'row',
        marginBottom: 50,
    },
    periodPill: {
        backgroundColor: BRAND_COLOR,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
    },
    periodText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
        letterSpacing: 1.5,
    },
    listContainer: {
        gap: 10,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 22,
        paddingHorizontal: 20,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
    },
    topThreeRow: {
        backgroundColor: 'rgba(230, 81, 0, 0.08)',
    },
    highlightedRow: {
        backgroundColor: 'rgba(230, 81, 0, 0.2)',
        borderWidth: 2,
        borderColor: BRAND_COLOR,
    },
    rankCell: {
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    rankEmoji: {
        fontSize: 32,
    },
    rankText: {
        fontSize: 28,
        fontWeight: '800',
        color: '#888888',
    },
    nameCell: {
        flex: 1,
        marginRight: 12,
    },
    nameText: {
        fontSize: 26,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    highlightedName: {
        color: BRAND_COLOR,
    },
    territoryCountText: {
        fontSize: 18,
        color: '#888888',
        marginTop: 4,
    },
    areaCell: {
        alignItems: 'flex-end',
    },
    areaText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#CCCCCC',
    },
    topThreeAreaText: {
        color: BRAND_COLOR,
    },
    separator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 12,
    },
    separatorDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
