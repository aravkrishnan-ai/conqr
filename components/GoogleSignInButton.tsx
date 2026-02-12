import * as React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AuthService } from '../services/AuthService';

// Google "G" logo as SVG
const GoogleLogo = () => (
    <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <Path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <Path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <Path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
    </Svg>
);

export const GoogleSignInButton = () => {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        // Subtle breathing pulse to draw attention
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.02,
                    duration: 1500,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.ease),
                }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    const handlePress = async () => {
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            await AuthService.signInWithGoogle();
        } catch (err: any) {
            console.error('Sign in error:', err);
            setError(err?.message || 'Sign in failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.wrapper}>
            <Animated.View style={{ transform: [{ scale: loading ? 1 : pulseAnim }], width: '100%' }}>
                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handlePress}
                    disabled={loading}
                    activeOpacity={0.9}
                >
                    <View style={styles.content}>
                        {loading ? (
                            <ActivityIndicator size="small" color="#000" style={styles.loader} />
                        ) : (
                            <View style={styles.logoContainer}>
                                <GoogleLogo />
                            </View>
                        )}
                        <Text style={styles.text}>
                            {loading ? 'Signing in...' : 'Continue with Google'}
                        </Text>
                    </View>
                </TouchableOpacity>
            </Animated.View>
            {error && (
                <Text style={styles.errorText}>{error}</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        alignItems: 'center',
    },
    button: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 24,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        marginRight: 12,
    },
    loader: {
        marginRight: 12,
    },
    text: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    errorText: {
        color: '#FF4444',
        fontSize: 14,
        marginTop: 16,
        textAlign: 'center',
    },
});
