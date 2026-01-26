import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, Territory, UserProfile, SuspiciousLog } from './types';

// Helper to safely parse JSON with error handling
const safeJsonParse = <T>(json: string | null, fallback: T[] = []): T[] => {
    if (!json) return fallback;
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
        console.error('Failed to parse stored data:', err);
        return fallback;
    }
};

// Lock mechanism to prevent race conditions during writes
const locks: Record<string, Promise<void>> = {};
const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    // Wait for any existing operation to complete
    while (locks[key]) {
        await locks[key];
    }

    let resolve: () => void;
    locks[key] = new Promise<void>(r => { resolve = r; });

    try {
        return await fn();
    } finally {
        delete locks[key];
        resolve!();
    }
};

// Simple mock for Dexie since it doesn't work in React Native without complex setup
// In a real app, we'd use expo-sqlite or direct Supabase calls.
const createStore = <T extends { id: string | number }>(key: string) => ({
    get: async (id: string | number): Promise<T | undefined> => {
        try {
            const items = await AsyncStorage.getItem(key);
            const parsed = safeJsonParse<T>(items);
            return parsed.find((item: T) => item.id === id);
        } catch (err) {
            console.error(`db.${key}.get error:`, err);
            return undefined;
        }
    },
    put: async (item: T): Promise<void> => {
        await withLock(key, async () => {
            try {
                const items = await AsyncStorage.getItem(key);
                const parsed = safeJsonParse<T>(items);
                const index = parsed.findIndex((i: T) => i.id === item.id);
                if (index > -1) parsed[index] = item;
                else parsed.push(item);
                await AsyncStorage.setItem(key, JSON.stringify(parsed));
            } catch (err) {
                console.error(`db.${key}.put error:`, err);
                throw err;
            }
        });
    },
    add: async (item: T): Promise<void> => {
        await withLock(key, async () => {
            try {
                const items = await AsyncStorage.getItem(key);
                const parsed = safeJsonParse<T>(items);
                parsed.push(item);
                await AsyncStorage.setItem(key, JSON.stringify(parsed));
            } catch (err) {
                console.error(`db.${key}.add error:`, err);
                throw err;
            }
        });
    },
    toArray: async (): Promise<T[]> => {
        try {
            const items = await AsyncStorage.getItem(key);
            return safeJsonParse<T>(items);
        } catch (err) {
            console.error(`db.${key}.toArray error:`, err);
            return [];
        }
    },
    update: async (id: string | number, updates: Partial<T>): Promise<void> => {
        await withLock(key, async () => {
            try {
                const items = await AsyncStorage.getItem(key);
                const parsed = safeJsonParse<T>(items);
                const index = parsed.findIndex((i: T) => i.id === id);
                if (index > -1) {
                    parsed[index] = { ...parsed[index], ...updates };
                    await AsyncStorage.setItem(key, JSON.stringify(parsed));
                }
            } catch (err) {
                console.error(`db.${key}.update error:`, err);
                throw err;
            }
        });
    },
    delete: async (id: string | number): Promise<void> => {
        await withLock(key, async () => {
            try {
                const items = await AsyncStorage.getItem(key);
                const parsed = safeJsonParse<T>(items);
                const filtered = parsed.filter((i: T) => i.id !== id);
                await AsyncStorage.setItem(key, JSON.stringify(filtered));
            } catch (err) {
                console.error(`db.${key}.delete error:`, err);
                throw err;
            }
        });
    },
    clear: async (): Promise<void> => {
        await withLock(key, async () => {
            try {
                await AsyncStorage.setItem(key, JSON.stringify([]));
            } catch (err) {
                console.error(`db.${key}.clear error:`, err);
                throw err;
            }
        });
    },
    where: (field: string) => ({
        equals: (value: any) => ({
            first: async (): Promise<T | undefined> => {
                try {
                    const items = await AsyncStorage.getItem(key);
                    const parsed = safeJsonParse<T>(items);
                    return parsed.find((i: any) => i[field] === value);
                } catch (err) {
                    console.error(`db.${key}.where.equals.first error:`, err);
                    return undefined;
                }
            }
        })
    })
});

const db = {
    users: createStore<UserProfile>('conqr_users'),
    activities: createStore<Activity>('conqr_activities'),
    territories: createStore<Territory>('conqr_territories'),
    gpsLogs: createStore<any>('conqr_gps_logs'),
    suspiciousLogs: createStore<SuspiciousLog>('conqr_suspicious_logs'),
};

export { db };
