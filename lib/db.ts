import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, Territory, UserProfile } from './types';

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

// Queue-based lock to serialize writes per key.
// Each key gets a chain of promises; new operations append to the chain.
const queues: Record<string, Promise<unknown>> = {};
const withLock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = queues[key] ?? Promise.resolve();
    let resolve: (v: unknown) => void;
    queues[key] = new Promise(r => { resolve = r; });

    // Wait for previous operation on this key to finish (ignore its errors)
    await prev.catch(() => {});

    try {
        return await fn();
    } finally {
        resolve!(undefined);
    }
};

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
    /**
     * Upsert multiple items in a single lock acquisition + single AsyncStorage write.
     * Much more efficient than calling put() in a loop.
     */
    bulkPut: async (newItems: T[]): Promise<void> => {
        if (newItems.length === 0) return;
        await withLock(key, async () => {
            try {
                const items = await AsyncStorage.getItem(key);
                const parsed = safeJsonParse<T>(items);
                const idMap = new Map(parsed.map((item, idx) => [item.id, idx]));

                for (const item of newItems) {
                    const existingIdx = idMap.get(item.id);
                    if (existingIdx !== undefined) {
                        parsed[existingIdx] = item;
                    } else {
                        idMap.set(item.id, parsed.length);
                        parsed.push(item);
                    }
                }

                await AsyncStorage.setItem(key, JSON.stringify(parsed));
            } catch (err) {
                console.error(`db.${key}.bulkPut error:`, err);
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
};

export { db };
