import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, AlignLeft, Check } from 'lucide-react-native';
import { AuthService } from '../services/AuthService';
import { useAuth } from '../contexts/AuthContext';

export default function ProfileSetupScreen() {
    const { setHasProfile } = useAuth();
    const [username, setUsername] = useState('');
    const [bio, setBio] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!username.trim()) {
            Alert.alert('Error', 'Please enter a username');
            return;
        }

        if (username.length < 3) {
            Alert.alert('Error', 'Username must be at least 3 characters');
            return;
        }

        setLoading(true);
        try {
            // Save profile (local-first, instant)
            await AuthService.updateProfile({
                username: username.trim(),
                bio: bio.trim(),
            });

            // Update app state to show Game screen
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
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Finish your profile</Text>
                        <Text style={styles.subtitle}>Tell the world who is conquering their streets!</Text>
                    </View>

                    <View style={styles.form}>
                        <View style={styles.inputGroup}>
                            <View style={styles.labelContainer}>
                                <User color="#22d3ee" size={16} />
                                <Text style={styles.label}>USERNAME</Text>
                            </View>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. StreetKing99"
                                placeholderTextColor="#52525b"
                                value={username}
                                onChangeText={setUsername}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Text style={styles.hint}>This is how you'll appear on leaderboards.</Text>
                        </View>

                        <View style={styles.inputGroup}>
                            <View style={styles.labelContainer}>
                                <AlignLeft color="#22d3ee" size={16} />
                                <Text style={styles.label}>BIO</Text>
                            </View>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="I run for pizza and glory."
                                placeholderTextColor="#52525b"
                                value={bio}
                                onChangeText={setBio}
                                multiline
                                numberOfLines={3}
                            />
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
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
    },
    header: {
        marginBottom: 40,
        marginTop: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 16,
        color: '#a1a1aa',
        marginTop: 8,
        lineHeight: 24,
    },
    form: {
        gap: 32,
    },
    inputGroup: {
        gap: 12,
    },
    labelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#22d3ee',
        letterSpacing: 1,
    },
    input: {
        backgroundColor: '#18181b',
        borderWidth: 1,
        borderColor: '#27272a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
    },
    textArea: {
        height: 100,
        textAlignVertical: 'top',
    },
    hint: {
        fontSize: 12,
        color: '#52525b',
    },
    saveButton: {
        backgroundColor: '#22d3ee',
        borderRadius: 28,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 20,
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
