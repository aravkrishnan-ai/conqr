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
import { StatusBar } from 'expo-status-bar';
import { User, Sparkles } from 'lucide-react-native';
import { AuthService } from '../services/AuthService';
import { useAuth } from '../contexts/AuthContext';
import { useScreenTracking } from '../lib/useScreenTracking';

export default function ProfileSetupScreen() {
    useScreenTracking('ProfileSetup');
    const { setHasProfile, suggestedUsername, userAvatarUrl } = useAuth();
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (suggestedUsername && !username) {
            const sanitized = suggestedUsername
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, '')
                .slice(0, 20);
            setUsername(sanitized);
        }
    }, [suggestedUsername]);

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
                avatarUrl: userAvatarUrl || undefined,
            });
            setHasProfile(true);
        } catch (error: any) {
            console.error('Save profile error:', error);
            Alert.alert('Error', error.message || 'Failed to save profile');
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <View style={styles.content}>
                        <View style={styles.avatarSection}>
                            {userAvatarUrl ? (
                                <Image source={{ uri: userAvatarUrl }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}>
                                    <User color="#E65100" size={40} />
                                </View>
                            )}
                        </View>

                        <Text style={styles.title}>Choose your name</Text>
                        <Text style={styles.subtitle}>This is how you'll appear on leaderboards</Text>

                        <View style={styles.inputWrapper}>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter username"
                                placeholderTextColor="#999999"
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
                                    <Sparkles color="#E65100" size={14} />
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
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.saveButtonText}>Continue</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarSection: {
        marginBottom: 32,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#E65100',
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(230, 81, 0, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#1A1A1A',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#666666',
        marginTop: 8,
        marginBottom: 40,
        textAlign: 'center',
    },
    inputWrapper: {
        width: '100%',
        maxWidth: 320,
        marginBottom: 32,
    },
    input: {
        backgroundColor: '#F5F5F5',
        borderRadius: 12,
        padding: 18,
        color: '#1A1A1A',
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
        color: '#E65100',
        fontSize: 14,
        fontWeight: '600',
    },
    saveButton: {
        backgroundColor: '#E65100',
        borderRadius: 12,
        height: 56,
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#E65100',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
    },
    disabledButton: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },
});
