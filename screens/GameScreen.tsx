import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Play, Square, Footprints, Bike, PersonStanding, MapPinOff, Navigation2 } from 'lucide-react-native';
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
    const recentPositionsRef = React.useRef<{ lat: number; lng: number; time: number }[]>([]);

    const STILLNESS_WINDOW_MS = 3000;
    const STILLNESS_THRESHOLD_M = 3;
    const MIN_POINT_DISTANCE_M = 2;

    isTrackingRef.current = isTracking;
    pathRef.current = path;
    activityTypeRef.current = activityType;
    startTimeRef.current = trackingStartTime;

    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isTracking) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.3,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
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
            try {
                unsubscribe = await LocationService.startTracking(
                    (point) => {
                        if (!mounted) return;
                        setLocationError(null);
                        setLocation(point);

                        if (!isTrackingRef.current) return;

                        const MAX_ACCURACY_METERS = 50;
                        if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_METERS) return;

                        if (activityTypeRef.current && point.speed !== null) {
                            GameEngine.validateSpeed(point, activityTypeRef.current);
                        }

                        const now = Date.now();
                        const currentPos = { lat: point.lat, lng: point.lng, time: now };

                        recentPositionsRef.current.push(currentPos);
                        recentPositionsRef.current = recentPositionsRef.current.filter(
                            p => now - p.time < STILLNESS_WINDOW_MS
                        );

                        if (point.speed !== null && point.speed >= 0.8) {
                            // Moving
                        } else if (recentPositionsRef.current.length > 1) {
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

                            if (maxDisplacement < STILLNESS_THRESHOLD_M) {
                                if (point.speed === null || point.speed < 0.3) return;
                            }
                        }

                        setPath(prev => {
                            if (prev.length > 0) {
                                const last = prev[prev.length - 1];
                                try {
                                    const d = getDistance(
                                        { latitude: last.lat, longitude: last.lng },
                                        { latitude: point.lat, longitude: point.lng }
                                    );
                                    if (d < MIN_POINT_DISTANCE_M) return prev;
                                } catch { /* add point on error */ }
                            }

                            const newPath = [...prev, point];

                            try {
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
                            } catch { /* ignore */ }

                            return newPath;
                        });
                    },
                    (error) => {
                        if (!mounted) return;
                        setLocationError(error?.message || 'Location access denied');
                    }
                );
            } catch {
                if (mounted) setLocationError('Failed to start location tracking');
            }
        };

        start();

        return () => {
            mounted = false;
            if (unsubscribe) unsubscribe();
            WakeLockService.release();
        };
    }, []);

    React.useEffect(() => {
        if (isTracking) {
            WakeLockService.request().catch(() => {});
        } else {
            WakeLockService.release().catch(() => {});
        }
    }, [isTracking]);

    React.useEffect(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (isTracking && trackingStartTime) {
            const updateStats = () => {
                const elapsed = Math.floor((Date.now() - trackingStartTime) / 1000);
                setElapsedTime(elapsed);

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

            updateStats();
            timerRef.current = setInterval(updateStats, 1000);
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [isTracking, trackingStartTime]);

    const handleStartPress = async () => {
        if (locationError) {
            Alert.alert("Location Required", "Please enable location access to use CONQR.");
            return;
        }

        if (isSaving) return;

        if (isTracking) {
            isTrackingRef.current = false;
            setIsTracking(false);
            setIsSaving(true);

            const currentPath = [...pathRef.current];
            const currentActivityType = activityTypeRef.current;
            const startTime = startTimeRef.current || Date.now();
            const endTime = Date.now();

            const SAVE_TIMEOUT_MS = 20000;
            const saveTimeout = setTimeout(() => {
                setIsSaving(false);
                resetTrackingState();
                Alert.alert("Save Timeout", "Activity save took too long.");
            }, SAVE_TIMEOUT_MS);

            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id || 'anonymous';
                const activityId = uuidv4();

                const distance = ActivityService.calculateDistance(currentPath);
                const duration = Math.round((endTime - startTime) / 1000);
                const averageSpeed = ActivityService.calculateAverageSpeed(currentPath);
                const currentArea = GameEngine.calculateArea(currentPath);

                let savedTerritory: Territory | null = null;
                const { isClosed } = GameEngine.checkLoopClosure(currentPath);

                if (isClosed && currentArea > 0) {
                    const territory = GameEngine.processTerritory(currentPath, userId, activityId);
                    if (territory) {
                        savedTerritory = await TerritoryService.saveTerritory(territory);
                        setSavedTerritories(prev => [savedTerritory!, ...prev]);
                        setTotalArea(prev => prev + savedTerritory!.area);
                    }
                }

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

                const savedActivity = await ActivityService.saveActivity(activity);

                if (savedActivity) {
                    const durationFormatted = ActivityService.formatDuration(duration);
                    const paceFormatted = averageSpeed > 0 ? ActivityService.calculatePace(averageSpeed) : '--:--';

                    if (savedTerritory) {
                        Alert.alert(
                            "Territory Conquered!",
                            `${currentActivityType} completed!\n\n` +
                            `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                            `Duration: ${durationFormatted}\n` +
                            `Pace: ${paceFormatted} /km\n` +
                            `Territory: ${(savedTerritory.area / 1000000).toFixed(4)} km²`
                        );
                    } else {
                        Alert.alert(
                            "Activity Saved!",
                            `${currentActivityType} completed!\n\n` +
                            `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                            `Duration: ${durationFormatted}\n` +
                            `Pace: ${paceFormatted} /km\n\n` +
                            `Close your loop to claim territory!`
                        );
                    }
                } else {
                    Alert.alert("Activity Too Short", "Move more to record your activity.");
                }
            } catch {
                Alert.alert("Error", "Failed to save activity.");
            } finally {
                clearTimeout(saveTimeout);
                setIsSaving(false);
                resetTrackingState();
            }
        } else {
            setShowActivityPicker(true);
        }
    };

    const resetTrackingState = () => {
        setPath([]);
        pathRef.current = [];
        runningDistanceRef.current = 0;
        recentPositionsRef.current = [];
        setActivityType(null);
        setTrackingStartTime(null);
        setCurrentDistance(0);
        setElapsedTime(0);
        setCurrentSpeed(0);
    };

    const startTracking = (type: ActivityType) => {
        resetTrackingState();
        setActivityType(type);
        setTrackingStartTime(Date.now());
        setShowActivityPicker(false);
        isTrackingRef.current = true;
        setIsTracking(true);
    };

    const formatDuration = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatPace = (speed: number): string => {
        if (speed <= 0) return '--:--';
        const paceSeconds = 1000 / speed;
        const mins = Math.floor(paceSeconds / 60);
        const secs = Math.floor(paceSeconds % 60);
        if (mins > 99) return '--:--';
        return `${mins}'${secs.toString().padStart(2, '0')}"`;
    };

    return (
        <View style={styles.container}>
            <MapContainer
                ref={mapRef}
                location={location}
                path={path}
                territories={savedTerritories}
                style={styles.map}
            />

            {locationError && (
                <View style={styles.errorBanner}>
                    <MapPinOff color="#fff" size={18} />
                    <Text style={styles.errorText}>{locationError}</Text>
                </View>
            )}

            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
                {/* Top Bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => navigation.navigate('Profile')}
                    >
                        <User color="#fff" size={20} />
                    </TouchableOpacity>

                    {!isTracking && (
                        <View style={styles.territoryBadge}>
                            <Text style={styles.territoryLabel}>CONQUERED</Text>
                            <Text style={styles.territoryValue}>
                                {(totalArea / 1000000).toFixed(4)} km²
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => mapRef.current?.centerOnUser()}
                    >
                        <Navigation2 color="#fff" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Stats Panel - Only when tracking */}
                {isTracking && (
                    <View style={styles.statsPanel}>
                        <View style={styles.statsPanelHeader}>
                            <Animated.View style={[styles.recordDot, { opacity: pulseAnim }]} />
                            <Text style={styles.activityTypeLabel}>{activityType}</Text>
                        </View>

                        <View style={styles.mainStat}>
                            <Text style={styles.mainStatValue}>
                                {(currentDistance / 1000).toFixed(2)}
                            </Text>
                            <Text style={styles.mainStatUnit}>km</Text>
                        </View>

                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatDuration(elapsedTime)}</Text>
                                <Text style={styles.statLabel}>Time</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{formatPace(currentSpeed)}</Text>
                                <Text style={styles.statLabel}>Pace</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>
                                    {currentSpeed > 0 ? (currentSpeed * 3.6).toFixed(1) : '0.0'}
                                </Text>
                                <Text style={styles.statLabel}>km/h</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Bottom Action */}
                <View style={styles.bottomAction}>
                    <TouchableOpacity
                        style={[
                            styles.mainButton,
                            isTracking && styles.stopButton,
                            isSaving && styles.savingButton
                        ]}
                        onPress={handleStartPress}
                        disabled={isSaving}
                        activeOpacity={0.8}
                    >
                        {isSaving ? (
                            <Text style={styles.buttonText}>Saving...</Text>
                        ) : isTracking ? (
                            <>
                                <Square color="#fff" size={22} fill="#fff" />
                                <Text style={styles.buttonText}>Stop</Text>
                            </>
                        ) : (
                            <>
                                <Play color="#fff" size={22} fill="#fff" />
                                <Text style={styles.buttonText}>Start</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/* Activity Picker */}
            <Modal
                visible={showActivityPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowActivityPicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowActivityPicker(false)}
                >
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Select Activity</Text>

                        <TouchableOpacity
                            style={styles.activityRow}
                            onPress={() => startTracking('RUN')}
                        >
                            <View style={styles.activityIcon}>
                                <PersonStanding color="#FC4C02" size={24} />
                            </View>
                            <Text style={styles.activityName}>Run</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.activityRow}
                            onPress={() => startTracking('WALK')}
                        >
                            <View style={styles.activityIcon}>
                                <Footprints color="#FC4C02" size={24} />
                            </View>
                            <Text style={styles.activityName}>Walk</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.activityRow}
                            onPress={() => startTracking('RIDE')}
                        >
                            <View style={styles.activityIcon}>
                                <Bike color="#FC4C02" size={24} />
                            </View>
                            <Text style={styles.activityName}>Ride</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => setShowActivityPicker(false)}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'space-between',
    },
    errorBanner: {
        position: 'absolute',
        top: 100,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(255,68,68,0.9)',
        borderRadius: 8,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 100,
    },
    errorText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    territoryBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
        alignItems: 'center',
    },
    territoryLabel: {
        fontSize: 9,
        fontWeight: '600',
        color: '#888',
        letterSpacing: 1,
    },
    territoryValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
        marginTop: 1,
    },
    statsPanel: {
        position: 'absolute',
        top: 80,
        left: 16,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderRadius: 16,
        padding: 16,
    },
    statsPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    recordDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FC4C02',
        marginRight: 8,
    },
    activityTypeLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FC4C02',
        letterSpacing: 1,
    },
    mainStat: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        marginBottom: 12,
    },
    mainStatValue: {
        fontSize: 56,
        fontWeight: '300',
        color: '#fff',
        fontVariant: ['tabular-nums'],
    },
    mainStatUnit: {
        fontSize: 18,
        fontWeight: '400',
        color: '#888',
        marginLeft: 6,
    },
    statsRow: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        paddingTop: 12,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        fontVariant: ['tabular-nums'],
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '500',
        color: '#666',
        marginTop: 2,
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    bottomAction: {
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 8 : 20,
    },
    mainButton: {
        height: 56,
        borderRadius: 28,
        backgroundColor: '#FC4C02',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    stopButton: {
        backgroundColor: '#E53935',
    },
    savingButton: {
        backgroundColor: '#666',
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#fff',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#111',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#333',
        alignSelf: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 16,
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    activityIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(252,76,2,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    activityName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    cancelBtn: {
        padding: 14,
        alignItems: 'center',
        marginTop: 4,
    },
    cancelText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#888',
    },
});
