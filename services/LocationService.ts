import * as Location from 'expo-location';
import { GPSPoint } from '../lib/types';

type LocationCallback = (point: GPSPoint) => void;

export const LocationService = {
    subscription: null as Location.LocationSubscription | null,
    callbacks: [] as LocationCallback[],

    async startTracking(onLocation: LocationCallback, onError?: (err: any) => void): Promise<() => void> {
        this.callbacks.push(onLocation);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            if (onError) onError(new Error('Location permission denied'));
            return () => { };
        }

        if (!this.subscription) {
            this.subscription = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.High,
                    timeInterval: 1000,
                    distanceInterval: 1,
                },
                (location) => {
                    const point: GPSPoint = {
                        lat: location.coords.latitude,
                        lng: location.coords.longitude,
                        timestamp: location.timestamp,
                        speed: location.coords.speed,
                        accuracy: location.coords.accuracy,
                        altitude: location.coords.altitude
                    };
                    this.notifyListeners(point);
                }
            );
        }

        return () => {
            this.callbacks = this.callbacks.filter(cb => cb !== onLocation);
            if (this.callbacks.length === 0 && this.subscription) {
                this.subscription.remove();
                this.subscription = null;
            }
        };
    },

    notifyListeners(point: GPSPoint) {
        this.callbacks.forEach(cb => cb(point));
    },

    emitMockLocation(point: GPSPoint) {
        this.notifyListeners(point);
    }
};
