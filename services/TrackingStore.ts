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
import { EventModeService } from './EventModeService';
import { getDistance } from 'geolib';

const STILLNESS_WINDOW_MS = 3000;
const STILLNESS_THRESHOLD_M = 3;
const MIN_POINT_DISTANCE_M = 3;
const MAX_ACCURACY_METERS = 30;
const MAX_SEGMENT_DISTANCE_M = 500;

// Max plausible speed (m/s) for outlier rejection between consecutive points
const MAX_IMPLIED_SPEED: Record<ActivityType, number> = {
    WALK: 4,      // ~14 km/h (generous for GPS noise on fast walkers)
    RUN: 10,      // ~36 km/h
    RIDE: 22,     // ~79 km/h
};

// Expected speed (m/s) for Kalman process noise scaling
const EXPECTED_SPEED: Record<ActivityType, number> = {
    WALK: 1.5,
    RUN: 3.5,
    RIDE: 7,
};

// ── Simple 1D Kalman filter for lat/lng smoothing ───────────────────────────
// Converts GPS accuracy (meters) into a variance in "degrees squared" so the
// filter naturally trusts higher-accuracy readings more.
const METERS_PER_DEGREE = 111_000;

interface KalmanState {
    x: number;   // current estimate (degrees)
    p: number;   // error covariance (degrees²)
}

function kalmanInit(measurement: number, accuracyMeters: number): KalmanState {
    const sigma = accuracyMeters / METERS_PER_DEGREE;
    return { x: measurement, p: sigma * sigma };
}

function kalmanStep(
    state: KalmanState,
    measurement: number,
    accuracyMeters: number,
    processNoiseDeg2: number
): KalmanState {
    // Predict: increase uncertainty by process noise
    const pPredicted = state.p + processNoiseDeg2;
    // Measurement noise from GPS accuracy
    const sigma = accuracyMeters / METERS_PER_DEGREE;
    const r = sigma * sigma;
    // Update
    const k = pPredicted / (pPredicted + r);
    return {
        x: state.x + k * (measurement - state.x),
        p: (1 - k) * pPredicted,
    };
}

// ── Module-level state — survives component unmounts ────────────────────────
let _isTracking = false;
let _activityType: ActivityType | null = null;
let _startTime: number | null = null;
let _path: GPSPoint[] = [];
let _runningDistance = 0;
let _recentPositions: { lat: number; lng: number; time: number }[] = [];
let _locationUnsubscribe: (() => void) | null = null;
let _listeners: Set<() => void> = new Set();

// Rolling speed for real-time pace display (distance over last N seconds)
const ROLLING_SPEED_WINDOW_MS = 12000; // 12 second rolling window
let _rollingSpeedPoints: { dist: number; time: number }[] = [];
let _rollingSpeed = 0;

// Kalman state
let _kLat: KalmanState | null = null;
let _kLng: KalmanState | null = null;
let _lastPointTimestamp = 0;

function notifyListeners() {
    for (const fn of _listeners) {
        try { fn(); } catch {}
    }
}

function handleTrackingPoint(point: GPSPoint) {
    if (!_isTracking || !_activityType) return;

    // ── 1. Hard accuracy gate ───────────────────────────────────────────
    if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_METERS) return;
    const accuracy = point.accuracy ?? 10; // default assumption when unknown

    // ── 2. Speed validation — actually reject overspeed points ──────────
    if (point.speed !== null) {
        const validation = GameEngine.validateSpeed(point, _activityType);
        if (!validation.valid) return;
    }

    // ── 3. Outlier rejection: implied speed between consecutive points ──
    if (_path.length > 0) {
        const last = _path[_path.length - 1];
        const timeDelta = (point.timestamp - last.timestamp) / 1000;
        if (timeDelta > 0) {
            try {
                const d = getDistance(
                    { latitude: last.lat, longitude: last.lng },
                    { latitude: point.lat, longitude: point.lng }
                );
                const impliedSpeed = d / timeDelta;
                const maxSpeed = MAX_IMPLIED_SPEED[_activityType] || 15;
                if (impliedSpeed > maxSpeed) return; // GPS spike, discard
            } catch { /* allow on error */ }
        }
    }

    // ── 4. Kalman smoothing ─────────────────────────────────────────────
    const now = point.timestamp || Date.now();
    const dt = _lastPointTimestamp > 0
        ? Math.max(0.1, (now - _lastPointTimestamp) / 1000)
        : 1;

    // Process noise: how much we expect position to move per second (degrees²/s)
    const speedMs = EXPECTED_SPEED[_activityType] || 2;
    const processSigma = (speedMs / METERS_PER_DEGREE) * Math.sqrt(dt);
    const processNoise = processSigma * processSigma;

    let smoothedLat: number;
    let smoothedLng: number;

    if (_kLat === null || _kLng === null) {
        _kLat = kalmanInit(point.lat, accuracy);
        _kLng = kalmanInit(point.lng, accuracy);
        smoothedLat = point.lat;
        smoothedLng = point.lng;
    } else {
        _kLat = kalmanStep(_kLat, point.lat, accuracy, processNoise);
        _kLng = kalmanStep(_kLng, point.lng, accuracy, processNoise);
        smoothedLat = _kLat.x;
        smoothedLng = _kLng.x;
    }

    _lastPointTimestamp = now;

    const smoothedPoint: GPSPoint = {
        ...point,
        lat: smoothedLat,
        lng: smoothedLng,
    };

    // ── 5. Stillness detection ──────────────────────────────────────────
    const wallTime = Date.now();
    _recentPositions.push({ lat: smoothedLat, lng: smoothedLng, time: wallTime });
    _recentPositions = _recentPositions.filter(p => wallTime - p.time < STILLNESS_WINDOW_MS);

    if (point.speed !== null && point.speed >= 0.8) {
        // Clearly moving
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

    // ── 6. Minimum distance filter + distance accumulation ──────────────
    if (_path.length > 0) {
        const last = _path[_path.length - 1];
        try {
            const d = getDistance(
                { latitude: last.lat, longitude: last.lng },
                { latitude: smoothedPoint.lat, longitude: smoothedPoint.lng }
            );
            // Adaptive minimum distance: require larger gap when accuracy is poor
            const minDist = accuracy > 15
                ? Math.max(MIN_POINT_DISTANCE_M, accuracy * 0.4)
                : MIN_POINT_DISTANCE_M;
            if (d < minDist) return;
            if (d > 0 && d < MAX_SEGMENT_DISTANCE_M) {
                _runningDistance += d;

                // ── Update rolling speed for real-time pace ──
                const now = Date.now();
                _rollingSpeedPoints.push({ dist: d, time: now });
                // Prune old entries outside the window
                _rollingSpeedPoints = _rollingSpeedPoints.filter(
                    p => now - p.time < ROLLING_SPEED_WINDOW_MS
                );
                // Compute rolling speed: total distance in window / time span
                // Exclude the oldest point's distance — it was accumulated before the window start
                if (_rollingSpeedPoints.length >= 2) {
                    const windowDist = _rollingSpeedPoints.slice(1).reduce((s, p) => s + p.dist, 0);
                    const windowTime = (now - _rollingSpeedPoints[0].time) / 1000;
                    if (windowTime > 0 && windowDist > 0) {
                        _rollingSpeed = windowDist / windowTime;
                    }
                }
            }
        } catch { /* add point on error */ }
    }

    // ── 7. Compute speed for points missing device speed ──
    if (smoothedPoint.speed === null && _path.length > 0) {
        const last = _path[_path.length - 1];
        const timeDelta = (smoothedPoint.timestamp - last.timestamp) / 1000;
        if (timeDelta > 0) {
            try {
                const d = getDistance(
                    { latitude: last.lat, longitude: last.lng },
                    { latitude: smoothedPoint.lat, longitude: smoothedPoint.lng }
                );
                smoothedPoint.speed = d / timeDelta;
            } catch { /* leave as null */ }
        }
    }

    _path.push(smoothedPoint);
    notifyListeners();
}

function resetKalmanState() {
    _kLat = null;
    _kLng = null;
    _lastPointTimestamp = 0;
}

export const TrackingStore = {
    get isTracking() { return _isTracking; },
    get activityType() { return _activityType; },
    get startTime() { return _startTime; },
    get path() { return _path; },
    get runningDistance() { return _runningDistance; },
    /** Rolling speed (m/s) computed from distance covered in last ~12 seconds.
     *  Returns 0 if the most recent data point is older than the rolling window (stale). */
    get rollingSpeed() {
        if (_rollingSpeedPoints.length === 0) return 0;
        const newest = _rollingSpeedPoints[_rollingSpeedPoints.length - 1];
        if (Date.now() - newest.time > ROLLING_SPEED_WINDOW_MS) return 0;
        return _rollingSpeed;
    },

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
        _rollingSpeedPoints = [];
        _rollingSpeed = 0;
        resetKalmanState();

        // Force fresh event mode check at activity boundaries (#4)
        EventModeService.clearCache();

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
        _rollingSpeedPoints = [];
        _rollingSpeed = 0;
        resetKalmanState();

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
        _rollingSpeedPoints = [];
        _rollingSpeed = 0;
        resetKalmanState();

        if (_locationUnsubscribe) {
            _locationUnsubscribe();
            _locationUnsubscribe = null;
        }

        WakeLockService.release().catch(() => {});
        notifyListeners();
    },
};
