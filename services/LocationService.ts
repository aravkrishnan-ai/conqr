import * as Location from 'expo-location';
import { GPSPoint } from '../lib/types';

type LocationCallback = (point: GPSPoint) => void;
type ErrorCallback = (err: Error) => void;

interface TrackedCallback {
    onLocation: LocationCallback;
    onError?: ErrorCallback;
}

export const LocationService = {
    subscription: null as Location.LocationSubscription | null,
    callbacks: [] as TrackedCallback[],
    lastKnownLocation: null as GPSPoint | null,
    isStarting: false,
    startPromise: null as Promise<void> | null,

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

            this.subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 1000,
                    distanceInterval: 1,
                },
                (location) => {
                    try {
                        // Validate location data
                        if (!location?.coords ||
                            typeof location.coords.latitude !== 'number' ||
                            typeof location.coords.longitude !== 'number') {
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
        } catch (err: any) {
            console.error('Failed to start location tracking:', err);
            this.notifyError(err);
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

    emitMockLocation(point: GPSPoint) {
        this.lastKnownLocation = point;
        this.notifyListeners(point);
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
        this.lastKnownLocation = null;
    },

    /**
     * Get the last known location without starting tracking
     */
    getLastKnownLocation(): GPSPoint | null {
        return this.lastKnownLocation;
    }
};
