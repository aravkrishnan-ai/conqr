import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Crosshair, Play, Square, Footprints, Bike, PersonStanding, MapPinOff } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { LocationService } from '../services/LocationService';
import { GameEngine } from '../services/GameEngine';
import { WakeLockService } from '../services/WakeLockService';
import { TerritoryService } from '../services/TerritoryService';
import { ActivityService } from '../services/ActivityService';
import { GPSPoint, ActivityType, Territory, Activity } from '../lib/types';
import MapContainer, { MapContainerHandle } from '../components/MapContainer';
import { supabase } from '../lib/supabase';
import { getDistance } from 'geolib';
import { v4 as uuidv4 } from 'uuid';

export default function GameScreen() {
    const navigation = useNavigation<any>();
    const [location, setLocation] = React.useState<GPSPoint | null>(null);
    const [path, setPath] = React.useState<GPSPoint[]>([]);
    const [isTracking, setIsTracking] = React.useState(false);
    const [showActivityPicker, setShowActivityPicker] = React.useState(false);
    const [activityType, setActivityType] = React.useState<ActivityType | null>(null);
    const [locationError, setLocationError] = React.useState<string | null>(null);
    const [savedTerritories, setSavedTerritories] = React.useState<Territory[]>([]);
    const [totalArea, setTotalArea] = React.useState(0);
    const [trackingStartTime, setTrackingStartTime] = React.useState<number | null>(null);
    const [currentDistance, setCurrentDistance] = React.useState(0);
    const [elapsedTime, setElapsedTime] = React.useState(0);
    const [currentSpeed, setCurrentSpeed] = React.useState(0);
    const [isSaving, setIsSaving] = React.useState(false);

    const mapRef = React.useRef<MapContainerHandle>(null);
    const isTrackingRef = React.useRef(false);
    const pathRef = React.useRef<GPSPoint[]>([]);
    const activityTypeRef = React.useRef<ActivityType | null>(null);
    const startTimeRef = React.useRef<number | null>(null);
    const timerRef = React.useRef<NodeJS.Timeout | null>(null);
    const runningDistanceRef = React.useRef(0);
    // GPS jitter filter - track recent positions to detect if user is stationary
    const recentPositionsRef = React.useRef<{ lat: number; lng: number; time: number }[]>([]);
    const STILLNESS_WINDOW_MS = 3000; // 3 seconds window (reduced from 5)
    const STILLNESS_THRESHOLD_M = 3; // Must move at least 3 meters in window to be moving (reduced from 8)
    const MIN_POINT_DISTANCE_M = 2; // Minimum distance between recorded points (reduced from 3)

    isTrackingRef.current = isTracking;
    pathRef.current = path;
    activityTypeRef.current = activityType;
    startTimeRef.current = trackingStartTime;

    // Recording pulse animation
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isTracking) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.4,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 800,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isTracking, pulseAnim]);

    React.useEffect(() => {
        const loadTerritories = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const territories = await TerritoryService.getUserTerritories(session.user.id);
                    setSavedTerritories(territories);
                    const total = territories.reduce((sum, t) => sum + t.area, 0);
                    setTotalArea(total);
                    console.log(`Loaded ${territories.length} territories, total area: ${total}m²`);
                }
            } catch (err) {
                console.error('Failed to load territories:', err);
            }
        };
        loadTerritories();
    }, []);

    React.useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let mounted = true;

        const start = async () => {
            console.log('Starting location tracking...');
            try {
                unsubscribe = await LocationService.startTracking(
                    (point) => {
                        if (!mounted) return;
                        setLocationError(null);
                        setLocation(point); // Always update visible location marker

                        if (!isTrackingRef.current) return;

                        // Step 5: Skip low-accuracy points from tracking path
                        const MAX_ACCURACY_METERS = 50;
                        if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_METERS) {
                            console.log('Skipping low-accuracy point:', point.accuracy, 'm');
                            return;
                        }

                        // Step 7: Advisory speed validation
                        if (activityTypeRef.current && point.speed !== null) {
                            const speedCheck = GameEngine.validateSpeed(point, activityTypeRef.current);
                            if (!speedCheck.valid) {
                                console.warn('Speed anomaly:', speedCheck.reason,
                                    `(${point.speed?.toFixed(1)} m/s for ${activityTypeRef.current})`);
                            }
                        }

                        // GPS Jitter/Stillness Detection
                        const now = Date.now();
                        const currentPos = { lat: point.lat, lng: point.lng, time: now };

                        // Add to recent positions and clean up old entries
                        recentPositionsRef.current.push(currentPos);
                        recentPositionsRef.current = recentPositionsRef.current.filter(
                            p => now - p.time < STILLNESS_WINDOW_MS
                        );

                        // If speed is reported and reasonably high, always record the point
                        // (speeds above 0.8 m/s = ~2.9 km/h indicate definite movement)
                        if (point.speed !== null && point.speed >= 0.8) {
                            // User is definitely moving, skip stillness check
                        } else if (recentPositionsRef.current.length > 1) {
                            // Check if user is actually moving by looking at max displacement in window
                            const oldest = recentPositionsRef.current[0];
                            let maxDisplacement = 0;
                            for (const pos of recentPositionsRef.current) {
                                try {
                                    const d = getDistance(
                                        { latitude: oldest.lat, longitude: oldest.lng },
                                        { latitude: pos.lat, longitude: pos.lng }
                                    );
                                    if (d > maxDisplacement) maxDisplacement = d;
                                } catch { /* ignore */ }
                            }

                            // If user hasn't moved much in the window AND has low/no speed, they're stationary
                            if (maxDisplacement < STILLNESS_THRESHOLD_M) {
                                // Low displacement - check speed as secondary indicator
                                if (point.speed === null || point.speed < 0.3) {
                                    // User is likely standing still, skip this point
                                    return;
                                }
                            }
                        }

                        setPath(prev => {
                            // Skip if too close to last recorded point (GPS jitter filter)
                            if (prev.length > 0) {
                                const last = prev[prev.length - 1];
                                try {
                                    const d = getDistance(
                                        { latitude: last.lat, longitude: last.lng },
                                        { latitude: point.lat, longitude: point.lng }
                                    );
                                    if (d < MIN_POINT_DISTANCE_M) {
                                        // Point too close, skip but don't log to reduce noise
                                        return prev;
                                    }
                                } catch { /* add point on error */ }
                            }

                            const newPath = [...prev, point];

                            // Log path growth for debugging (every 5 points to reduce noise)
                            if (newPath.length % 5 === 1 || newPath.length <= 3) {
                                console.log(`Tracking: ${newPath.length} points, speed: ${point.speed?.toFixed(1) ?? 'N/A'} m/s`);
                            }

                            try {
                                // Incremental distance calculation
                                if (prev.length > 0) {
                                    const lastPoint = prev[prev.length - 1];
                                    const segDist = getDistance(
                                        { latitude: lastPoint.lat, longitude: lastPoint.lng },
                                        { latitude: point.lat, longitude: point.lng }
                                    );
                                    if (segDist > 0 && segDist < 1000) {
                                        runningDistanceRef.current += segDist;
                                    }
                                }
                                setCurrentDistance(runningDistanceRef.current);

                            } catch (calcErr) {
                                console.error('Calculation error:', calcErr);
                            }
                            return newPath;
                        });
                    },
                    (error) => {
                        if (!mounted) return;
                        console.error('Location error:', error);
                        setLocationError(error?.message || 'Location access denied');
                    }
                );
                console.log('Location tracking started successfully');
            } catch (err: any) {
                console.error('Failed to start tracking:', err?.message || err);
                if (mounted) {
                    setLocationError('Failed to start location tracking');
                }
            }
        };

        start();

        return () => {
            mounted = false;
            if (unsubscribe) {
                try {
                    unsubscribe();
                } catch (err) {
                    console.error('Error unsubscribing:', err);
                }
            }
            try {
                WakeLockService.release();
            } catch (err) {
                console.error('Error releasing wake lock:', err);
            }
        };
    }, []);

    React.useEffect(() => {
        try {
            if (isTracking) {
                WakeLockService.request().catch(err => console.error('WakeLock request error:', err));
            } else {
                WakeLockService.release().catch(err => console.error('WakeLock release error:', err));
            }
        } catch (err) {
            console.error('WakeLock effect error:', err);
        }
    }, [isTracking]);

    // Timer for elapsed time during tracking
    React.useEffect(() => {
        // Clear any existing timer first
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (isTracking && trackingStartTime) {
            // Update immediately
            const updateStats = () => {
                const elapsed = Math.floor((Date.now() - trackingStartTime) / 1000);
                setElapsedTime(elapsed);

                // Calculate current speed from recent GPS points
                const recentPath = pathRef.current.slice(-5);
                if (recentPath.length >= 2) {
                    const recentSpeeds = recentPath
                        .map(p => p.speed)
                        .filter((s): s is number => s !== null && s !== undefined && s >= 0);
                    if (recentSpeeds.length > 0) {
                        setCurrentSpeed(recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length);
                    }
                }
            };

            // Run immediately, then every second
            updateStats();
            timerRef.current = setInterval(updateStats, 1000);
        }
        // Note: Don't reset elapsedTime here - it's reset in startTracking and handleStartPress

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isTracking, trackingStartTime]);

    const handleStartPress = async () => {
        if (locationError) {
            Alert.alert(
                "Location Required",
                "Please enable location access in your device settings to use CONQR.",
                [{ text: "OK" }]
            );
            return;
        }

        // Prevent double-taps while saving
        if (isSaving) {
            return;
        }

        if (isTracking) {
            // CRITICAL: Stop accepting GPS points BEFORE cloning the path.
            // The location callback (line 74) checks isTrackingRef.current,
            // so setting it false here prevents new points from arriving
            // between the clone and the state update.
            isTrackingRef.current = false;
            setIsTracking(false);
            setIsSaving(true);

            // Now safe to snapshot — no new points can be added to pathRef
            const currentPath = [...pathRef.current];
            const currentActivityType = activityTypeRef.current;
            const startTime = startTimeRef.current || Date.now();
            const endTime = Date.now();

            // Always save the activity, regardless of loop closure
            // Use a timeout to prevent hanging forever
            const SAVE_TIMEOUT_MS = 20000; // 20 seconds max for entire save operation
            const saveTimeout = setTimeout(() => {
                console.error('Save operation timed out after 20 seconds');
                setIsSaving(false);
                setPath([]);
                setActivityType(null);
                setTrackingStartTime(null);
                setCurrentDistance(0);
                setElapsedTime(0);
                setCurrentSpeed(0);
                Alert.alert("Save Timeout", "Activity save took too long. Please check your connection and try again.");
            }, SAVE_TIMEOUT_MS);

            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id || 'anonymous';
                const activityId = uuidv4();

                // Calculate activity metrics
                const distance = ActivityService.calculateDistance(currentPath);
                const duration = Math.round((endTime - startTime) / 1000);
                const averageSpeed = ActivityService.calculateAverageSpeed(currentPath);

                // Recalculate area from the final path rather than using the
                // throttled state value, which may be stale by up to 4 points.
                const currentArea = GameEngine.calculateArea(currentPath);

                let savedTerritory: Territory | null = null;
                const { isClosed } = GameEngine.checkLoopClosure(currentPath);

                // Process territory if loop is closed
                if (isClosed && currentArea > 0) {
                    const territory = GameEngine.processTerritory(currentPath, userId, activityId);
                    if (territory) {
                        savedTerritory = await TerritoryService.saveTerritory(territory);
                        setSavedTerritories(prev => [savedTerritory!, ...prev]);
                        setTotalArea(prev => prev + savedTerritory!.area);
                    }
                }

                // Create the activity object
                const activity: Activity = {
                    id: activityId,
                    userId,
                    type: currentActivityType || 'WALK',
                    startTime,
                    endTime,
                    distance,
                    duration,
                    polylines: [currentPath],
                    isSynced: false,
                    territoryId: savedTerritory?.id,
                    averageSpeed
                };

                // Save activity (returns null if doesn't meet minimum requirements)
                const savedActivity = await ActivityService.saveActivity(activity);

                if (savedActivity) {
                    console.log('Activity saved:', {
                        id: savedActivity.id,
                        type: savedActivity.type,
                        distance: `${(distance / 1000).toFixed(2)} km`,
                        duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
                        hasTerritory: !!savedTerritory
                    });

                    // Format duration for display
                    const durationFormatted = ActivityService.formatDuration(duration);
                    const paceFormatted = averageSpeed > 0 ? ActivityService.calculatePace(averageSpeed) : '--:--';

                    // Show appropriate alert
                    if (savedTerritory) {
                        Alert.alert(
                            "Territory Conquered!",
                            `${currentActivityType} completed!\n\n` +
                            `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                            `Duration: ${durationFormatted}\n` +
                            `Pace: ${paceFormatted} /km\n` +
                            `Territory: ${(savedTerritory.area / 1000000).toFixed(4)} km²\n\n` +
                            `Total conquered: ${((totalArea + savedTerritory.area) / 1000000).toFixed(4)} km²`
                        );
                    } else {
                        Alert.alert(
                            "Activity Saved!",
                            `${currentActivityType} completed!\n\n` +
                            `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                            `Duration: ${durationFormatted}\n` +
                            `Pace: ${paceFormatted} /km\n\n` +
                            `Tip: Close your loop to claim territory!`
                        );
                    }
                } else {
                    // Activity didn't meet minimum requirements
                    Alert.alert(
                        "Activity Too Short",
                        "Activity wasn't saved because it didn't meet minimum requirements:\n\n" +
                        "• At least 10 meters distance\n" +
                        "• At least 5 seconds duration\n\n" +
                        "Keep moving to record your activity!"
                    );
                }
            } catch (err) {
                console.error('Failed to save activity:', err);
                Alert.alert("Error", "Failed to save activity. Please try again.");
            } finally {
                clearTimeout(saveTimeout);
                setIsSaving(false);

                // Reset tracking state after save completes (success or failure)
                setPath([]);
                pathRef.current = []; // Also reset the ref
                runningDistanceRef.current = 0;
                recentPositionsRef.current = [];
                setActivityType(null);
                setTrackingStartTime(null);
                setCurrentDistance(0);
                setElapsedTime(0);
                setCurrentSpeed(0);
            }
        } else {
            setShowActivityPicker(true);
        }
    };

    const startTracking = (type: ActivityType) => {
        // Reset all tracking state before starting
        setPath([]);
        setCurrentDistance(0);
        setElapsedTime(0);
        setCurrentSpeed(0);
        runningDistanceRef.current = 0;
        recentPositionsRef.current = []; // Reset stillness detection

        // Set new tracking session
        setActivityType(type);
        setTrackingStartTime(Date.now());
        setShowActivityPicker(false);

        // Set ref immediately so the location callback starts collecting
        // points without waiting for the next React render (mirrors the
        // symmetric isTrackingRef.current = false in handleStartPress).
        isTrackingRef.current = true;
        setIsTracking(true);

        console.log('Started tracking:', type, 'at', new Date().toISOString());
    };

    return (
        <View style={styles.container}>
            <MapContainer ref={mapRef} location={location} path={path} territories={savedTerritories} style={styles.map} />

            {locationError && (
                <View style={styles.errorOverlay}>
                    <MapPinOff color="#ef4444" size={32} />
                    <Text style={styles.errorText}>{locationError}</Text>
                    <Text style={styles.errorHint}>Enable location in settings to continue</Text>
                </View>
            )}

            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
                <View style={styles.header} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.navigate('Profile')}
                    >
                        <User color="#fff" size={24} />
                    </TouchableOpacity>

                    <View style={[styles.statsContainer, isTracking && styles.statsContainerActive]}>
                        {isTracking ? (
                            <>
                                <View style={styles.trackingHeader}>
                                    <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
                                    <Text style={styles.statsLabel}>{activityType || 'ACTIVITY'}</Text>
                                </View>
                                <Text style={styles.statsValue}>
                                    {(currentDistance / 1000).toFixed(2)} km
                                </Text>
                                <View style={styles.statsRow}>
                                    <Text style={styles.statsSecondary}>
                                        {ActivityService.formatDuration(elapsedTime)}
                                    </Text>
                                    <Text style={styles.statsDivider}>•</Text>
                                    <Text style={styles.statsSecondary}>
                                        {ActivityService.calculatePace(currentSpeed)} /km
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <Text style={styles.statsLabel}>TOTAL CONQUERED</Text>
                                <Text style={styles.statsValue}>{(totalArea / 1000000).toFixed(4)} km²</Text>
                            </>
                        )}
                    </View>

                    <View style={{ width: 48 }} />
                </View>

                <View style={styles.bottomControls} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.centerButton}
                        onPress={() => mapRef.current?.centerOnUser()}
                    >
                        <Crosshair color="#fff" size={24} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.startButton, isTracking && styles.stopButton, isSaving && styles.savingButton]}
                        onPress={handleStartPress}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Text style={[styles.startButtonText, styles.stopButtonText]}>
                                    SAVING...
                                </Text>
                            </>
                        ) : isTracking ? (
                            <>
                                <Square color="#fff" size={24} fill="#fff" />
                                <Text style={[styles.startButtonText, styles.stopButtonText]}>
                                    STOP CONQUERING
                                </Text>
                            </>
                        ) : (
                            <>
                                <Play color="#000" size={24} fill="#000" />
                                <Text style={styles.startButtonText}>
                                    START CONQUERING
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            <Modal
                visible={showActivityPicker}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowActivityPicker(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Choose Activity Type</Text>

                        <TouchableOpacity
                            style={styles.activityOption}
                            onPress={() => startTracking('WALK')}
                        >
                            <Footprints color="#22d3ee" size={32} />
                            <Text style={styles.activityText}>Walk</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.activityOption}
                            onPress={() => startTracking('RUN')}
                        >
                            <PersonStanding color="#22d3ee" size={32} />
                            <Text style={styles.activityText}>Run</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.activityOption}
                            onPress={() => startTracking('RIDE')}
                        >
                            <Bike color="#22d3ee" size={32} />
                            <Text style={styles.activityText}>Ride</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowActivityPicker(false)}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    errorOverlay: {
        position: 'absolute',
        top: '40%',
        left: 20,
        right: 20,
        backgroundColor: 'rgba(10,10,10,0.98)',
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
        zIndex: 1000,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 17,
        fontWeight: 'bold',
        marginTop: 14,
        textAlign: 'center',
    },
    errorHint: {
        color: '#a1a1aa',
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
    },
    iconButton: {
        width: 50,
        height: 50,
        backgroundColor: 'rgba(10,10,10,0.75)',
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    statsContainer: {
        backgroundColor: 'rgba(10,10,10,0.8)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.35)',
        minWidth: 160,
    },
    statsContainerActive: {
        borderColor: 'rgba(239, 68, 68, 0.5)',
        backgroundColor: 'rgba(10,10,10,0.85)',
    },
    trackingHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ef4444',
    },
    statsLabel: {
        fontSize: 10,
        color: '#22d3ee',
        fontWeight: 'bold',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    statsValue: {
        fontSize: 22,
        color: '#fff',
        fontWeight: 'bold',
        marginTop: 2,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    statsSecondary: {
        fontSize: 13,
        color: '#a1a1aa',
        fontWeight: '500',
    },
    statsDivider: {
        fontSize: 13,
        color: '#52525b',
        marginHorizontal: 8,
    },
    bottomControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    centerButton: {
        width: 54,
        height: 54,
        backgroundColor: 'rgba(10,10,10,0.75)',
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    startButton: {
        flex: 1,
        height: 58,
        backgroundColor: '#22d3ee',
        borderRadius: 29,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    stopButton: {
        backgroundColor: '#ef4444',
    },
    savingButton: {
        backgroundColor: '#52525b',
    },
    startButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    stopButtonText: {
        color: '#fff',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#141414',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: 44,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        borderBottomWidth: 0,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
    },
    activityOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(34, 211, 238, 0.08)',
        borderRadius: 18,
        padding: 18,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.25)',
        gap: 16,
    },
    activityText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    cancelButton: {
        marginTop: 12,
        padding: 16,
        alignItems: 'center',
    },
    cancelText: {
        color: '#71717a',
        fontSize: 16,
        fontWeight: '500',
    },
});
