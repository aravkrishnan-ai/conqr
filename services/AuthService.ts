import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { Platform, Alert } from 'react-native';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

WebBrowser.maybeCompleteAuthSession();

const extractParamsFromUrl = (url: string) => {
    const params: Record<string, string> = {};
    const errorMatch = url.match(/error_description=([^&]+)/);
    const errorCodeMatch = url.match(/error=([^&]+)/);

    // Handle both hash (#) and query (?) parameters
    let paramString = '';
    if (url.includes('#')) {
        paramString = url.split('#')[1];
    } else if (url.includes('?')) {
        paramString = url.split('?')[1];
    }

    if (paramString) {
        paramString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                params[key] = decodeURIComponent(value);
            }
        });
    }

    return {
        params,
        errorCode: errorCodeMatch ? decodeURIComponent(errorCodeMatch[1]) : null,
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
        // Create proper redirect URI for the app scheme
        // Force the scheme-based redirect for native apps
        const redirectUrl = 'conqr://auth/callback';

        console.log('OAuth redirect URL:', redirectUrl);

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                skipBrowserRedirect: true,
            }
        });

        if (error) {
            console.error('Supabase OAuth Error:', error);
            Alert.alert('Sign In Error', error.message || 'Failed to start sign in');
            throw error;
        }

        if (!data?.url) {
            console.error('No OAuth URL returned');
            Alert.alert('Sign In Error', 'Could not get sign in URL');
            throw new Error('No OAuth URL returned');
        }

        console.log('Opening auth URL:', data.url);

        let res;
        try {
            res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        } catch (browserError: any) {
            console.error('Browser error:', browserError);
            Alert.alert('Browser Error', browserError?.message || 'Failed to open browser');
            throw browserError;
        }

        console.log('Auth session result:', res.type);

        if (res.type === 'cancel') {
            console.log('User cancelled sign in');
            return;
        }

        if (res.type === 'success' && res.url) {
            console.log('Auth callback URL:', res.url);
            const { params, errorCode, errorDescription } = extractParamsFromUrl(res.url);

            console.log('Parsed params:', Object.keys(params));

            if (errorCode) {
                console.error('OAuth error:', errorCode, errorDescription);
                Alert.alert('OAuth Error', errorDescription || errorCode);
                throw new Error(errorDescription || errorCode);
            }

            const { access_token, refresh_token } = params;
            console.log('Got tokens:', { hasAccess: !!access_token, hasRefresh: !!refresh_token });

            if (access_token && refresh_token) {
                const { error: sessionError } = await supabase.auth.setSession({
                    access_token,
                    refresh_token,
                });

                if (sessionError) {
                    console.error('Session error:', sessionError);
                    Alert.alert('Session Error', sessionError.message || 'Failed to save session');
                    throw sessionError;
                }

                console.log('Session set successfully');
            } else {
                console.error('Missing tokens in callback URL:', res.url);
                Alert.alert('Sign In Error', 'Authentication incomplete - please try again');
            }
        } else if (res.type === 'dismiss') {
            console.log('Auth window dismissed');
        }
    },

    async signup(username: string, email?: string): Promise<UserProfile> {
        // Legacy local signup, keeping for fallback
        const existing = await db.users.where('username').equals(username).first();
        if (existing) throw new Error('Username taken');

        const newUser: UserProfile = {
            id: uuidv4(),
            username,
            email,
            createdAt: Date.now(),
            bio: ''
        };

        await db.users.add(newUser);
        return newUser;
    },

    async updateProfile(updates: Partial<UserProfile>) {
        // Get user ID from local or generate one
        let userId: string;
        let userEmail: string | undefined;
        let avatarUrl: string | undefined;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id || uuidv4();
            userEmail = session?.user?.email;
            avatarUrl = session?.user?.user_metadata?.avatar_url;
        } catch {
            userId = uuidv4();
        }

        // Save locally FIRST (offline-first)
        const profile: UserProfile = {
            id: userId,
            email: userEmail,
            username: updates.username || '',
            bio: updates.bio || '',
            avatarUrl: updates.avatarUrl || avatarUrl,
            createdAt: Date.now()
        };
        await db.users.put(profile);

        // Try to sync to Supabase in background (don't await)
        (async () => {
            try {
                await supabase
                    .from('users')
                    .upsert({
                        id: userId,
                        email: userEmail,
                        username: updates.username,
                        bio: updates.bio,
                        avatar_url: updates.avatarUrl || avatarUrl
                    });
                console.log('Profile synced to cloud');
            } catch (err: any) {
                console.log('Cloud sync failed, will retry later:', err?.message);
            }
        })();

        return profile;
    },

    async getCurrentProfile(): Promise<UserProfile | null> {
        // Check local DB FIRST (offline-first)
        try {
            const users = await db.users.toArray();
            if (users.length > 0 && users[0].username) {
                return users[0];
            }
        } catch (err) {
            console.log('Local DB error:', err);
        }

        // Fallback to Supabase if local is empty
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return null;

            const { data } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (data) {
                return {
                    id: data.id,
                    username: data.username,
                    email: data.email,
                    bio: data.bio,
                    avatarUrl: data.avatar_url,
                    createdAt: new Date(data.created_at).getTime()
                };
            }
        } catch (err) {
            console.log('Supabase profile fetch error:', err);
        }

        return null;
    }
};
