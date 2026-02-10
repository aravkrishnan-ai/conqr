import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Expo loads EXPO_PUBLIC_ prefixed vars from .env automatically at build time
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// Handle auth errors - clear invalid sessions
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed successfully');
    } else if (event === 'SIGNED_OUT') {
        console.log('User signed out');
    }
});

// Clear only definitively invalid sessions on startup.
// Transient errors (network issues, slow refresh) are NOT treated as invalid —
// the Supabase auto-refresh mechanism will handle those.
const clearInvalidSession = async () => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
            const msg = (error.message || '').toLowerCase();
            const isUnrecoverable =
                msg.includes('invalid refresh token') ||
                msg.includes('refresh token not found') ||
                msg.includes('refresh token is not valid') ||
                (error as any).status === 401;

            if (isUnrecoverable) {
                console.log('Clearing invalid auth session:', error.message);
                await supabase.auth.signOut();
                const keys = await AsyncStorage.getAllKeys();
                const supabaseKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
                if (supabaseKeys.length > 0) {
                    await AsyncStorage.multiRemove(supabaseKeys);
                }
            } else {
                // Transient error — let auto-refresh handle it
                console.log('Session check returned non-fatal error, skipping clear:', error.message);
            }
        }
    } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        const isAuthError =
            msg.includes('invalid refresh token') ||
            msg.includes('refresh token not found') ||
            (err?.name === 'AuthApiError' && err?.status === 401);

        if (isAuthError) {
            console.log('Clearing stale auth tokens:', err?.message);
            try {
                await supabase.auth.signOut();
                const keys = await AsyncStorage.getAllKeys();
                const supabaseKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
                if (supabaseKeys.length > 0) {
                    await AsyncStorage.multiRemove(supabaseKeys);
                }
            } catch {
                // Ignore cleanup errors
            }
        } else {
            console.log('Session check failed (transient), not clearing:', err?.message);
        }
    }
};

// Exported so App.tsx can call it sequentially during init, avoiding race conditions
export { clearInvalidSession };
