import * as React from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

// Color palette
const COLORS = {
    primary: '#FC4C02',
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#999999',
    textMuted: '#666666',
};

export default function LandingScreen() {
    // Animated values for entrance animations
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(30)).current;
    const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic),
            }),
        ]).start();
    }, [fadeAnim, slideAnim, scaleAnim]);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Background gradient */}
            <LinearGradient
                colors={['#0a0a0a', '#000000', '#0a0a0a']}
                style={styles.backgroundGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* Accent glow */}
            <View style={styles.glowContainer}>
                <LinearGradient
                    colors={['rgba(252, 76, 2, 0.15)', 'rgba(252, 76, 2, 0.05)', 'transparent']}
                    style={styles.glow}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                />
            </View>

            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    {/* Top spacer */}
                    <View style={styles.topSpacer} />

                    {/* Hero Section */}
                    <Animated.View
                        style={[
                            styles.heroSection,
                            {
                                opacity: fadeAnim,
                                transform: [
                                    { translateY: slideAnim },
                                    { scale: scaleAnim },
                                ],
                            },
                        ]}
                    >
                        {/* Logo Mark */}
                        <View style={styles.logoMark}>
                            <View style={styles.logoInner}>
                                <Text style={styles.logoLetter}>C</Text>
                            </View>
                        </View>

                        {/* Brand Name */}
                        <Text style={styles.brandName}>CONQR</Text>

                        {/* Tagline */}
                        <Text style={styles.tagline}>
                            Claim your territory
                        </Text>
                    </Animated.View>

                    {/* Value Props */}
                    <Animated.View
                        style={[
                            styles.valueProps,
                            {
                                opacity: fadeAnim,
                                transform: [{ translateY: slideAnim }],
                            },
                        ]}
                    >
                        <View style={styles.valueProp}>
                            <View style={styles.valueDot} />
                            <Text style={styles.valueText}>Track your runs, walks & rides</Text>
                        </View>
                        <View style={styles.valueProp}>
                            <View style={styles.valueDot} />
                            <Text style={styles.valueText}>Draw paths to claim territory</Text>
                        </View>
                        <View style={styles.valueProp}>
                            <View style={styles.valueDot} />
                            <Text style={styles.valueText}>Compete to dominate your city</Text>
                        </View>
                    </Animated.View>

                    {/* Bottom Section */}
                    <View style={styles.bottomSection}>
                        {/* CTA */}
                        <Animated.View
                            style={[
                                styles.ctaSection,
                                {
                                    opacity: fadeAnim,
                                    transform: [{ translateY: slideAnim }],
                                },
                            ]}
                        >
                            <GoogleSignInButton />
                        </Animated.View>

                        {/* Footer */}
                        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
                            <Text style={styles.footerText}>
                                By continuing, you agree to our Terms of Service
                            </Text>
                        </Animated.View>
                    </View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    backgroundGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    glowContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: height * 0.5,
        overflow: 'hidden',
    },
    glow: {
        width: width * 1.5,
        height: height * 0.5,
        borderRadius: width,
        alignSelf: 'center',
        marginTop: -height * 0.15,
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
    },
    topSpacer: {
        flex: 0.15,
    },
    heroSection: {
        alignItems: 'center',
    },
    logoMark: {
        width: 80,
        height: 80,
        borderRadius: 20,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 12,
    },
    logoInner: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoLetter: {
        fontSize: 42,
        fontWeight: '700',
        color: COLORS.text,
        marginTop: -2,
    },
    brandName: {
        fontSize: 48,
        fontWeight: '800',
        color: COLORS.text,
        letterSpacing: 8,
        marginBottom: 12,
    },
    tagline: {
        fontSize: 18,
        color: COLORS.textSecondary,
        fontWeight: '500',
        letterSpacing: 0.5,
    },
    valueProps: {
        marginTop: 48,
        alignSelf: 'center',
        gap: 16,
    },
    valueProp: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    valueDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.primary,
    },
    valueText: {
        fontSize: 16,
        color: COLORS.textMuted,
        fontWeight: '500',
    },
    bottomSection: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingBottom: 16,
    },
    ctaSection: {
        width: '100%',
        alignItems: 'center',
        marginBottom: 24,
    },
    footer: {
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: COLORS.textMuted,
        textAlign: 'center',
    },
});
