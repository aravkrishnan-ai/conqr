import { supabase } from '../lib/supabase';
import { GameEngine } from './GameEngine';
import { Territory } from '../lib/types';

const DEV_EMAIL = 'arav_krishnan@ug29.mesaschool.co';

// Cache event mode to avoid repeated DB calls within the same session
let cachedEventMode: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 300_000; // 5 minutes

export const EventModeService = {
    /**
     * Check if the current user is the dev (Arav Krishnan).
     */
    isDevUser(email: string | undefined | null): boolean {
        return !!email && email.toLowerCase() === DEV_EMAIL.toLowerCase();
    },

    /**
     * Fetch current event mode state from the database.
     * Uses a short-lived cache to avoid hammering the DB.
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
     * Toggle event mode on or off. Only callable by the dev user.
     * When disabling, resolves overlapping territories client-side.
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

            // If disabling event mode, resolve overlapping territories
            if (!enabled) {
                await this.resolveEventEnd();
            }

            return { success: true };
        } catch (err: any) {
            console.error('Event mode toggle error:', err);
            return { success: false, error: err?.message || 'Unknown error' };
        }
    },

    /**
     * Resolve overlapping territories after event mode ends.
     * Processes all territories chronologically, letting the most recent
     * claimant win any overlapping area via the existing conquering logic.
     */
    async resolveEventEnd(): Promise<void> {
        try {
            // Lazy import to avoid circular dependency with TerritoryService
            const { TerritoryService } = require('./TerritoryService');
            const allTerritories = await TerritoryService.getAllTerritories();
            if (allTerritories.length < 2) return;

            // Sort by claimedAt ascending so newer territories conquer older ones
            const sorted = [...allTerritories].sort((a, b) => a.claimedAt - b.claimedAt);

            // Process each territory against all previously-processed ones
            const resolved: Territory[] = [];
            const toDelete: string[] = [];
            const toUpdate: Territory[] = [];

            for (const territory of sorted) {
                if (toDelete.includes(territory.id)) continue;

                // Resolve this territory against all already-resolved ones
                const result = GameEngine.resolveOverlaps(territory, resolved);

                // Apply modifications to previously-resolved territories
                for (const mod of result.modifiedTerritories) {
                    const idx = resolved.findIndex(t => t.id === mod.id);
                    if (idx >= 0) {
                        resolved[idx] = mod;
                        toUpdate.push(mod);
                    }
                }

                // Track deletions
                for (const delId of result.deletedTerritoryIds) {
                    const idx = resolved.findIndex(t => t.id === delId);
                    if (idx >= 0) resolved.splice(idx, 1);
                    toDelete.push(delId);
                }

                resolved.push(territory);
            }

            // Persist changes to the database
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            // Delete fully consumed territories
            for (const delId of toDelete) {
                await TerritoryService.deleteTerritory(delId);
            }

            // Update modified territories
            for (const mod of toUpdate) {
                await TerritoryService.saveTerritory(mod);
            }

            console.log(`Event end resolution: ${toDelete.length} deleted, ${toUpdate.length} modified`);
        } catch (err) {
            console.error('Failed to resolve event end territories:', err);
        }
    },

    /**
     * Invalidate the cached event mode state.
     */
    clearCache(): void {
        cachedEventMode = null;
        cacheTimestamp = 0;
    },
};
