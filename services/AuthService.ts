import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';

// Simple random ID generator to avoid uuid/crypto dependency problems in React Native
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

WebBrowser.maybeCompleteAuthSession();

const extractParamsFromUrl = (url: string) => {
    const params: Record<string, string> = {};
    const errorMatch = url.match(/error_description=([^&]+)/);
    const errorCodeMatch = url.match(/error=([^&]+)/);

    if (url.includes('#')) {
        const hash = url.split('#')[1];
        hash.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            params[key] = value;
        });
    } else if (url.includes('?')) {
        const query = url.split('?')[1];
        query.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            params[key] = value;
        });
    }

    return {
        params,
        errorCode: errorCodeMatch ? errorCodeMatch[1] : null,
        errorDescription: errorMatch ? decodeURIComponent(errorMatch[1].replace(/\+/g, ' ')) : null,
    };
};

export const AuthService = {
    async getCurrentUser(): Promise<UserProfile | undefined> {
        // Check Supabase session first
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            // Check if user exists in local DB (cache)
            const localUser = await db.users.get(session.user.id);
            if (localUser) return localUser;

            // If not, maybe create a local record from session?
            const profile: UserProfile = {
                id: session.user.id,
                username: session.user.user_metadata.name || session.user.email?.split('@')[0] || 'User',
                email: session.user.email,
                avatarUrl: session.user.user_metadata.avatar_url,
                createdAt: Date.now(),
                bio: ''
            };

            // Upsert to local cache
            await db.users.put(profile);
            return profile;
        }

        // Fallback to local user if any (for offline continuity)
        const users = await db.users.toArray();
        return users[0];
    },

    async signInWithGoogle() {
        const redirectUrl = makeRedirectUri();

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                skipBrowserRedirect: true,
            }
        });

        if (error) {
            console.error('Supabase OAuth Error:', error);
            throw error;
        }

        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

        if (res.type === 'success' && res.url) {
            const { params, errorCode } = extractParamsFromUrl(res.url);
            if (errorCode) throw new Error(errorCode);

            const { access_token, refresh_token } = params;
            if (access_token && refresh_token) {
                await supabase.auth.setSession({
                    access_token,
                    refresh_token,
                });
            }
        }
    },

    async signup(username: string, email?: string): Promise<UserProfile> {
        // Legacy local signup, keeping for fallback
        const existing = await db.users.where('username').equals(username).first();
        if (existing) throw new Error('Username taken');

        const newUser: UserProfile = {
            id: generateId(),
            username,
            email,
            createdAt: Date.now(),
            bio: ''
        };

        await db.users.add(newUser);
        return newUser;
    },

    async updateProfile(updates: Partial<UserProfile>) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) throw new Error('No user found');

        // Upsert to Supabase
        const { error } = await supabase
            .from('users')
            .upsert({
                id: session.user.id,
                email: session.user.email,
                username: updates.username,
                bio: updates.bio,
                avatar_url: updates.avatarUrl || session.user.user_metadata.avatar_url
            });

        if (error) throw error;

        // Update local cache
        await db.users.put({
            id: session.user.id,
            email: session.user.email,
            username: updates.username || '',
            bio: updates.bio || '',
            avatarUrl: updates.avatarUrl || session.user.user_metadata.avatar_url,
            createdAt: Date.now()
        });

        return { id: session.user.id, ...updates } as UserProfile;
    },

    async getCurrentProfile(): Promise<UserProfile | null> {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            username: data.username,
            email: data.email,
            bio: data.bio,
            avatarUrl: data.avatar_url,
            createdAt: new Date(data.created_at).getTime()
        };
    }
};
