import * as React from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, Easing, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatusBar } from 'expo-status-bar';
import { useScreenTracking } from '../lib/useScreenTracking';

const { width, height } = Dimensions.get('window');

export default function LandingScreen() {
    useScreenTracking('Landing');
    const logoFade = React.useRef(new Animated.Value(0)).current;
    const logoScale = React.useRef(new Animated.Value(0.85)).current;
    const taglineFade = React.useRef(new Animated.Value(0)).current;
    const taglineSlide = React.useRef(new Animated.Value(10)).current;
    const bottomFade = React.useRef(new Animated.Value(0)).current;
    const bottomSlide = React.useRef(new Animated.Value(30)).current;

    React.useEffect(() => {
        // Staggered entrance: logo → tagline → button
        Animated.sequence([
            Animated.parallel([
                Animated.timing(logoFade, {
                    toValue: 1,
                    duration: 700,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
                Animated.timing(logoScale, {
                    toValue: 1,
                    duration: 700,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
            ]),
            Animated.parallel([
                Animated.timing(taglineFade, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
                Animated.timing(taglineSlide, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
            ]),
            Animated.parallel([
                Animated.timing(bottomFade, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
                Animated.timing(bottomSlide, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
            ]),
        ]).start();
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    <View style={styles.centerSection}>
                        <Animated.View
                            style={[
                                styles.logoContainer,
                                {
                                    opacity: logoFade,
                                    transform: [{ scale: logoScale }],
                                },
                            ]}
                        >
                            <Image
                                source={require('../assets/conqr-logo.png')}
                                style={styles.logoImage}
                                resizeMode="contain"
                            />
                        </Animated.View>
                        <Animated.Text
                            style={[
                                styles.tagline,
                                {
                                    opacity: taglineFade,
                                    transform: [{ translateY: taglineSlide }],
                                },
                            ]}
                        >
                            Claim your territory
                        </Animated.Text>
                    </View>

                    <Animated.View
                        style={[
                            styles.bottomSection,
                            {
                                opacity: bottomFade,
                                transform: [{ translateY: bottomSlide }],
                            },
                        ]}
                    >
                        <GoogleSignInButton />
                        <Text style={styles.footerText}>
                            By continuing, you agree to our Terms of Service
                        </Text>
                    </Animated.View>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1A1A',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
    },
    centerSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoContainer: {
        alignItems: 'center',
    },
    logoImage: {
        width: 220,
        height: 220,
    },
    tagline: {
        fontSize: 18,
        color: '#AAAAAA',
        fontWeight: '500',
        letterSpacing: 0.5,
        marginTop: 4,
    },
    bottomSection: {
        paddingBottom: 32,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#666666',
        textAlign: 'center',
        marginTop: 16,
    },
});
