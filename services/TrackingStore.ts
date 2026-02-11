/**
 * Module-level tracking state that persists across RecordScreen mount/unmount cycles.
 * When the user navigates away from RecordScreen during an active activity,
 * this store keeps the location subscription alive and continues recording the path.
 * When RecordScreen remounts, it reads the accumulated state from here.
 */
import { GPSPoint, ActivityType } from '../lib/types';
import { LocationService } from './LocationService';
import { WakeLockService } from './WakeLockService';
import { GameEngine } from './GameEngine';
import { getDistance } from 'geolib';

const STILLNESS_WINDOW_MS = 3000;
const STILLNESS_THRESHOLD_M = 3;
const MIN_POINT_DISTANCE_M = 2;
const MAX_ACCURACY_METERS = 100;

// Module-level state — survives component unmounts
let _isTracking = false;
let _activityType: ActivityType | null = null;
let _startTime: number | null = null;
let _path: GPSPoint[] = [];
let _runningDistance = 0;
let _recentPositions: { lat: number; lng: number; time: number }[] = [];
let _locationUnsubscribe: (() => void) | null = null;
let _listeners: Set<() => void> = new Set();

function notifyListeners() {
    for (const fn of _listeners) {
        try { fn(); } catch {}
    }
}

function handleTrackingPoint(point: GPSPoint) {
    if (!_isTracking) return;

    // Accuracy filter
    if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_METERS) return;

    // Speed validation
    if (_activityType && point.speed !== null) {
        GameEngine.validateSpeed(point, _activityType);
    }

    // Stillness detection
    const now = Date.now();
    _recentPositions.push({ lat: point.lat, lng: point.lng, time: now });
    _recentPositions = _recentPositions.filter(p => now - p.time < STILLNESS_WINDOW_MS);

    if (point.speed !== null && point.speed >= 0.8) {
        // Moving — continue
    } else if (_recentPositions.length > 1) {
        const oldest = _recentPositions[0];
        let maxDisplacement = 0;
        for (const pos of _recentPositions) {
            try {
                const d = getDistance(
                    { latitude: oldest.lat, longitude: oldest.lng },
                    { latitude: pos.lat, longitude: pos.lng }
                );
                if (d > maxDisplacement) maxDisplacement = d;
            } catch { /* ignore */ }
        }
        if (maxDisplacement < STILLNESS_THRESHOLD_M) {
            if (point.speed === null || point.speed < 0.3) return;
        }
    }

    // Minimum distance filter + distance accumulation
    if (_path.length > 0) {
        const last = _path[_path.length - 1];
        try {
            const d = getDistance(
                { latitude: last.lat, longitude: last.lng },
                { latitude: point.lat, longitude: point.lng }
            );
            if (d < MIN_POINT_DISTANCE_M) return;
            if (d > 0 && d < 1000) {
                _runningDistance += d;
            }
        } catch { /* add point on error */ }
    }

    _path = [..._path, point];
    notifyListeners();
}

export const TrackingStore = {
    get isTracking() { return _isTracking; },
    get activityType() { return _activityType; },
    get startTime() { return _startTime; },
    get path() { return _path; },
    get runningDistance() { return _runningDistance; },

    /** Subscribe to state changes. Returns unsubscribe function. */
    subscribe(listener: () => void): () => void {
        _listeners.add(listener);
        return () => { _listeners.delete(listener); };
    },

    /** Start a new tracking session. Creates its own location subscription. */
    async start(type: ActivityType): Promise<void> {
        _isTracking = true;
        _activityType = type;
        _startTime = Date.now();
        _path = [];
        _runningDistance = 0;
        _recentPositions = [];

        WakeLockService.request().catch(() => {});

        // Start a dedicated location subscription for path recording
        if (!_locationUnsubscribe) {
            _locationUnsubscribe = await LocationService.startTracking(
                handleTrackingPoint,
                (error) => console.error('Tracking location error:', error?.message)
            );
        }

        notifyListeners();
    },

    /** Stop tracking and return the final accumulated state. */
    stop(): { path: GPSPoint[]; activityType: ActivityType | null; startTime: number | null; runningDistance: number } {
        const result = {
            path: [..._path],
            activityType: _activityType,
            startTime: _startTime,
            runningDistance: _runningDistance,
        };

        _isTracking = false;
        _activityType = null;
        _startTime = null;
        _path = [];
        _runningDistance = 0;
        _recentPositions = [];

        // Clean up the tracking location subscription
        if (_locationUnsubscribe) {
            _locationUnsubscribe();
            _locationUnsubscribe = null;
        }

        WakeLockService.release().catch(() => {});
        notifyListeners();
        return result;
    },

    /** Hard reset without returning state (e.g. on error). */
    reset(): void {
        _isTracking = false;
        _activityType = null;
        _startTime = null;
        _path = [];
        _runningDistance = 0;
        _recentPositions = [];

        if (_locationUnsubscribe) {
            _locationUnsubscribe();
            _locationUnsubscribe = null;
        }

        WakeLockService.release().catch(() => {});
        notifyListeners();
    },
};
