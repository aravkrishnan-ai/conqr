import * as React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Route, Zap, Trophy } from 'lucide-react-native';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

// Strava-inspired color palette
const STRAVA_ORANGE = '#FC4C02';
const STRAVA_BG = '#121212';

export default function LandingScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />

            {/* Background glow */}
            <View style={styles.glow} />

            <View style={styles.content}>
                <View style={styles.heroSection}>
                    <View style={styles.logoContainer}>
                        <MapPin size={44} color={STRAVA_ORANGE} strokeWidth={2.5} />
                    </View>

                    <Text style={styles.title}>CONQR</Text>
                    <Text style={styles.tagline}>
                        Walk, run, or ride to claim territory and dominate the map.
                    </Text>
                </View>

                <View style={styles.authSection}>
                    <GoogleSignInButton />
                </View>

                <View style={styles.featureRow}>
                    <View style={styles.featureChip}>
                        <Route size={16} color={STRAVA_ORANGE} />
                        <Text style={styles.featureText}>Track Routes</Text>
                    </View>
                    <View style={styles.featureChip}>
                        <Zap size={16} color={STRAVA_ORANGE} />
                        <Text style={styles.featureText}>Claim Territory</Text>
                    </View>
                    <View style={styles.featureChip}>
                        <Trophy size={16} color={STRAVA_ORANGE} />
                        <Text style={styles.featureText}>Compete</Text>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: STRAVA_BG,
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    glow: {
        position: 'absolute',
        top: -150,
        left: width / 4,
        width: width,
        height: 450,
        backgroundColor: 'rgba(252, 76, 2, 0.08)',
        borderRadius: 225,
        transform: [{ scaleX: 2 }],
        zIndex: -1,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 56,
    },
    logoContainer: {
        width: 88,
        height: 88,
        backgroundColor: 'rgba(252, 76, 2, 0.12)',
        borderRadius: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
    },
    title: {
        fontSize: 56,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: -1,
    },
    tagline: {
        fontSize: 17,
        color: '#8E8E8E',
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 24,
        maxWidth: 300,
    },
    authSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 56,
    },
    featureRow: {
        flexDirection: 'row',
        gap: 10,
    },
    featureChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: 20,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    featureText: {
        color: '#8E8E8E',
        fontSize: 13,
        fontWeight: '600',
    },
});
