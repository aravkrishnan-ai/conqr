import { Territory } from '../lib/types';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

export const TerritoryService = {
    async saveTerritory(territory: Territory): Promise<Territory> {
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
                const cloudTerritories: Territory[] = data.map((t: any) => ({
                    id: t.id,
                    name: t.name || '',
                    ownerId: t.owner_id,
                    activityId: t.activity_id,
                    claimedAt: new Date(t.claimed_at).getTime(),
                    area: t.area,
                    perimeter: 0,
                    center: typeof t.center === 'string' ? JSON.parse(t.center) : t.center,
                    polygon: typeof t.polygon === 'string' ? JSON.parse(t.polygon) : t.polygon,
                    history: []
                }));

                for (const territory of cloudTerritories) {
                    await db.territories.put(territory);
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
                return data.map((t: any) => ({
                    id: t.id,
                    name: t.name || '',
                    ownerId: t.owner_id,
                    activityId: t.activity_id,
                    claimedAt: new Date(t.claimed_at).getTime(),
                    area: t.area,
                    perimeter: 0,
                    center: typeof t.center === 'string' ? JSON.parse(t.center) : t.center,
                    polygon: typeof t.polygon === 'string' ? JSON.parse(t.polygon) : t.polygon,
                    history: []
                }));
            }

            return localTerritories;
        } catch (err) {
            console.error('All territories fetch error:', err);
            return localTerritories;
        }
    },

    async getTotalArea(userId: string): Promise<number> {
        const territories = await this.getUserTerritories(userId);
        return territories.reduce((sum, t) => sum + t.area, 0);
    }
};
