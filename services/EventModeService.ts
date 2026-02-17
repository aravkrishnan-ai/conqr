import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EVENT_JOINED_KEY = 'conqr_joined_event_id';
const MAX_PAST_EVENTS = 20;

// ── Caches ────────────────────────────────────────────────────────────────────
let cachedEventMode: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

export interface EventInfo {
    id: string;
    name: string;
    startedAt: string;
    endedAt?: string;
    durationMinutes?: number;
    /** @deprecated Use getEventParticipants() — kept for backward compat with past events */
    participants?: string[];
}

let cachedCurrentEvent: EventInfo | null | undefined = undefined;
let eventInfoCacheTimestamp = 0;
const EVENT_INFO_CACHE_TTL_MS = 30_000;

// Participant cache — refreshed from server, keyed by event ID
let cachedParticipants: { eventId: string; ids: string[] } | null = null;
let participantsCacheTimestamp = 0;
const PARTICIPANTS_CACHE_TTL_MS = 15_000; // 15 seconds

// Past events cache
let cachedPastEvents: EventInfo[] | null = null;
let pastEventsCacheTimestamp = 0;
const PAST_EVENTS_CACHE_TTL_MS = 60_000; // 60 seconds — past events change rarely

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the app_settings key for a participant row */
function participantKey(eventId: string, userId: string): string {
    return `event_join:${eventId}:${userId}`;
}

/** Build the prefix for querying all participant rows for an event */
function participantPrefix(eventId: string): string {
    return `event_join:${eventId}:`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const EventModeService = {
    async isAdminUser(): Promise<boolean> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return false;
            const { data } = await supabase
                .from('admin_users')
                .select('user_id')
                .eq('user_id', session.user.id)
                .maybeSingle();
            return !!data;
        } catch {
            return false;
        }
    },

    /** @deprecated Use isAdminUser() instead */
    isDevUser(email: string | undefined | null): boolean {
        // Kept for backward compat in UI; server enforces via admin_users table
        return !!email && email.toLowerCase() === 'arav_krishnan@ug29.mesaschool.co';
    },

    /** Compute time remaining for the current event. Returns null if no active event or no duration set. */
    getEventTimeRemaining(event: EventInfo | null): { hours: number; minutes: number; seconds: number; totalSeconds: number; isExpired: boolean } | null {
        if (!event || !event.durationMinutes) return null;
        const endTime = new Date(event.startedAt).getTime() + event.durationMinutes * 60 * 1000;
        const remaining = Math.max(0, endTime - Date.now());
        const totalSeconds = Math.floor(remaining / 1000);
        return {
            hours: Math.floor(totalSeconds / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60),
            seconds: totalSeconds % 60,
            totalSeconds,
            isExpired: remaining <= 0,
        };
    },

    // ── Event mode flag ───────────────────────────────────────────────────

    async getEventMode(): Promise<boolean> {
        const now = Date.now();
        if (cachedEventMode !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
            return cachedEventMode;
        }

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'event_mode')
                .single();

            if (error || !data) {
                return cachedEventMode ?? false;
            }

            const enabled = data.value === true || data.value === 'true';
            cachedEventMode = enabled;
            cacheTimestamp = now;
            return enabled;
        } catch (err) {
            console.error('Event mode fetch error:', err);
            return cachedEventMode ?? false;
        }
    },

    async setEventMode(enabled: boolean): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.rpc('toggle_event_mode', {
                p_enabled: enabled,
            });

            if (error) {
                console.error('Failed to toggle event mode:', error);
                return { success: false, error: error.message };
            }

            cachedEventMode = enabled;
            cacheTimestamp = Date.now();
            return { success: true };
        } catch (err: any) {
            console.error('Event mode toggle error:', err);
            return { success: false, error: err?.message || 'Unknown error' };
        }
    },

    // ── Current event info ────────────────────────────────────────────────

    async getCurrentEvent(): Promise<EventInfo | null> {
        const now = Date.now();
        if (cachedCurrentEvent !== undefined && (now - eventInfoCacheTimestamp) < EVENT_INFO_CACHE_TTL_MS) {
            return cachedCurrentEvent;
        }

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'current_event')
                .single();

            if (error || !data?.value) {
                cachedCurrentEvent = null;
                eventInfoCacheTimestamp = now;
                return null;
            }

            const eventInfo = data.value as EventInfo;
            cachedCurrentEvent = eventInfo;
            eventInfoCacheTimestamp = now;
            return eventInfo;
        } catch (err) {
            console.error('Failed to fetch current event:', err);
            return cachedCurrentEvent ?? null;
        }
    },

    async getPastEvents(): Promise<EventInfo[]> {
        const now = Date.now();
        if (cachedPastEvents !== null && (now - pastEventsCacheTimestamp) < PAST_EVENTS_CACHE_TTL_MS) {
            return cachedPastEvents;
        }

        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'past_events')
                .single();

            if (error || !data?.value) {
                cachedPastEvents = [];
                pastEventsCacheTimestamp = now;
                return [];
            }
            const events = Array.isArray(data.value) ? data.value : [];
            const result = events.slice(0, MAX_PAST_EVENTS);
            cachedPastEvents = result;
            pastEventsCacheTimestamp = now;
            return result;
        } catch (err) {
            console.error('Failed to fetch past events:', err);
            return cachedPastEvents ?? [];
        }
    },

    // ── Participant tracking (separate rows — no race conditions) ─────────

    /**
     * Get all participant user IDs for an event.
     * Each participant is stored as a separate row: key = "event_join:{eventId}:{userId}"
     * This avoids read-modify-write races when 100+ users join simultaneously.
     */
    async getEventParticipants(eventId: string): Promise<string[]> {
        const now = Date.now();
        if (cachedParticipants !== null && cachedParticipants.eventId === eventId && (now - participantsCacheTimestamp) < PARTICIPANTS_CACHE_TTL_MS) {
            return cachedParticipants.ids;
        }

        try {
            const prefix = participantPrefix(eventId);
            const { data, error } = await supabase
                .from('app_settings')
                .select('key')
                .like('key', `${prefix}%`);

            if (error || !data) {
                return cachedParticipants?.ids ?? [];
            }

            const ids = data.map(row => row.key.slice(prefix.length));
            cachedParticipants = { eventId, ids };
            participantsCacheTimestamp = now;
            return ids;
        } catch (err) {
            console.error('Failed to fetch event participants:', err);
            return cachedParticipants?.ids ?? [];
        }
    },

    /**
     * Join the current event. Uses server-side RPC for atomic participant cap enforcement.
     */
    async joinEvent(userId: string): Promise<boolean> {
        try {
            const currentEvent = await this.getCurrentEvent();
            if (!currentEvent) return false;

            // Check if event time has expired (client-side fast check)
            const timeRemaining = this.getEventTimeRemaining(currentEvent);
            if (timeRemaining?.isExpired) {
                throw new Error('Event has ended');
            }

            // Use server-side RPC for atomic join with cap enforcement
            const { data, error: rpcError } = await supabase.rpc('join_event', {
                p_event_id: currentEvent.id,
                p_user_id: userId,
            });

            if (rpcError) {
                const msg = rpcError.message || '';
                if (msg.includes('full')) throw new Error('Event is full');
                if (msg.includes('ended')) throw new Error('Event has ended');
                if (msg.includes('not found')) throw new Error('Event has ended');
                console.error('Failed to join event on server:', rpcError);
                throw new Error('Failed to join event. Please try again.');
            }

            // Store locally only AFTER server write succeeds
            await AsyncStorage.setItem(EVENT_JOINED_KEY, currentEvent.id);

            // Invalidate participant cache
            cachedParticipants = null;
            participantsCacheTimestamp = 0;

            return true;
        } catch (err: any) {
            // Re-throw known errors so UI can show specific messages
            if (err?.message === 'Event is full' || err?.message === 'Event has ended') {
                throw err;
            }
            console.error('Failed to join event:', err);
            return false;
        }
    },

    /**
     * Leave the current event.
     */
    async leaveEvent(userId?: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(EVENT_JOINED_KEY);

            if (userId) {
                const currentEvent = await this.getCurrentEvent();
                if (currentEvent) {
                    await supabase
                        .from('app_settings')
                        .delete()
                        .eq('key', participantKey(currentEvent.id, userId));
                }
                cachedParticipants = null;
                participantsCacheTimestamp = 0;
            }
        } catch (err) {
            console.error('[EventMode] Failed to leave event:', err);
        }
    },

    async hasJoinedCurrentEvent(): Promise<boolean> {
        try {
            const currentEvent = await this.getCurrentEvent();
            if (!currentEvent) return false;
            const joinedId = await AsyncStorage.getItem(EVENT_JOINED_KEY);
            return joinedId === currentEvent.id;
        } catch {
            return false;
        }
    },

    /**
     * Check if the current user is in event mode (event active AND user joined).
     */
    async isUserInEventMode(): Promise<boolean> {
        const eventMode = await this.getEventMode();
        if (!eventMode) return false;
        const joined = await this.hasJoinedCurrentEvent();
        if (!joined) return false;
        // Also check if the event has expired
        const currentEvent = await this.getCurrentEvent();
        if (currentEvent) {
            const timeRemaining = this.getEventTimeRemaining(currentEvent);
            if (timeRemaining?.isExpired) return false;
        }
        return true;
    },

    // ── Event lifecycle ───────────────────────────────────────────────────

    async startEvent(name: string, durationMinutes: number = 120): Promise<{ success: boolean; error?: string }> {
        const toggleResult = await this.setEventMode(true);
        if (!toggleResult.success) return toggleResult;

        try {
            const eventInfo: EventInfo = {
                id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                name: name.trim(),
                startedAt: new Date().toISOString(),
                durationMinutes,
            };

            await supabase
                .from('app_settings')
                .upsert({ key: 'current_event', value: eventInfo });

            cachedCurrentEvent = eventInfo;
            eventInfoCacheTimestamp = Date.now();
            cachedParticipants = { eventId: eventInfo.id, ids: [] };
            participantsCacheTimestamp = Date.now();
        } catch (err: any) {
            console.error('Failed to save event info:', err);
            return { success: false, error: err?.message || 'Failed to save event info' };
        }

        return { success: true };
    },

    async endEvent(): Promise<{ success: boolean; error?: string }> {
        let currentEvent: EventInfo | null = null;
        try {
            this.clearCache();
            currentEvent = await this.getCurrentEvent();
        } catch (err) {
            console.error('Failed to get current event for archival:', err);
        }

        const toggleResult = await this.setEventMode(false);
        if (!toggleResult.success) return toggleResult;

        await this.leaveEvent();

        // Archive event with final participant list
        try {
            if (currentEvent) {
                // Fetch final participant count for the archived record
                const finalParticipants = await this.getEventParticipants(currentEvent.id);
                currentEvent.endedAt = new Date().toISOString();
                currentEvent.participants = finalParticipants;

                const pastEvents = await this.getPastEvents();
                pastEvents.unshift(currentEvent);
                const capped = pastEvents.slice(0, MAX_PAST_EVENTS);
                await supabase
                    .from('app_settings')
                    .upsert({ key: 'past_events', value: capped });

                // Clean up participant rows for this event (fire-and-forget)
                this.cleanupEventParticipants(currentEvent.id).catch(err => {
                    console.error('Failed to cleanup event participant rows:', err);
                });
            }

            await supabase
                .from('app_settings')
                .upsert({ key: 'current_event', value: null });

            cachedCurrentEvent = null;
            eventInfoCacheTimestamp = Date.now();
            cachedParticipants = null;
            participantsCacheTimestamp = 0;
        } catch (err: any) {
            console.error('Failed to archive event:', err);
            return { success: false, error: err?.message || 'Failed to archive event' };
        }

        return { success: true };
    },

    /**
     * Remove all event_join:* rows for a finished event.
     * Non-blocking — called fire-and-forget after archival.
     */
    async cleanupEventParticipants(eventId: string): Promise<void> {
        try {
            const prefix = participantPrefix(eventId);
            // Fetch all keys first then delete them in batch
            const { data } = await supabase
                .from('app_settings')
                .select('key')
                .like('key', `${prefix}%`);

            if (data && data.length > 0) {
                const keys = data.map(r => r.key);
                // Delete in batches of 50 to avoid oversized queries
                for (let i = 0; i < keys.length; i += 50) {
                    const batch = keys.slice(i, i + 50);
                    await supabase
                        .from('app_settings')
                        .delete()
                        .in('key', batch);
                }
                console.log(`Cleaned up ${keys.length} participant rows for event ${eventId}`);
            }
        } catch (err) {
            console.error('Event participant cleanup error:', err);
        }
    },

    // ── Cache management ──────────────────────────────────────────────────

    clearCache(): void {
        cachedEventMode = null;
        cacheTimestamp = 0;
        cachedCurrentEvent = undefined;
        eventInfoCacheTimestamp = 0;
        cachedParticipants = null;
        participantsCacheTimestamp = 0;
        cachedPastEvents = null;
        pastEventsCacheTimestamp = 0;
    },
};
