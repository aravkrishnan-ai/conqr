import { Activity, GPSPoint, ActivityType } from '../lib/types';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { getDistance } from 'geolib';

// Timeout helper for async operations
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Minimum requirements for a valid activity
const MIN_DISTANCE_METERS = 10; // Must move at least 10 meters
const MIN_DURATION_SECONDS = 5; // Must be at least 5 seconds
const MIN_GPS_POINTS = 2; // Must have at least 2 GPS points

export const ActivityService = {
    /**
     * Calculate total distance from a path of GPS points
     */
    calculateDistance(path: GPSPoint[]): number {
        if (!Array.isArray(path) || path.length < 2) return 0;

        let totalDistance = 0;
        let lastValid: GPSPoint | null = null;

        for (let i = 0; i < path.length; i++) {
            const point = path[i];

            // Validate coordinates exist and are real numbers (not NaN)
            if (!point ||
                typeof point.lat !== 'number' || typeof point.lng !== 'number' ||
                isNaN(point.lat) || isNaN(point.lng)) {
                continue;
            }

            if (lastValid) {
                try {
                    const dist = getDistance(
                        { latitude: lastValid.lat, longitude: lastValid.lng },
                        { latitude: point.lat, longitude: point.lng }
                    );
                    // Sanity check - skip unrealistic distances (> 1km in one segment = likely GPS error)
                    if (dist > 0 && dist < 1000) {
                        totalDistance += dist;
                    }
                } catch (err) {
                    console.error('Error calculating distance between points:', err);
                }
            }

            lastValid = point;
        }
        return totalDistance;
    },

    /**
     * Calculate average speed from path (m/s)
     */
    calculateAverageSpeed(path: GPSPoint[]): number {
        if (!Array.isArray(path) || path.length < 2) return 0;

        const validSpeeds = path
            .filter(p => p && typeof p.speed === 'number')
            .map(p => p.speed as number)
            .filter(s => s >= 0 && s < 100); // Filter out unrealistic speeds (> 100 m/s = 360 km/h)

        if (validSpeeds.length === 0) return 0;
        return validSpeeds.reduce((sum, s) => sum + s, 0) / validSpeeds.length;
    },

    /**
     * Calculate current pace (min/km) from speed (m/s)
     */
    calculatePace(speedMs: number): string {
        if (speedMs <= 0) return '--:--';
        const paceSecondsPerKm = 1000 / speedMs;
        const minutes = Math.floor(paceSecondsPerKm / 60);
        const seconds = Math.floor(paceSecondsPerKm % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },

    /**
     * Format duration as HH:MM:SS or MM:SS
     */
    formatDuration(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Validate if an activity meets minimum requirements
     */
    isValidActivity(activity: Partial<Activity>): boolean {
        // Check required fields exist
        if (!activity || !activity.id || !activity.userId) {
            console.log('Activity validation failed: missing required fields');
            return false;
        }

        const polylines = activity.polylines;
        const path = Array.isArray(polylines) && polylines.length > 0 ? polylines[0] : [];
        const distance = typeof activity.distance === 'number' ? activity.distance : 0;
        const duration = typeof activity.duration === 'number' ? activity.duration : 0;

        const isValid = (
            Array.isArray(path) &&
            path.length >= MIN_GPS_POINTS &&
            distance >= MIN_DISTANCE_METERS &&
            duration >= MIN_DURATION_SECONDS
        );

        if (!isValid) {
            console.log('Activity validation failed:', {
                pathLength: path.length,
                distance,
                duration,
                minPoints: MIN_GPS_POINTS,
                minDistance: MIN_DISTANCE_METERS,
                minDuration: MIN_DURATION_SECONDS
            });
        }

        return isValid;
    },

    /**
     * Estimate calories burned based on activity type, distance, and duration
     */
    estimateCalories(type: ActivityType, distanceMeters: number, durationSeconds: number): number {
        // Rough MET values: WALK=3.5, RUN=8, RIDE=6
        // Calories = MET * weight(kg) * time(hours)
        // Using average weight of 70kg
        const metValues: Record<ActivityType, number> = {
            'WALK': 3.5,
            'RUN': 8.0,
            'RIDE': 6.0
        };

        const met = metValues[type] || 3.5;
        const hours = durationSeconds / 3600;
        const weight = 70; // Average weight in kg

        return Math.round(met * weight * hours);
    },

    /**
     * Save an activity to local storage and sync to cloud
     * Returns null if activity doesn't meet minimum requirements
     */
    async saveActivity(activity: Activity): Promise<Activity | null> {
        const SAVE_TIMEOUT_MS = 10000; // 10 second timeout for save operations
        const SYNC_TIMEOUT_MS = 15000; // 15 second timeout for cloud sync

        // Validate activity meets minimum requirements
        if (!this.isValidActivity(activity)) {
            console.log('Activity does not meet minimum requirements, skipping save:', {
                id: activity.id,
                distance: activity.distance,
                duration: activity.duration,
                points: activity.polylines?.[0]?.length || 0
            });
            return null;
        }

        // Save to local db first (offline-first) with timeout
        try {
            await withTimeout(
                db.activities.put(activity),
                SAVE_TIMEOUT_MS,
                'Local save timed out'
            );
            console.log('Activity saved locally:', activity.id);
        } catch (localErr) {
            console.error('Failed to save activity locally:', localErr);
            // Return the activity anyway - don't block the UI
            // The activity data is still in memory, user can try again
            throw localErr; // Re-throw to signal save failed
        }

        // Sync to Supabase in background (non-blocking)
        // Use direct async IIFE instead of setTimeout for more reliable execution
        (async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const { data: { session } } = await withTimeout(
                    sessionPromise,
                    5000,
                    'Session check timed out'
                );

                if (!session?.user) {
                    console.log('No session, activity saved locally only');
                    return;
                }

                const syncOperation = async () => {
                    return await supabase
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
                            territory_id: activity.territoryId || null,
                            average_speed: activity.averageSpeed ?? null
                        });
                };

                const { error } = await withTimeout(
                    syncOperation(),
                    SYNC_TIMEOUT_MS,
                    'Cloud sync timed out'
                );

                if (error) {
                    console.error('Failed to sync activity to cloud:', error);
                    await db.activities.update(activity.id, { isSynced: false }).catch(() => {});
                } else {
                    console.log('Activity synced to cloud:', activity.id);
                    await db.activities.update(activity.id, { isSynced: true }).catch(() => {});
                }
            } catch (err) {
                console.error('Activity sync error:', err);
                await db.activities.update(activity.id, { isSynced: false }).catch(() => {});
            }
        })();

        return activity;
    },

    /**
     * Safely parse polylines from cloud data
     */
    _parsePolylines(polylines: any): GPSPoint[][] {
        if (!polylines) return [];
        if (Array.isArray(polylines)) return polylines;
        if (typeof polylines === 'string') {
            try {
                const parsed = JSON.parse(polylines);
                return Array.isArray(parsed) ? parsed : [];
            } catch (err) {
                console.error('Failed to parse polylines:', err);
                return [];
            }
        }
        return [];
    },

    /**
     * Get all activities for a user, sorted by start time (newest first)
     * For current user: merges local + cloud data
     * For other users: fetches directly from cloud (no local caching)
     */
    async getUserActivities(userId: string, isCurrentUser: boolean = true): Promise<Activity[]> {
        if (!userId) {
            console.warn('getUserActivities called without userId');
            return [];
        }

        // For other users, fetch directly from cloud without local storage
        if (!isCurrentUser) {
            try {
                let data: any[] | null = null;
                let error: any = null;

                // Try RPC function first (uses SECURITY DEFINER to bypass RLS)
                try {
                    const rpcResult = await supabase
                        .rpc('get_user_activities', { target_user_id: userId });
                    data = rpcResult.data;
                    error = rpcResult.error;
                } catch (rpcErr) {
                    console.log('RPC function not available, falling back to direct query');
                }

                // Fallback to direct query if RPC failed
                if (error || !data) {
                    const directResult = await supabase
                        .from('activities')
                        .select('*')
                        .eq('user_id', userId)
                        .order('start_time', { ascending: false });
                    data = directResult.data;
                    error = directResult.error;
                }

                if (error) {
                    console.error('Failed to fetch other user activities:', error);
                    return [];
                }

                if (data && data.length > 0) {
                    const activities = data.map((a: any) => ({
                        id: a.id,
                        userId: a.user_id,
                        type: a.type || 'WALK',
                        startTime: new Date(a.start_time).getTime(),
                        endTime: a.end_time ? new Date(a.end_time).getTime() : undefined,
                        distance: a.distance || 0,
                        duration: a.duration || 0,
                        polylines: this._parsePolylines(a.polylines),
                        isSynced: true,
                        territoryId: a.territory_id || undefined,
                        averageSpeed: a.average_speed || undefined
                    }));

                    // Cache other users' activities locally for detail view access
                    try {
                        await db.activities.bulkPut(activities);
                    } catch (err) {
                        console.error('Failed to cache other user activities:', err);
                    }

                    return activities;
                }

                return [];
            } catch (err) {
                console.error('Other user activities fetch error:', err);
                return [];
            }
        }

        // For current user: get local activities first
        const allLocal = await db.activities.toArray();
        let localActivities = allLocal.filter((a: Activity) => a.userId === userId);

        // Sort local activities by start time (newest first)
        localActivities.sort((a: Activity, b: Activity) => b.startTime - a.startTime);

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
                    type: a.type || 'WALK',
                    startTime: new Date(a.start_time).getTime(),
                    endTime: a.end_time ? new Date(a.end_time).getTime() : undefined,
                    distance: a.distance || 0,
                    duration: a.duration || 0,
                    polylines: this._parsePolylines(a.polylines),
                    isSynced: true,
                    territoryId: a.territory_id || undefined,
                    averageSpeed: a.average_speed || undefined
                }));

                // Cache cloud activities locally using a single bulk write
                try {
                    await db.activities.bulkPut(cloudActivities);
                } catch (err) {
                    console.error('Failed to cache cloud activities locally:', err);
                }

                // Merge local unsynced activities with cloud activities
                const cloudIds = new Set(cloudActivities.map(a => a.id));
                const unsyncedLocal = localActivities.filter((a: Activity) => !cloudIds.has(a.id));

                const merged = [...cloudActivities, ...unsyncedLocal];
                merged.sort((a, b) => b.startTime - a.startTime);

                return merged;
            }

            return localActivities;
        } catch (err) {
            console.error('Activities fetch error:', err);
            return localActivities;
        }
    },

    /**
     * Get activity statistics for a user
     * @param userId - The user ID
     * @param cachedActivities - Optional pre-fetched activities to avoid double-fetching
     */
    async getActivityStats(userId: string, cachedActivities?: Activity[]): Promise<{
        totalActivities: number;
        totalDistance: number;
        totalDuration: number;
        byType: { [key: string]: { count: number; distance: number; duration: number } };
    }> {
        const activities = cachedActivities || await this.getUserActivities(userId);

        const stats = {
            totalActivities: activities.length,
            totalDistance: 0,
            totalDuration: 0,
            byType: {} as { [key: string]: { count: number; distance: number; duration: number } }
        };

        for (const activity of activities) {
            stats.totalDistance += activity.distance || 0;
            stats.totalDuration += activity.duration || 0;

            const activityType = activity.type || 'WALK';
            if (!stats.byType[activityType]) {
                stats.byType[activityType] = { count: 0, distance: 0, duration: 0 };
            }
            stats.byType[activityType].count++;
            stats.byType[activityType].distance += activity.distance || 0;
            stats.byType[activityType].duration += activity.duration || 0;
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
                        territory_id: activity.territoryId || null,
                        average_speed: activity.averageSpeed ?? null
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
    },

    /**
     * Delete an activity by ID
     */
    async deleteActivity(activityId: string): Promise<boolean> {
        try {
            // Use the db.delete method instead of manual filtering
            await db.activities.delete(activityId);

            // Also delete from Supabase
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    await supabase
                        .from('activities')
                        .delete()
                        .eq('id', activityId);
                }
            } catch (cloudErr) {
                console.error('Failed to delete activity from cloud:', cloudErr);
                // Don't fail the whole operation if cloud delete fails
            }

            console.log('Activity deleted:', activityId);
            return true;
        } catch (err) {
            console.error('Failed to delete activity:', err);
            return false;
        }
    },

    /**
     * Flatten polyline segments into a single array of GPS points
     */
    flattenPolylines(polylines: GPSPoint[][]): GPSPoint[] {
        if (!polylines || !Array.isArray(polylines)) return [];
        return polylines.reduce((acc: GPSPoint[], segment) => {
            if (Array.isArray(segment)) {
                return [...acc, ...segment];
            }
            return acc;
        }, []);
    },

    /**
     * Calculate bounding box for a set of GPS points
     * Returns null if no valid points exist
     */
    calculateRouteBounds(points: GPSPoint[]): { southWest: [number, number]; northEast: [number, number] } | null {
        if (!points || !Array.isArray(points) || points.length === 0) return null;

        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        let validCount = 0;

        for (const p of points) {
            if (!p || isNaN(p.lat) || isNaN(p.lng)) continue;
            if (p.lat < minLat) minLat = p.lat;
            if (p.lat > maxLat) maxLat = p.lat;
            if (p.lng < minLng) minLng = p.lng;
            if (p.lng > maxLng) maxLng = p.lng;
            validCount++;
        }

        if (validCount === 0 || !isFinite(minLat)) return null;

        return {
            southWest: [minLat, minLng],
            northEast: [maxLat, maxLng],
        };
    },

    /**
     * Get a single activity by ID
     * Checks local db first, falls back to cloud query
     */
    async getActivity(activityId: string): Promise<Activity | null> {
        try {
            // Check local db first
            const activity = await db.activities.get(activityId);
            if (activity) {
                // Ensure polylines are properly parsed (belt and suspenders)
                activity.polylines = this._parsePolylines(activity.polylines);
                return activity;
            }

            // Fallback to cloud query (needed for viewing other users' activity details)
            try {
                const { data, error } = await supabase
                    .from('activities')
                    .select('*')
                    .eq('id', activityId)
                    .single();

                if (error || !data) return null;

                const cloudActivity: Activity = {
                    id: data.id,
                    userId: data.user_id,
                    type: data.type || 'WALK',
                    startTime: new Date(data.start_time).getTime(),
                    endTime: data.end_time ? new Date(data.end_time).getTime() : undefined,
                    distance: data.distance || 0,
                    duration: data.duration || 0,
                    polylines: this._parsePolylines(data.polylines),
                    isSynced: true,
                    territoryId: data.territory_id || undefined,
                    averageSpeed: data.average_speed || undefined
                };

                // Cache locally for future access
                await db.activities.put(cloudActivity).catch(() => {});
                return cloudActivity;
            } catch {
                return null;
            }
        } catch (err) {
            console.error('Failed to get activity:', err);
            return null;
        }
    }
};
