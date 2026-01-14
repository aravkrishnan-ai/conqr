import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, Territory, UserProfile, SuspiciousLog } from './types';

// Simple mock for Dexie since it doesn't work in React Native without complex setup
// In a real app, we'd use expo-sqlite or direct Supabase calls.
const createStore = <T extends { id: string | number }>(key: string) => ({
    get: async (id: string | number) => {
        const items = await AsyncStorage.getItem(key);
        const parsed = items ? JSON.parse(items) : [];
        return parsed.find((item: T) => item.id === id);
    },
    put: async (item: T) => {
        const items = await AsyncStorage.getItem(key);
        const parsed = items ? JSON.parse(items) : [];
        const index = parsed.findIndex((i: T) => i.id === item.id);
        if (index > -1) parsed[index] = item;
        else parsed.push(item);
        await AsyncStorage.setItem(key, JSON.stringify(parsed));
    },
    add: async (item: T) => {
        const items = await AsyncStorage.getItem(key);
        const parsed = items ? JSON.parse(items) : [];
        parsed.push(item);
        await AsyncStorage.setItem(key, JSON.stringify(parsed));
    },
    toArray: async () => {
        const items = await AsyncStorage.getItem(key);
        return items ? JSON.parse(items) : [];
    },
    update: async (id: string | number, updates: Partial<T>) => {
        const items = await AsyncStorage.getItem(key);
        const parsed = items ? JSON.parse(items) : [];
        const index = parsed.findIndex((i: T) => i.id === id);
        if (index > -1) {
            parsed[index] = { ...parsed[index], ...updates };
            await AsyncStorage.setItem(key, JSON.stringify(parsed));
        }
    },
    where: (field: string) => ({
        equals: (value: any) => ({
            first: async () => {
                const items = await AsyncStorage.getItem(key);
                const parsed = items ? JSON.parse(items) : [];
                return parsed.find((i: any) => i[field] === value);
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
