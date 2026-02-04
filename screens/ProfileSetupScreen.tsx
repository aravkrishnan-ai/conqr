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
                                <User color="#22d3ee" size={36} />
                            </View>
                        )}
                    </View>

                    <Text style={styles.title}>Choose your name</Text>
                    <Text style={styles.subtitle}>{"This is how you'll appear on leaderboards"}</Text>

                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter username"
                            placeholderTextColor="#52525b"
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
                                <Sparkles color="#22d3ee" size={14} />
                                <Text style={styles.suggestText}>Use Google name</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[styles.saveButton, loading && styles.disabledButton]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <>
                                <Check color="#000" size={20} />
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
        backgroundColor: '#000',
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
        marginBottom: 24,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: '#22d3ee',
    },
    avatarPlaceholder: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#22d3ee22',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#22d3ee44',
    },
    title: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 15,
        color: '#71717a',
        marginTop: 6,
        marginBottom: 32,
    },
    inputWrapper: {
        width: '100%',
        maxWidth: 320,
        marginBottom: 24,
    },
    input: {
        backgroundColor: '#18181b',
        borderWidth: 1,
        borderColor: '#27272a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
    },
    suggestButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 10,
        paddingVertical: 6,
    },
    suggestText: {
        color: '#22d3ee',
        fontSize: 13,
        fontWeight: '500',
    },
    saveButton: {
        backgroundColor: '#22d3ee',
        borderRadius: 28,
        height: 56,
        width: '100%',
        maxWidth: 320,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: '#22d3ee',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    disabledButton: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
});
