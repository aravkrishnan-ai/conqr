import { Activity, GPSPoint } from '../lib/types';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { getDistance } from 'geolib';

export const ActivityService = {
    /**
     * Calculate total distance from a path of GPS points
     */
    calculateDistance(path: GPSPoint[]): number {
        if (path.length < 2) return 0;

        let totalDistance = 0;
        for (let i = 1; i < path.length; i++) {
            const prev = path[i - 1];
            const curr = path[i];
            const dist = getDistance(
                { latitude: prev.lat, longitude: prev.lng },
                { latitude: curr.lat, longitude: curr.lng }
            );
            totalDistance += dist;
        }
        return totalDistance;
    },

    /**
     * Calculate average speed from path (m/s)
     */
    calculateAverageSpeed(path: GPSPoint[]): number {
        if (path.length < 2) return 0;

        const validSpeeds = path
            .map(p => p.speed)
            .filter((s): s is number => s !== null && s !== undefined && s >= 0);

        if (validSpeeds.length === 0) return 0;
        return validSpeeds.reduce((sum, s) => sum + s, 0) / validSpeeds.length;
    },

    /**
     * Save an activity to local storage and sync to cloud
     */
    async saveActivity(activity: Activity): Promise<Activity> {
        // Save to local db first (offline-first)
        await db.activities.put(activity);
        console.log('Activity saved locally:', activity.id);

        // Sync to Supabase in background
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                console.log('No session, activity saved locally only');
                return activity;
            }

            const { error } = await supabase
                .from('activities')
                .upsert({
                    id: activity.id,
                    user_id: activity.userId,
                    type: activity.type,
                    start_time: new Date(activity.startTime).toISOString(),
                    end_time: activity.endTime ? new Date(activity.endTime).toISOString() : null,
                    distance: activity.distance,
                    duration: activity.duration,
                    polylines: JSON.stringify(activity.polylines),
                    is_synced: true,
                    territory_id: activity.territoryId || null
                });

            if (error) {
                console.error('Failed to sync activity to cloud:', error);
                // Mark as not synced in local db
                await db.activities.update(activity.id, { isSynced: false });
            } else {
                console.log('Activity synced to cloud:', activity.id);
                await db.activities.update(activity.id, { isSynced: true });
            }
        } catch (err) {
            console.error('Activity sync error:', err);
        }

        return activity;
    },

    /**
     * Get all activities for a user
     */
    async getUserActivities(userId: string): Promise<Activity[]> {
        // Get local activities first
        const allLocal = await db.activities.toArray();
        const localActivities = allLocal.filter((a: Activity) => a.userId === userId);

        try {
            const { data, error } = await supabase
                .from('activities')
                .select('*')
                .eq('user_id', userId)
                .order('start_time', { ascending: false });

            if (error) {
                console.error('Failed to fetch activities from cloud:', error);
                return localActivities;
            }

            if (data && data.length > 0) {
                const cloudActivities: Activity[] = data.map((a: any) => ({
                    id: a.id,
                    userId: a.user_id,
                    type: a.type,
                    startTime: new Date(a.start_time).getTime(),
                    endTime: a.end_time ? new Date(a.end_time).getTime() : undefined,
                    distance: a.distance,
                    duration: a.duration,
                    polylines: typeof a.polylines === 'string' ? JSON.parse(a.polylines) : a.polylines,
                    isSynced: true,
                    territoryId: a.territory_id
                }));

                // Merge and save to local db
                for (const activity of cloudActivities) {
                    await db.activities.put(activity);
                }

                return cloudActivities;
            }

            return localActivities;
        } catch (err) {
            console.error('Activities fetch error:', err);
            return localActivities;
        }
    },

    /**
     * Get activity statistics for a user
     */
    async getActivityStats(userId: string): Promise<{
        totalActivities: number;
        totalDistance: number;
        totalDuration: number;
        byType: { [key: string]: { count: number; distance: number; duration: number } };
    }> {
        const activities = await this.getUserActivities(userId);

        const stats = {
            totalActivities: activities.length,
            totalDistance: 0,
            totalDuration: 0,
            byType: {} as { [key: string]: { count: number; distance: number; duration: number } }
        };

        for (const activity of activities) {
            stats.totalDistance += activity.distance;
            stats.totalDuration += activity.duration;

            if (!stats.byType[activity.type]) {
                stats.byType[activity.type] = { count: 0, distance: 0, duration: 0 };
            }
            stats.byType[activity.type].count++;
            stats.byType[activity.type].distance += activity.distance;
            stats.byType[activity.type].duration += activity.duration;
        }

        return stats;
    },

    /**
     * Sync all unsynced activities to cloud
     */
    async syncPendingActivities(): Promise<number> {
        const allActivities = await db.activities.toArray();
        const unsynced = allActivities.filter((a: Activity) => !a.isSynced);

        let syncedCount = 0;
        for (const activity of unsynced) {
            try {
                const { error } = await supabase
                    .from('activities')
                    .upsert({
                        id: activity.id,
                        user_id: activity.userId,
                        type: activity.type,
                        start_time: new Date(activity.startTime).toISOString(),
                        end_time: activity.endTime ? new Date(activity.endTime).toISOString() : null,
                        distance: activity.distance,
                        duration: activity.duration,
                        polylines: JSON.stringify(activity.polylines),
                        is_synced: true,
                        territory_id: activity.territoryId || null
                    });

                if (!error) {
                    await db.activities.update(activity.id, { isSynced: true });
                    syncedCount++;
                }
            } catch (err) {
                console.error('Failed to sync activity:', activity.id, err);
            }
        }

        return syncedCount;
    }
};
