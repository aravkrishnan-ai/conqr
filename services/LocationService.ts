import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { GPSPoint } from '../lib/types';

type LocationCallback = (point: GPSPoint) => void;
type ErrorCallback = (err: Error) => void;

interface TrackedCallback {
    onLocation: LocationCallback;
    onError?: ErrorCallback;
}

const BACKGROUND_LOCATION_TASK = 'conqr-background-location';

// Register the background task at module level (required by expo-task-manager)
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) {
        console.error('[BackgroundLocation] Task error:', error);
        return;
    }
    if (data?.locations) {
        for (const location of data.locations) {
            try {
                if (!location?.coords ||
                    typeof location.coords.latitude !== 'number' ||
                    typeof location.coords.longitude !== 'number' ||
                    isNaN(location.coords.latitude) || isNaN(location.coords.longitude)) {
                    continue;
                }

                const point: GPSPoint = {
                    lat: location.coords.latitude,
                    lng: location.coords.longitude,
                    timestamp: location.timestamp || Date.now(),
                    speed: location.coords.speed ?? null,
                    accuracy: location.coords.accuracy ?? null,
                    altitude: location.coords.altitude ?? null,
                };

                LocationService.lastKnownLocation = point;
                LocationService.notifyListeners(point);
            } catch (err) {
                console.error('[BackgroundLocation] Error processing point:', err);
            }
        }
    }
});

export const LocationService = {
    subscription: null as Location.LocationSubscription | null,
    callbacks: [] as TrackedCallback[],
    lastKnownLocation: null as GPSPoint | null,
    isStarting: false,
    startPromise: null as Promise<void> | null,
    backgroundStarted: false,

    async startTracking(onLocation: LocationCallback, onError?: ErrorCallback): Promise<() => void> {
        const callbackEntry: TrackedCallback = { onLocation, onError };
        this.callbacks.push(callbackEntry);

        // If already starting, wait for that to complete
        if (this.startPromise) {
            await this.startPromise;
            // Send last known location to new subscriber
            if (this.lastKnownLocation) {
                try {
                    onLocation(this.lastKnownLocation);
                } catch (err) {
                    console.error('Error in location callback:', err);
                }
            }
            return this.createUnsubscribe(callbackEntry);
        }

        // If subscription already exists, just return unsubscribe
        if (this.subscription) {
            if (this.lastKnownLocation) {
                try {
                    onLocation(this.lastKnownLocation);
                } catch (err) {
                    console.error('Error in location callback:', err);
                }
            }
            return this.createUnsubscribe(callbackEntry);
        }

        // Start new subscription
        this.isStarting = true;
        this.startPromise = this.initializeTracking(onError);

        try {
            await this.startPromise;
        } finally {
            this.isStarting = false;
            this.startPromise = null;
        }

        return this.createUnsubscribe(callbackEntry);
    },

    async initializeTracking(onError?: ErrorCallback): Promise<void> {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                const error = new Error('Location permission denied');
                this.notifyError(error);
                return;
            }

            // Foreground subscription — high frequency while app is active
            this.subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 800,
                    distanceInterval: 1,
                },
                (location) => {
                    try {
                        if (!location?.coords ||
                            typeof location.coords.latitude !== 'number' ||
                            typeof location.coords.longitude !== 'number' ||
                            isNaN(location.coords.latitude) || isNaN(location.coords.longitude)) {
                            console.warn('Invalid location data received:', location);
                            return;
                        }

                        const point: GPSPoint = {
                            lat: location.coords.latitude,
                            lng: location.coords.longitude,
                            timestamp: location.timestamp || Date.now(),
                            speed: location.coords.speed ?? null,
                            accuracy: location.coords.accuracy ?? null,
                            altitude: location.coords.altitude ?? null
                        };

                        this.lastKnownLocation = point;
                        this.notifyListeners(point);
                    } catch (err) {
                        console.error('Error processing location:', err);
                    }
                }
            );

            // Background location — keeps tracking when app is backgrounded
            await this.startBackgroundTracking();
        } catch (err: any) {
            console.error('Failed to start location tracking:', err);
            this.notifyError(err);
        }
    },

    async startBackgroundTracking(): Promise<void> {
        try {
            // Request background permission (required on iOS; Android uses foreground service)
            const { status } = await Location.requestBackgroundPermissionsAsync();
            if (status !== 'granted') {
                console.warn('[BackgroundLocation] Background permission not granted');
                return;
            }

            // Check if already running
            const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
            if (isRunning) {
                this.backgroundStarted = true;
                return;
            }

            await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                accuracy: Location.Accuracy.High,
                timeInterval: 3000,
                distanceInterval: 5,
                foregroundService: {
                    notificationTitle: 'Conqr is tracking your activity',
                    notificationBody: 'Recording your route in the background',
                    notificationColor: '#E65100',
                },
                pausesUpdatesAutomatically: false,
                showsBackgroundLocationIndicator: true,
            });

            this.backgroundStarted = true;
            console.log('[BackgroundLocation] Started background location updates');
        } catch (err) {
            console.error('[BackgroundLocation] Failed to start:', err);
        }
    },

    async stopBackgroundTracking(): Promise<void> {
        if (!this.backgroundStarted) return;
        try {
            const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
            if (isRunning) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
            }
            this.backgroundStarted = false;
            console.log('[BackgroundLocation] Stopped background location updates');
        } catch (err) {
            console.error('[BackgroundLocation] Failed to stop:', err);
        }
    },

    createUnsubscribe(callbackEntry: TrackedCallback): () => void {
        return () => {
            this.callbacks = this.callbacks.filter(cb => cb !== callbackEntry);
            if (this.callbacks.length === 0 && this.subscription) {
                try {
                    this.subscription.remove();
                } catch (err) {
                    console.error('Error removing location subscription:', err);
                }
                this.subscription = null;
                this.stopBackgroundTracking();
            }
        };
    },

    notifyListeners(point: GPSPoint) {
        // Create a copy of callbacks to avoid issues if callbacks modify the array
        const callbacksCopy = [...this.callbacks];
        for (const { onLocation } of callbacksCopy) {
            try {
                onLocation(point);
            } catch (err) {
                console.error('Error in location callback:', err);
            }
        }
    },

    notifyError(error: Error) {
        const callbacksCopy = [...this.callbacks];
        for (const { onError } of callbacksCopy) {
            if (onError) {
                try {
                    onError(error);
                } catch (err) {
                    console.error('Error in error callback:', err);
                }
            }
        }
    },

    /**
     * Stop all tracking and clean up
     */
    stopAllTracking() {
        this.callbacks = [];
        if (this.subscription) {
            try {
                this.subscription.remove();
            } catch (err) {
                console.error('Error removing location subscription:', err);
            }
            this.subscription = null;
        }
        this.stopBackgroundTracking();
        this.lastKnownLocation = null;
    },

    /**
     * Get the last known location without starting tracking
     */
    getLastKnownLocation(): GPSPoint | null {
        return this.lastKnownLocation;
    }
};
