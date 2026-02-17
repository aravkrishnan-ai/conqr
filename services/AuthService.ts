import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import { Alert } from 'react-native';
import { db } from '../lib/db';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/types';


try {
    WebBrowser.maybeCompleteAuthSession();
} catch {
    // Safe to ignore — not available on all platforms (e.g. web)
}

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

/**
 * Handle an auth callback URL by extracting tokens and setting the Supabase session.
 * Used by both the openAuthSessionAsync return and the Linking URL listener.
 */
export const handleAuthCallbackUrl = async (url: string): Promise<boolean> => {
    const { params, errorCode, errorDescription } = extractParamsFromUrl(url);

    if (errorCode) {
        console.error('OAuth error:', errorCode, errorDescription);
        Alert.alert('OAuth Error', errorDescription || errorCode);
        return false;
    }

    const { access_token, refresh_token } = params;

    if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        });

        if (sessionError) {
            console.error('Session error:', sessionError);
            Alert.alert('Session Error', sessionError.message || 'Failed to save session');
            return false;
        }

        console.log('Session set successfully');
        return true;
    }

    console.error('Missing tokens in callback URL');
    return false;
};

export const signUpWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
    });

    if (error) {
        console.error('Sign up error:', error);
        Alert.alert('Sign Up Error', error.message || 'Failed to create account');
        throw error;
    }

    if (data?.user && !data.session) {
        Alert.alert(
            'Check Your Email',
            'We sent you a confirmation link. Please check your inbox and confirm your email to sign in.'
        );
    }

    return data;
};

export const signInWithEmail = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
    });

    if (error) {
        console.error('Sign in error:', error);
        Alert.alert('Sign In Error', error.message || 'Failed to sign in');
        throw error;
    }

    return data;
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
        // Generate the correct redirect URI for the current environment
        // - Expo Go: exp://192.168.x.x:8081/--/auth/callback
        // - Dev build / standalone: conqr://auth/callback
        const redirectUrl = makeRedirectUri({
            scheme: 'conqr',
            path: 'auth/callback',
        });

        // redirectUrl is safe to log (no secrets) but omitted for production cleanliness

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

        // Opening OAuth browser session

        // Set up a Linking listener BEFORE opening the browser.
        // On Android in Expo Go, openAuthSessionAsync may not catch the
        // exp:// redirect — Android handles it as a deep link intent that
        // reopens Expo Go directly. The Linking listener catches it instead.
        let handled = false;
        const linkingPromise = new Promise<string | null>((resolve) => {
            const sub = Linking.addEventListener('url', (event) => {
                if (event.url.includes('access_token') || event.url.includes('error')) {
                    sub.remove();
                    resolve(event.url);
                }
            });
            // Clean up listener after 2 minutes (timeout)
            setTimeout(() => { sub.remove(); resolve(null); }, 120000);
        });

        let res;
        try {
            res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        } catch (browserError: any) {
            console.error('Browser error:', browserError);
            Alert.alert('Browser Error', browserError?.message || 'Failed to open browser');
            throw browserError;
        }

        console.log('Auth session result:', res.type);

        // Try the openAuthSessionAsync result first
        if (res.type === 'success' && res.url) {
            handled = true;
            await handleAuthCallbackUrl(res.url);
        }

        if (res.type === 'cancel') {
            console.log('User cancelled sign in');
            return;
        }

        // If openAuthSessionAsync didn't return a success URL (common on Android
        // in Expo Go), wait for the Linking listener to catch the redirect.
        if (!handled && res.type === 'dismiss') {
            console.log('Browser dismissed, checking Linking listener for callback...');
            const callbackUrl = await linkingPromise;
            if (callbackUrl) {
                await handleAuthCallbackUrl(callbackUrl);
            } else {
                console.log('No callback URL received');
            }
        }
    },

    async updateProfile(updates: Partial<UserProfile>) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            throw new Error('Must be signed in to update profile');
        }

        const userId = session.user.id;
        const userEmail = session.user.email;
        const avatarUrl = session.user.user_metadata?.avatar_url;

        // Preserve existing createdAt if the user already has a local profile
        let existingCreatedAt: number | undefined;
        try {
            const existingProfile = await db.users.get(userId);
            existingCreatedAt = existingProfile?.createdAt;
        } catch {}

        // Save locally FIRST (offline-first)
        const profile: UserProfile = {
            id: userId,
            email: userEmail,
            username: updates.username || '',
            bio: updates.bio || '',
            avatarUrl: updates.avatarUrl || avatarUrl,
            createdAt: existingCreatedAt || Date.now()
        };
        await db.users.put(profile);

        // Sync to Supabase - await to ensure profile is available for territory joins and user search
        try {
            const { error } = await supabase
                .from('users')
                .upsert({
                    id: userId,
                    email: userEmail,
                    username: updates.username,
                    bio: updates.bio,
                    avatar_url: updates.avatarUrl || avatarUrl
                });
            if (error) {
                console.error('Failed to sync profile to cloud:', error);
            } else {
                console.log('Profile synced to cloud');
            }
        } catch (err: any) {
            console.error('Cloud profile sync failed:', err?.message);
        }

        return profile;
    },

    async getCurrentProfile(): Promise<UserProfile | null> {
        // Check local DB FIRST (offline-first), filtered by current session user
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const localUser = await db.users.get(session.user.id);
                if (localUser?.username) {
                    return localUser;
                }
            } else {
                // No session — try local fallback
                const users = await db.users.toArray();
                if (users.length > 0 && users[0].username) {
                    return users[0];
                }
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
    },

    /**
     * Search for users by username (partial match)
     * Returns only public info (no email or sensitive data)
     */
    async searchUsers(query: string): Promise<UserProfile[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, username, bio, avatar_url, created_at')
                .ilike('username', `%${query.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
                .limit(20);

            if (error) {
                console.error('User search error:', error);
                return [];
            }

            if (data) {
                return data.map(user => ({
                    id: user.id,
                    username: user.username || '',
                    bio: user.bio || '',
                    avatarUrl: user.avatar_url || undefined,
                    createdAt: user.created_at ? new Date(user.created_at).getTime() : Date.now()
                }));
            }

            return [];
        } catch (err) {
            console.error('Search users error:', err);
            return [];
        }
    },

    /**
     * Get a user's public profile by ID
     * Returns only public info (no email or sensitive data)
     */
    async getUserProfile(userId: string): Promise<UserProfile | null> {
        if (!userId) return null;

        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, username, bio, avatar_url, created_at')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Get user profile error:', error);
                return null;
            }

            if (data) {
                return {
                    id: data.id,
                    username: data.username || '',
                    bio: data.bio || '',
                    avatarUrl: data.avatar_url || undefined,
                    createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now()
                };
            }

            return null;
        } catch (err) {
            console.error('Get user profile error:', err);
            return null;
        }
    }
};
