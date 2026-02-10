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

// Clear any stale/invalid tokens on startup
const clearInvalidSession = async () => {
    try {
        // Try to get session - if it fails, clear the stored tokens
        const { error } = await supabase.auth.getSession();
        if (error) {
            console.log('Clearing invalid auth session');
            await supabase.auth.signOut();
            // Clear all supabase auth keys from AsyncStorage
            const keys = await AsyncStorage.getAllKeys();
            const supabaseKeys = keys.filter(k => k.includes('supabase') || k.includes('sb-'));
            if (supabaseKeys.length > 0) {
                await AsyncStorage.multiRemove(supabaseKeys);
            }
        }
    } catch (err: any) {
        // Silently handle - this is just cleanup
        if (err?.message?.includes('Refresh Token') || err?.name === 'AuthApiError') {
            console.log('Clearing stale auth tokens');
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
        }
    }
};

// Exported so App.tsx can call it sequentially during init, avoiding race conditions
export { clearInvalidSession };
