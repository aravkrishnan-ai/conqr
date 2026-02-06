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

/**
 * Batch-fetch usernames for territories missing ownerName.
 * Sets a fallback display name if username can't be resolved.
 */
const resolveOwnerNames = async (territories: Territory[]): Promise<void> => {
    const missing = territories.filter(t => !t.ownerName && t.ownerId);
    if (missing.length === 0) return;

    const ownerIds = [...new Set(missing.map(t => t.ownerId))];
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, username')
            .in('id', ownerIds);

        if (error) {
            console.error('Error fetching owner usernames:', error);
        }

        const userMap = new Map<string, string>();
        if (users && users.length > 0) {
            for (const u of users) {
                if (u.username) {
                    userMap.set(u.id, u.username);
                }
            }
        }

        for (const territory of territories) {
            if (!territory.ownerName && territory.ownerId) {
                const username = userMap.get(territory.ownerId);
                // Always set a display name - use username if found, otherwise a short fallback
                territory.ownerName = username || ('User ' + territory.ownerId.substring(0, 6));
            }
        }
    } catch (err) {
        console.error('Failed to resolve owner usernames:', err);
        // Even on complete failure, set fallback names so labels still appear
        for (const territory of territories) {
            if (!territory.ownerName && territory.ownerId) {
                territory.ownerName = 'User ' + territory.ownerId.substring(0, 6);
            }
        }
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
                .select('*, users!owner_id(username)')
                .eq('owner_id', userId)
                .order('claimed_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch territories from cloud:', error);
                // Try to resolve names for local territories before returning
                if (userLocal.length > 0) {
                    await resolveOwnerNames(userLocal).catch(() => {});
                }
                return userLocal;
            }

            if (data && data.length > 0) {
                const cloudTerritories: Territory[] = data
                    .map((t: any) => {
                        const territory = mapCloudTerritory(t);
                        if (territory) {
                            // Try multiple paths to get the username from the join
                            const username = t.users?.username || t.user?.username;
                            if (username) {
                                territory.ownerName = username;
                            }
                        }
                        return territory;
                    })
                    .filter((t): t is Territory => t !== null);

                // Always resolve any missing owner names as fallback
                await resolveOwnerNames(cloudTerritories);

                // Cache cloud territories locally using a single bulk write
                try {
                    await db.territories.bulkPut(cloudTerritories);
                } catch (err) {
                    console.error('Failed to cache territories locally:', err);
                }

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
            // Fetch territories with owner usernames using v2 FK hint syntax
            const { data, error } = await supabase
                .from('territories')
                .select('*, users!owner_id(username)')
                .order('claimed_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('Failed to fetch all territories:', error);
                // Try to resolve names for local territories before returning
                if (localTerritories.length > 0) {
                    await resolveOwnerNames(localTerritories).catch(() => {});
                }
                return localTerritories;
            }

            if (data && data.length > 0) {
                const territories = data
                    .map((t: any) => {
                        const territory = mapCloudTerritory(t);
                        if (territory) {
                            // Try multiple paths to get the username from the join
                            const username = t.users?.username || t.user?.username;
                            if (username) {
                                territory.ownerName = username;
                            }
                        }
                        return territory;
                    })
                    .filter((t): t is Territory => t !== null);

                // Always resolve any missing owner names as fallback
                await resolveOwnerNames(territories);

                // Cache cloud territories with ownerName locally
                try {
                    await db.territories.bulkPut(territories);
                } catch (err) {
                    console.error('Failed to cache all territories locally:', err);
                }

                return territories;
            }

            // If no cloud data, try to resolve usernames for local territories too
            if (localTerritories.length > 0) {
                await resolveOwnerNames(localTerritories);
            }

            return localTerritories;
        } catch (err) {
            console.error('All territories fetch error:', err);
            // Try to resolve usernames for local territories on error
            if (localTerritories.length > 0) {
                await resolveOwnerNames(localTerritories).catch(() => {});
            }
            return localTerritories;
        }
    },

    async getTotalArea(userId: string): Promise<number> {
        const territories = await this.getUserTerritories(userId);
        return territories.reduce((sum, t) => sum + (t.area || 0), 0);
    },

    /**
     * Get leaderboard data: all territories with owner info for ranking.
     * Fetches up to 500 territories to build comprehensive leaderboard.
     */
    async getLeaderboardTerritories(): Promise<Territory[]> {
        try {
            const { data, error } = await supabase
                .from('territories')
                .select('id, owner_id, area, claimed_at, users!owner_id(username)')
                .order('claimed_at', { ascending: false })
                .limit(500);

            if (error || !data) {
                console.error('Failed to fetch leaderboard territories:', error);
                return [];
            }

            const territories: Territory[] = data
                .map((t: any) => {
                    const username = t.users?.username || t.user?.username;
                    return {
                        id: t.id,
                        name: '',
                        ownerId: t.owner_id,
                        ownerName: username || undefined,
                        activityId: '',
                        claimedAt: t.claimed_at ? new Date(t.claimed_at).getTime() : Date.now(),
                        area: typeof t.area === 'number' ? t.area : 0,
                        perimeter: 0,
                        center: { lat: 0, lng: 0 },
                        polygon: [],
                        history: []
                    } as Territory;
                })
                .filter((t: Territory) => t.area > 0);

            // Resolve any missing owner names
            await resolveOwnerNames(territories);

            return territories;
        } catch (err) {
            console.error('Leaderboard territories fetch error:', err);
            return [];
        }
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
