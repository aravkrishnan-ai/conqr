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

// ── Batched event queue ─────────────────────────────────────────────────────

interface QueuedEvent {
    id: string;
    user_id: string;
    event_type: AnalyticsEventType;
    screen_name: string | null;
    session_id: string;
    metadata: Record<string, any>;
    created_at: string;
}

let eventQueue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL_MS = 10_000; // Flush every 10 seconds
const FLUSH_THRESHOLD = 10; // Or when 10 events are queued

function enqueueEvent(
    eventType: AnalyticsEventType,
    userId: string,
    metadata: Record<string, any> = {},
    screenName?: string,
): void {
    eventQueue.push({
        id: uuidv4(),
        user_id: userId,
        event_type: eventType,
        screen_name: screenName || null,
        session_id: sessionId,
        metadata: { ...metadata, platform: Platform.OS },
        created_at: new Date().toISOString(),
    });

    if (eventQueue.length >= FLUSH_THRESHOLD) {
        flushQueue();
    }
}

async function flushQueue(): Promise<void> {
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0); // Take all and clear
    try {
        const { error } = await supabase
            .from('analytics_events')
            .insert(batch);
        if (error) {
            console.error('[Analytics] Batch insert failed:', error.code, error.message);
            // Re-queue failed events (drop if queue is already large to prevent memory leak)
            if (eventQueue.length < 100) {
                eventQueue.unshift(...batch);
            }
        }
    } catch (err) {
        console.error('[Analytics] Batch flush error:', err);
        if (eventQueue.length < 100) {
            eventQueue.unshift(...batch);
        }
    }
}

// ── Public service ──────────────────────────────────────────────────────────

export const AnalyticsService = {
    async trackEvent(
        eventType: AnalyticsEventType,
        metadata: Record<string, any> = {},
        screenName?: string,
    ): Promise<void> {
        try {
            const userId = await getUserId();
            if (!userId) return;
            enqueueEvent(eventType, userId, metadata, screenName);
        } catch {
            // Analytics must never crash the app
        }
    },

    async trackScreenView(screenName: string): Promise<void> {
        await this.trackEvent('screen_view', {}, screenName);
    },

    async trackError(message: string, stack?: string, component?: string): Promise<void> {
        await this.trackEvent('error', { message, stack, component });
    },

    async trackCrash(error: Error, componentStack?: string): Promise<void> {
        await this.trackEvent('crash', {
            message: error.message,
            stack: error.stack,
            component: componentStack,
        });
    },

    async startSession(): Promise<void> {
        sessionId = uuidv4();

        // Clean up previous listeners and timers
        if (appStateSubscription) appStateSubscription.remove();
        if (authSubscription) authSubscription.unsubscribe();
        if (flushTimer) clearInterval(flushTimer);

        // Start periodic flush
        flushTimer = setInterval(() => flushQueue(), FLUSH_INTERVAL_MS);

        // Track foreground/background transitions
        appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
            if (state === 'active') {
                sessionId = uuidv4();
                this.trackEvent('session_start');
            } else if (state === 'background' || state === 'inactive') {
                this.trackEvent('session_end');
                // Flush on background to avoid losing events
                flushQueue();
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
        // Flush remaining events before ending
        await flushQueue();
        if (flushTimer) {
            clearInterval(flushTimer);
            flushTimer = null;
        }
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
        await flushQueue();
    },
};
