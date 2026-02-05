import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Check, Sparkles } from 'lucide-react-native';
import { AuthService } from '../services/AuthService';
import { useAuth } from '../contexts/AuthContext';

const COLORS = {
    primary: '#FC4C02',
    background: '#000000',
    card: '#111111',
    border: '#222222',
    text: '#FFFFFF',
    textSecondary: '#888888',
    textMuted: '#555555',
};

export default function ProfileSetupScreen() {
    const { setHasProfile, suggestedUsername, userAvatarUrl } = useAuth();
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);

    // Pre-fill username from Google profile
    useEffect(() => {
        if (suggestedUsername && !username) {
            setUsername(suggestedUsername);
        }
    }, [suggestedUsername]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async () => {
        if (!username.trim()) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        if (username.trim().length < 3) {
            Alert.alert('Error', 'Username must be at least 3 characters');
            return;
        }

        setLoading(true);
        try {
            await AuthService.updateProfile({
                username: username.trim(),
            });
            setHasProfile(true);
        } catch (error: any) {
            console.error('Save profile error:', error);
            Alert.alert('Error', error.message || 'Failed to save profile');
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <View style={styles.content}>
                    {/* Avatar preview */}
                    <View style={styles.avatarSection}>
                        {userAvatarUrl ? (
                            <Image source={{ uri: userAvatarUrl }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <User color={COLORS.primary} size={36} />
                            </View>
                        )}
                    </View>

                    <Text style={styles.title}>Choose your name</Text>
                    <Text style={styles.subtitle}>{"This is how you'll appear on leaderboards"}</Text>

                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter username"
                            placeholderTextColor={COLORS.textMuted}
                            value={username}
                            onChangeText={setUsername}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus={!suggestedUsername}
                            maxLength={24}
                        />
                        {suggestedUsername && username !== suggestedUsername && (
                            <TouchableOpacity
                                style={styles.suggestButton}
                                onPress={() => setUsername(suggestedUsername)}
                            >
                                <Sparkles color={COLORS.primary} size={14} />
                                <Text style={styles.suggestText}>Use Google name</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[styles.saveButton, loading && styles.disabledButton]}
                        onPress={handleSave}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Check color="#fff" size={20} />
                                <Text style={styles.saveButtonText}>START CONQUERING</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarSection: {
        marginBottom: 32,
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        borderWidth: 3,
        borderColor: COLORS.primary,
    },
    avatarPlaceholder: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: 'rgba(252, 76, 2, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(252, 76, 2, 0.3)',
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.text,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: COLORS.textSecondary,
        marginTop: 8,
        marginBottom: 40,
    },
    inputWrapper: {
        width: '100%',
        maxWidth: 320,
        marginBottom: 32,
    },
    input: {
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 18,
        color: COLORS.text,
        fontSize: 18,
        textAlign: 'center',
    },
    suggestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 12,
        paddingVertical: 8,
    },
    suggestText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: COLORS.primary,
        borderRadius: 12,
        height: 56,
        width: '100%',
        maxWidth: 320,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
    },
    disabledButton: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 1,
    },
});
