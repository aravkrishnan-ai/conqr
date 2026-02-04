import { Platform } from 'react-native';
import * as KeepAwake from 'expo-keep-awake';

export const WakeLockService = {
    wakeLock: null as any,
    isActive: false,
    releaseHandler: null as (() => void) | null,

    async request(): Promise<boolean> {
        if (this.isActive) return true;

        try {
            if (Platform.OS === 'web') {
                // Web: Use Screen Wake Lock API
                if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
                    try {
                        this.wakeLock = await (navigator as any).wakeLock.request('screen');
                        this.isActive = true;
                        console.log('Wake Lock active (web)');

                        // Create and store the release handler for cleanup
                        this.releaseHandler = () => {
                            console.log('Wake Lock released externally (web)');
                            this.isActive = false;
                            this.wakeLock = null;
                            this.releaseHandler = null;
                        };

                        this.wakeLock.addEventListener('release', this.releaseHandler);
                        return true;
                    } catch (err: any) {
                        // NotAllowedError happens when page is not visible
                        if (err?.name === 'NotAllowedError') {
                            console.log('Wake Lock not allowed (page not visible or not supported)');
                        } else {
                            console.error(`Wake Lock error: ${err?.name}, ${err?.message}`);
                        }
                        return false;
                    }
                } else {
                    console.log('Wake Lock API not supported in this browser');
                    return false;
                }
            } else {
                // Native: Use expo-keep-awake
                try {
                    await KeepAwake.activateKeepAwakeAsync();
                    this.isActive = true;
                    console.log('Keep Awake active (native)');
                    return true;
                } catch (err: any) {
                    console.error('Keep Awake error:', err);
                    return false;
                }
            }
        } catch (err: any) {
            console.error('WakeLock request failed:', err);
            return false;
        }
    },

    async release(): Promise<void> {
        if (!this.isActive && !this.wakeLock) return;

        try {
            if (Platform.OS === 'web') {
                if (this.wakeLock) {
                    // Remove event listener before releasing to avoid double-trigger
                    if (this.releaseHandler) {
                        try {
                            this.wakeLock.removeEventListener('release', this.releaseHandler);
                        } catch {
                            // Ignore errors removing listener
                        }
                        this.releaseHandler = null;
                    }

                    try {
                        await this.wakeLock.release();
                    } catch {
                        // Ignore errors if already released
                    }
                    this.wakeLock = null;
                }
            } else {
                try {
                    await KeepAwake.deactivateKeepAwake();
                } catch (err: any) {
                    // Ignore errors if not active
                    if (!err?.message?.includes('not active')) {
                        console.error('Keep Awake release error:', err);
                    }
                }
            }
            this.isActive = false;
            console.log('Wake Lock released');
        } catch (err: any) {
            console.error('WakeLock release failed:', err);
            this.isActive = false;
            this.wakeLock = null;
            this.releaseHandler = null;
        }
    },

    /**
     * Check if wake lock is currently active
     */
    isWakeLockActive(): boolean {
        return this.isActive;
    }
};
