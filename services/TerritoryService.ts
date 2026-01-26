import { Territory } from '../lib/types';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

/**
 * Safely parse JSON data from cloud
 */
const safeParseJson = <T>(data: any, fallback: T): T => {
    if (!data) return fallback;
    if (typeof data === 'object') return data as T;
    if (typeof data === 'string') {
        try {
            return JSON.parse(data);
        } catch (err) {
            console.error('Failed to parse JSON:', err);
            return fallback;
        }
    }
    return fallback;
};

/**
 * Validate a territory object has required fields
 */
const isValidTerritory = (t: any): boolean => {
    return t &&
        typeof t.id === 'string' &&
        typeof t.ownerId === 'string' &&
        typeof t.area === 'number' &&
        t.center && typeof t.center.lat === 'number' && typeof t.center.lng === 'number' &&
        Array.isArray(t.polygon);
};

/**
 * Map cloud territory data to local format
 */
const mapCloudTerritory = (t: any): Territory | null => {
    try {
        const center = safeParseJson<{ lat: number; lng: number }>(t.center, { lat: 0, lng: 0 });
        const polygon = safeParseJson<[number, number][]>(t.polygon, []);

        const territory: Territory = {
            id: t.id,
            name: t.name || '',
            ownerId: t.owner_id,
            activityId: t.activity_id || '',
            claimedAt: t.claimed_at ? new Date(t.claimed_at).getTime() : Date.now(),
            area: typeof t.area === 'number' ? t.area : 0,
            perimeter: typeof t.perimeter === 'number' ? t.perimeter : 0,
            center,
            polygon,
            history: []
        };

        if (!isValidTerritory(territory)) {
            console.warn('Invalid territory data:', t.id);
            return null;
        }

        return territory;
    } catch (err) {
        console.error('Error mapping territory:', err);
        return null;
    }
};

export const TerritoryService = {
    async saveTerritory(territory: Territory): Promise<Territory> {
        // Validate territory before saving
        if (!isValidTerritory(territory)) {
            console.error('Invalid territory, cannot save:', territory.id);
            throw new Error('Invalid territory data');
        }

        await db.territories.put(territory);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                console.log('No session, territory saved locally only');
                return territory;
            }

            const { error } = await supabase
                .from('territories')
                .upsert({
                    id: territory.id,
                    owner_id: territory.ownerId,
                    activity_id: territory.activityId,
                    name: territory.name || null,
                    claimed_at: new Date(territory.claimedAt).toISOString(),
                    area: territory.area,
                    perimeter: territory.perimeter,
                    center: { lat: territory.center.lat, lng: territory.center.lng },
                    polygon: territory.polygon
                });

            if (error) {
                console.error('Failed to sync territory to cloud:', error);
            } else {
                console.log('Territory synced to cloud:', territory.id);
            }
        } catch (err) {
            console.error('Territory sync error:', err);
        }

        return territory;
    },

    async getUserTerritories(userId: string): Promise<Territory[]> {
        if (!userId) {
            console.warn('getUserTerritories called without userId');
            return [];
        }

        const localTerritories = await db.territories.toArray();
        const userLocal = localTerritories.filter((t: Territory) => t.ownerId === userId);

        try {
            const { data, error } = await supabase
                .from('territories')
                .select('*')
                .eq('owner_id', userId)
                .order('claimed_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch territories from cloud:', error);
                return userLocal;
            }

            if (data && data.length > 0) {
                const cloudTerritories: Territory[] = data
                    .map(mapCloudTerritory)
                    .filter((t): t is Territory => t !== null);

                // Cache to local db (fire and forget)
                Promise.all(cloudTerritories.map(t => db.territories.put(t)))
                    .catch(err => console.error('Failed to cache territories locally:', err));

                return cloudTerritories;
            }

            return userLocal;
        } catch (err) {
            console.error('Territory fetch error:', err);
            return userLocal;
        }
    },

    async getAllTerritories(): Promise<Territory[]> {
        const localTerritories = await db.territories.toArray();

        try {
            const { data, error } = await supabase
                .from('territories')
                .select('*')
                .order('claimed_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('Failed to fetch all territories:', error);
                return localTerritories;
            }

            if (data && data.length > 0) {
                return data
                    .map(mapCloudTerritory)
                    .filter((t): t is Territory => t !== null);
            }

            return localTerritories;
        } catch (err) {
            console.error('All territories fetch error:', err);
            return localTerritories;
        }
    },

    async getTotalArea(userId: string): Promise<number> {
        const territories = await this.getUserTerritories(userId);
        return territories.reduce((sum, t) => sum + (t.area || 0), 0);
    },

    async deleteTerritory(territoryId: string): Promise<boolean> {
        try {
            await db.territories.delete(territoryId);

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    await supabase
                        .from('territories')
                        .delete()
                        .eq('id', territoryId);
                }
            } catch (cloudErr) {
                console.error('Failed to delete territory from cloud:', cloudErr);
            }

            console.log('Territory deleted:', territoryId);
            return true;
        } catch (err) {
            console.error('Failed to delete territory:', err);
            return false;
        }
    }
};
