import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Get Supabase config from app.json extra field (works in EAS builds)
const extra = Constants.expoConfig?.extra || {};
const supabaseUrl = extra.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = extra.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

console.log('Supabase URL:', supabaseUrl);

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

clearInvalidSession();
