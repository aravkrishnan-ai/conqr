import { supabase } from '../lib/supabase';
import { Territory } from '../lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_EMAIL = 'arav_krishnan@ug29.mesaschool.co';
const EVENT_JOINED_KEY = 'conqr_joined_event_id';
const MAX_PAST_EVENTS = 20;

// Cache event mode — short TTL so changes propagate quickly (#4)
let cachedEventMode: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds (was 5 min)

export interface EventInfo {
    id: string;
    name: string;
    startedAt: string; // ISO timestamp
    endedAt?: string;  // ISO timestamp
    participants?: string[]; // user IDs who joined (#6)
}

// Cache for current event info
let cachedCurrentEvent: EventInfo | null | undefined = undefined;
let eventInfoCacheTimestamp = 0;
const EVENT_INFO_CACHE_TTL_MS = 30_000; // 30 seconds (was 1 min)

export const EventModeService = {
    /**
     * Check if the current user is the dev (Arav Krishnan).
     */
    isDevUser(email: string | undefined | null): boolean {
        return !!email && email.toLowerCase() === DEV_EMAIL.toLowerCase();
    },

    /**
     * Fetch current event mode state from the database.
     */
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
                console.error('Failed to fetch event mode:', error);
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

    /**
     * Get the current active event info (name, start time, participants).
     */
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

    /**
     * Get list of past completed events.
     */
    async getPastEvents(): Promise<EventInfo[]> {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'past_events')
                .single();

            if (error || !data?.value) return [];
            const events = Array.isArray(data.value) ? data.value : [];
            return events.slice(0, MAX_PAST_EVENTS); // #9 cap
        } catch (err) {
            console.error('Failed to fetch past events:', err);
            return [];
        }
    },

    /**
     * Start a new event with a name. Only callable by the dev user.
     * Enables event mode and stores event metadata.
     */
    async startEvent(name: string): Promise<{ success: boolean; error?: string }> {
        // First toggle event mode on
        const toggleResult = await this.setEventMode(true);
        if (!toggleResult.success) return toggleResult;

        try {
            const eventInfo: EventInfo = {
                id: Date.now().toString(),
                name: name.trim(),
                startedAt: new Date().toISOString(),
                participants: [], // #6 — start with empty participants
            };

            await supabase
                .from('app_settings')
                .upsert({ key: 'current_event', value: eventInfo });

            cachedCurrentEvent = eventInfo;
            eventInfoCacheTimestamp = Date.now();
        } catch (err) {
            console.error('Failed to save event info:', err);
        }

        return { success: true };
    },

    /**
     * End the current event. Archives it to past events.
     * Territories from the event coexist — normal conquering resumes for future activities. (#3)
     */
    async endEvent(): Promise<{ success: boolean; error?: string }> {
        // Capture current event data before ending
        let currentEvent: EventInfo | null = null;
        try {
            // Force fresh fetch to get latest participants
            this.clearCache();
            currentEvent = await this.getCurrentEvent();
        } catch (err) {
            console.error('Failed to get current event for archival:', err);
        }

        // Toggle event mode off (no heavy resolution — #3)
        const toggleResult = await this.setEventMode(false);
        if (!toggleResult.success) return toggleResult;

        // Clear joined state locally
        await this.leaveEvent();

        // Archive the event to past events
        try {
            if (currentEvent) {
                currentEvent.endedAt = new Date().toISOString();
                const pastEvents = await this.getPastEvents();
                pastEvents.unshift(currentEvent);
                // #9 — cap past events list
                const capped = pastEvents.slice(0, MAX_PAST_EVENTS);
                await supabase
                    .from('app_settings')
                    .upsert({ key: 'past_events', value: capped });
            }
            // Clear current event
            await supabase
                .from('app_settings')
                .upsert({ key: 'current_event', value: null });

            cachedCurrentEvent = null;
            eventInfoCacheTimestamp = Date.now();
        } catch (err) {
            console.error('Failed to archive event:', err);
        }

        return { success: true };
    },

    /**
     * Toggle event mode on or off. Only callable by the dev user.
     * No longer runs heavy client-side territory resolution on disable. (#3)
     */
    async setEventMode(enabled: boolean): Promise<{ success: boolean; error?: string }> {
        try {
            const { data, error } = await supabase.rpc('toggle_event_mode', {
                p_enabled: enabled,
            });

            if (error) {
                console.error('Failed to toggle event mode:', error);
                return { success: false, error: error.message };
            }

            // Update cache immediately
            cachedEventMode = enabled;
            cacheTimestamp = Date.now();

            return { success: true };
        } catch (err: any) {
            console.error('Event mode toggle error:', err);
            return { success: false, error: err?.message || 'Unknown error' };
        }
    },

    /**
     * Check if the current user has joined the active event.
     */
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
     * Join the current active event. Stores locally and registers on server. (#6)
     */
    async joinEvent(userId: string): Promise<boolean> {
        try {
            const currentEvent = await this.getCurrentEvent();
            if (!currentEvent) return false;

            // Store locally
            await AsyncStorage.setItem(EVENT_JOINED_KEY, currentEvent.id);

            // Register on server — add user ID to participants
            try {
                const participants = currentEvent.participants || [];
                if (!participants.includes(userId)) {
                    participants.push(userId);
                    const updated = { ...currentEvent, participants };
                    await supabase
                        .from('app_settings')
                        .upsert({ key: 'current_event', value: updated });
                    cachedCurrentEvent = updated;
                    eventInfoCacheTimestamp = Date.now();
                }
            } catch (err) {
                console.error('Failed to register participant on server:', err);
                // Still return true — local join succeeded
            }

            return true;
        } catch {
            return false;
        }
    },

    /**
     * Leave the current event. Removes locally and from server. (#6)
     */
    async leaveEvent(userId?: string): Promise<void> {
        try {
            await AsyncStorage.removeItem(EVENT_JOINED_KEY);

            // Remove from server if userId provided
            if (userId) {
                try {
                    const currentEvent = await this.getCurrentEvent();
                    if (currentEvent?.participants) {
                        const updated = {
                            ...currentEvent,
                            participants: currentEvent.participants.filter(id => id !== userId),
                        };
                        await supabase
                            .from('app_settings')
                            .upsert({ key: 'current_event', value: updated });
                        cachedCurrentEvent = updated;
                        eventInfoCacheTimestamp = Date.now();
                    }
                } catch (err) {
                    console.error('Failed to remove participant from server:', err);
                }
            }
        } catch { /* ignore */ }
    },

    /**
     * Check if the current user is in event mode (event is active AND user has joined).
     */
    async isUserInEventMode(): Promise<boolean> {
        const eventMode = await this.getEventMode();
        if (!eventMode) return false;
        return this.hasJoinedCurrentEvent();
    },

    /**
     * Invalidate all cached state. Call when starting/stopping tracking. (#4)
     */
    clearCache(): void {
        cachedEventMode = null;
        cacheTimestamp = 0;
        cachedCurrentEvent = undefined;
        eventInfoCacheTimestamp = 0;
    },
};
