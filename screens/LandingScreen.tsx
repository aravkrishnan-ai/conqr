import * as React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Animated,
    Easing,
    Image,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { StatusBar } from 'expo-status-bar';
import { useScreenTracking } from '../lib/useScreenTracking';
import { signInWithEmail, signUpWithEmail } from '../services/AuthService';

const { width, height } = Dimensions.get('window');

export default function LandingScreen() {
    useScreenTracking('Landing');

    const [isEmailMode, setIsEmailMode] = React.useState(false);
    const [isSignUp, setIsSignUp] = React.useState(false);
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const logoFade = React.useRef(new Animated.Value(0)).current;
    const logoScale = React.useRef(new Animated.Value(0.85)).current;
    const taglineFade = React.useRef(new Animated.Value(0)).current;
    const taglineSlide = React.useRef(new Animated.Value(10)).current;
    const bottomFade = React.useRef(new Animated.Value(0)).current;
    const bottomSlide = React.useRef(new Animated.Value(30)).current;

    React.useEffect(() => {
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

    const handleEmailAuth = async () => {
        if (loading) return;
        setError(null);

        if (!email.trim()) {
            setError('Please enter your email');
            return;
        }
        if (!password || password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        if (isSignUp && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            if (isSignUp) {
                await signUpWithEmail(email, password);
            } else {
                await signInWithEmail(email, password);
            }
        } catch (err: any) {
            setError(err?.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
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
                                {!isEmailMode ? (
                                    <>
                                        <GoogleSignInButton />
                                        <View style={styles.dividerRow}>
                                            <View style={styles.dividerLine} />
                                            <Text style={styles.dividerText}>or</Text>
                                            <View style={styles.dividerLine} />
                                        </View>
                                        <TouchableOpacity
                                            style={styles.emailButton}
                                            onPress={() => setIsEmailMode(true)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={styles.emailButtonText}>
                                                Continue with Email
                                            </Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.emailTitle}>
                                            {isSignUp ? 'Create Account' : 'Sign In'}
                                        </Text>

                                        <TextInput
                                            style={styles.input}
                                            placeholder="Email"
                                            placeholderTextColor="#666"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            keyboardType="email-address"
                                            textContentType="emailAddress"
                                        />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Password"
                                            placeholderTextColor="#666"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry
                                            textContentType={isSignUp ? 'newPassword' : 'password'}
                                        />
                                        {isSignUp && (
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Confirm Password"
                                                placeholderTextColor="#666"
                                                value={confirmPassword}
                                                onChangeText={setConfirmPassword}
                                                secureTextEntry
                                                textContentType="newPassword"
                                            />
                                        )}

                                        {error && (
                                            <Text style={styles.errorText}>{error}</Text>
                                        )}

                                        <TouchableOpacity
                                            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                                            onPress={handleEmailAuth}
                                            disabled={loading}
                                            activeOpacity={0.8}
                                        >
                                            {loading ? (
                                                <ActivityIndicator color="#FFF" size="small" />
                                            ) : (
                                                <Text style={styles.submitButtonText}>
                                                    {isSignUp ? 'Sign Up' : 'Sign In'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsSignUp(!isSignUp);
                                                setError(null);
                                            }}
                                        >
                                            <Text style={styles.switchText}>
                                                {isSignUp
                                                    ? 'Already have an account? Sign In'
                                                    : "Don't have an account? Sign Up"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => {
                                                setIsEmailMode(false);
                                                setError(null);
                                            }}
                                        >
                                            <Text style={styles.backText}>
                                                Back to all sign in options
                                            </Text>
                                        </TouchableOpacity>
                                    </>
                                )}

                                <Text style={styles.footerText}>
                                    By continuing, you agree to our Terms of Service
                                </Text>
                            </Animated.View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
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
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
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
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginVertical: 20,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#333',
    },
    dividerText: {
        color: '#666',
        fontSize: 14,
        marginHorizontal: 16,
    },
    emailButton: {
        backgroundColor: 'transparent',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#444',
        paddingVertical: 16,
        paddingHorizontal: 24,
        width: '100%',
        alignItems: 'center',
    },
    emailButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    emailTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 20,
    },
    input: {
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        padding: 16,
        color: '#FFFFFF',
        fontSize: 16,
        width: '100%',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#333',
    },
    errorText: {
        color: '#FF4444',
        fontSize: 14,
        marginBottom: 12,
        textAlign: 'center',
    },
    submitButton: {
        backgroundColor: '#E65100',
        borderRadius: 12,
        paddingVertical: 16,
        width: '100%',
        alignItems: 'center',
        marginTop: 4,
        shadowColor: '#E65100',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
    },
    submitButtonDisabled: {
        opacity: 0.7,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    switchText: {
        color: '#E65100',
        fontSize: 14,
        fontWeight: '500',
        marginTop: 16,
    },
    backText: {
        color: '#888',
        fontSize: 13,
        marginTop: 12,
    },
    footerText: {
        fontSize: 12,
        color: '#666666',
        textAlign: 'center',
        marginTop: 16,
    },
});
