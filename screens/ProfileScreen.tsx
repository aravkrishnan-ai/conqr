import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { ArrowLeft, User, Mail, Globe } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { AuthService } from '../services/AuthService';
import { UserProfile } from '../lib/types';

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const p = await AuthService.getCurrentProfile();
                setProfile(p);
            } catch (err) {
                console.error('Fetch profile error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color="#22d3ee" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.content}>
                <View style={styles.profileHeader}>
                    {profile?.avatarUrl ? (
                        <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <User color="#22d3ee" size={40} />
                        </View>
                    )}
                    <Text style={styles.username}>{profile?.username || 'Conqueror'}</Text>
                    {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                </View>

                <View style={styles.infoSection}>
                    <View style={styles.infoRow}>
                        <Mail color="#71717a" size={20} />
                        <Text style={styles.infoText}>{profile?.email || 'No email linked'}</Text>
                    </View>
                </View>

                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    center: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
    },
    profileHeader: {
        alignItems: 'center',
        marginBottom: 40,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#22d3ee33',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#22d3ee66',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#22d3ee',
    },
    username: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    bio: {
        color: '#a1a1aa',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    infoSection: {
        width: '100%',
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    infoText: {
        color: '#fff',
        fontSize: 16,
    },
    signOutButton: {
        width: '100%',
        padding: 16,
        backgroundColor: '#ef444422',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ef444444',
    },
    signOutText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
