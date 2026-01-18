import { Platform } from 'react-native';
import * as KeepAwake from 'expo-keep-awake';

export const WakeLockService = {
    wakeLock: null as any,
    isActive: false,

    async request() {
        if (this.isActive) return;

        try {
            if (Platform.OS === 'web') {
                // Web: Use Screen Wake Lock API
                if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
                    try {
                        this.wakeLock = await (navigator as any).wakeLock.request('screen');
                        this.isActive = true;
                        console.log('Wake Lock active (web)');
                        this.wakeLock.addEventListener('release', () => {
                            console.log('Wake Lock released (web)');
                            this.isActive = false;
                        });
                    } catch (err: any) {
                        console.error(`Wake Lock error: ${err?.name}, ${err?.message}`);
                    }
                }
            } else {
                // Native: Use expo-keep-awake
                try {
                    await KeepAwake.activateKeepAwakeAsync();
                    this.isActive = true;
                    console.log('Keep Awake active (native)');
                } catch (err: any) {
                    console.error('Keep Awake error:', err);
                }
            }
        } catch (err: any) {
            console.error('WakeLock request failed:', err);
        }
    },

    async release() {
        if (!this.isActive) return;

        try {
            if (Platform.OS === 'web') {
                if (this.wakeLock) {
                    await this.wakeLock.release();
                    this.wakeLock = null;
                }
            } else {
                try {
                    await KeepAwake.deactivateKeepAwake();
                } catch (err: any) {
                    console.error('Keep Awake release error:', err);
                }
            }
            this.isActive = false;
            console.log('Wake Lock released');
        } catch (err: any) {
            console.error('WakeLock release failed:', err);
            this.isActive = false;
        }
    }
};
