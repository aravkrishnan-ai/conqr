import { v4 as uuidv4 } from 'uuid';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { AnalyticsEventType } from '../lib/analytics-types';

let sessionId: string = uuidv4();
let cachedUserId: string | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;

async function getUserId(): Promise<string | null> {
    if (cachedUserId) return cachedUserId;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        cachedUserId = session?.user?.id || null;
        return cachedUserId;
    } catch {
        return null;
    }
}

// Keep cachedUserId in sync with auth state
try {
    supabase.auth.onAuthStateChange((_event, session) => {
        cachedUserId = session?.user?.id || null;
    });
} catch {
    // Gracefully handle missing auth in test environments
}

async function sendEvent(
    eventType: AnalyticsEventType,
    userId: string,
    metadata: Record<string, any> = {},
    screenName?: string,
): Promise<void> {
    const { error } = await supabase
        .from('analytics_events')
        .insert({
            id: uuidv4(),
            user_id: userId,
            event_type: eventType,
            screen_name: screenName || null,
            session_id: sessionId,
            metadata: { ...metadata, platform: Platform.OS },
            created_at: new Date().toISOString(),
        });

    if (error) {
        console.error('[Analytics] Insert failed:', error.code, error.message, error.hint);
    }
}

export const AnalyticsService = {
    async trackEvent(
        eventType: AnalyticsEventType,
        metadata: Record<string, any> = {},
        screenName?: string,
    ): Promise<void> {
        try {
            const userId = await getUserId();
            if (!userId) return;
            // Fire and forget — don't block the caller
            sendEvent(eventType, userId, metadata, screenName);
        } catch {
            // Analytics must never crash the app
        }
    },

    async trackScreenView(screenName: string): Promise<void> {
        this.trackEvent('screen_view', {}, screenName);
    },

    async trackError(message: string, stack?: string, component?: string): Promise<void> {
        this.trackEvent('error', { message, stack, component });
    },

    async trackCrash(error: Error, componentStack?: string): Promise<void> {
        this.trackEvent('crash', {
            message: error.message,
            stack: error.stack,
            component: componentStack,
        });
    },

    async startSession(): Promise<void> {
        sessionId = uuidv4();

        // Clean up previous listeners
        if (appStateSubscription) appStateSubscription.remove();
        if (authSubscription) authSubscription.unsubscribe();

        // Track foreground/background transitions
        appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                sessionId = uuidv4();
                this.trackEvent('session_start');
            } else if (state === 'background' || state === 'inactive') {
                this.trackEvent('session_end');
            }
        });

        // Record initial session_start once user is authenticated
        const userId = await getUserId();
        if (userId) {
            this.trackEvent('session_start');
        } else {
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
                if (event === 'SIGNED_IN') {
                    this.trackEvent('session_start');
                    subscription.unsubscribe();
                    authSubscription = null;
                }
            });
            authSubscription = subscription;
        }
    },

    async endSession(): Promise<void> {
        this.trackEvent('session_end');
        if (appStateSubscription) {
            appStateSubscription.remove();
            appStateSubscription = null;
        }
        if (authSubscription) {
            authSubscription.unsubscribe();
            authSubscription = null;
        }
    },

    async flush(): Promise<void> {
        // No-op, events are sent immediately now
    },
};
