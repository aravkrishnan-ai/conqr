import * as React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Globe, Activity, Trophy } from 'lucide-react-native';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

export default function LandingScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" />

            {/* Background Effects (Simulated) */}
            <View style={styles.glow} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.heroSection}>
                    <View style={styles.logoContainer}>
                        <MapPin size={40} color="#22d3ee" />
                    </View>

                    <Text style={styles.title}>CONQR</Text>
                    <Text style={styles.tagline}>
                        The world is your canvas. <Text style={styles.highlight}>Run, Ride, Walk</Text> to claim territory and dominate the map.
                    </Text>
                </View>

                <View style={styles.authSection}>
                    <GoogleSignInButton />
                    <Text style={styles.joinText}>JOIN THE RESISTANCE</Text>
                </View>

                <View style={styles.featuresGrid}>
                    <FeatureCard
                        icon={<Globe size={24} color="#818cf8" />}
                        title="Global Grid"
                        desc="Every meter matters. The whole world is partitioned."
                    />
                    <FeatureCard
                        icon={<Activity size={24} color="#10b981" />}
                        title="Real-time Tracking"
                        desc="GPS tracing validates your movement instantly."
                    />
                    <FeatureCard
                        icon={<Trophy size={24} color="#f59e0b" />}
                        title="Leaderboards"
                        desc="Compete for largest territory area."
                    />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function FeatureCard({ icon, title, desc }: { icon: any, title: string, desc: string }) {
    return (
        <View style={styles.featureCard}>
            <View style={styles.featureIcon}>{icon}</View>
            <Text style={styles.featureTitle}>{title}</Text>
            <Text style={styles.featureDesc}>{desc}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollContent: {
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100%',
    },
    glow: {
        position: 'absolute',
        top: -100,
        left: width / 4,
        width: width,
        height: 400,
        backgroundColor: 'rgba(34, 211, 238, 0.15)',
        borderRadius: 200,
        transform: [{ scaleX: 2 }],
        zIndex: -1,
    },
    heroSection: {
        alignItems: 'center',
        marginBottom: 48,
    },
    logoContainer: {
        width: 80,
        height: 80,
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.3)',
        marginBottom: 24,
    },
    title: {
        fontSize: 64,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -2,
    },
    tagline: {
        fontSize: 18,
        color: '#a1a1aa',
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 26,
    },
    highlight: {
        color: '#22d3ee',
        fontWeight: '600',
    },
    authSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 64,
    },
    joinText: {
        color: '#71717a',
        fontSize: 12,
        letterSpacing: 2,
        marginTop: 16,
        fontWeight: '600',
    },
    featuresGrid: {
        width: '100%',
        gap: 16,
    },
    featureCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        alignItems: 'center',
    },
    featureIcon: {
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
    },
    featureTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    featureDesc: {
        color: '#a1a1aa',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
});
