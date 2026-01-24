import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Layers, Crosshair, Play, Square, Footprints, Bike, PersonStanding, MapPinOff } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { LocationService } from '../services/LocationService';
import { GameEngine } from '../services/GameEngine';
import { WakeLockService } from '../services/WakeLockService';
import { TerritoryService } from '../services/TerritoryService';
import { ActivityService } from '../services/ActivityService';
import { GPSPoint, ActivityType, Territory, Activity } from '../lib/types';
import MapContainer from '../components/MapContainer';
import { supabase } from '../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export default function GameScreen() {
    const navigation = useNavigation<any>();
    const [location, setLocation] = React.useState<GPSPoint | null>(null);
    const [path, setPath] = React.useState<GPSPoint[]>([]);
    const [isTracking, setIsTracking] = React.useState(false);
    const [area, setArea] = React.useState(0);
    const [showActivityPicker, setShowActivityPicker] = React.useState(false);
    const [activityType, setActivityType] = React.useState<ActivityType | null>(null);
    const [locationError, setLocationError] = React.useState<string | null>(null);
    const [savedTerritories, setSavedTerritories] = React.useState<Territory[]>([]);
    const [totalArea, setTotalArea] = React.useState(0);
    const [trackingStartTime, setTrackingStartTime] = React.useState<number | null>(null);
    const [currentDistance, setCurrentDistance] = React.useState(0);

    const isTrackingRef = React.useRef(false);
    const pathRef = React.useRef<GPSPoint[]>([]);
    const activityTypeRef = React.useRef<ActivityType | null>(null);
    const startTimeRef = React.useRef<number | null>(null);
    isTrackingRef.current = isTracking;
    pathRef.current = path;
    activityTypeRef.current = activityType;
    startTimeRef.current = trackingStartTime;

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
                        console.log('Got location:', point.lat, point.lng);
                        setLocationError(null);
                        setLocation(point);
                        if (isTrackingRef.current) {
                            setPath(prev => {
                                const newPath = [...prev, point];
                                try {
                                    setArea(GameEngine.calculateArea(newPath));
                                    // Calculate distance in real-time
                                    const dist = ActivityService.calculateDistance(newPath);
                                    setCurrentDistance(dist);
                                } catch (calcErr) {
                                    console.error('Area calculation error:', calcErr);
                                }
                                return newPath;
                            });
                        }
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

    const handleStartPress = async () => {
        if (locationError) {
            Alert.alert(
                "Location Required",
                "Please enable location access in your device settings to use CONQR.",
                [{ text: "OK" }]
            );
            return;
        }

        if (isTracking) {
            const currentPath = pathRef.current;
            const currentArea = area;
            const currentActivityType = activityTypeRef.current;
            const startTime = startTimeRef.current || Date.now();
            const endTime = Date.now();

            setIsTracking(false);

            // Always save the activity, regardless of loop closure
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = session?.user?.id || 'anonymous';
                const activityId = uuidv4();

                // Calculate activity metrics
                const distance = ActivityService.calculateDistance(currentPath);
                const duration = Math.round((endTime - startTime) / 1000);
                const averageSpeed = ActivityService.calculateAverageSpeed(currentPath);

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

                // Create and save the activity
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

                await ActivityService.saveActivity(activity);
                console.log('Activity saved:', {
                    id: activity.id,
                    type: activity.type,
                    distance: `${(distance / 1000).toFixed(2)} km`,
                    duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
                    hasTerritory: !!savedTerritory
                });

                // Show appropriate alert
                if (savedTerritory) {
                    Alert.alert(
                        "Territory Conquered!",
                        `${currentActivityType} completed!\n\n` +
                        `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                        `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s\n` +
                        `Territory: ${(savedTerritory.area / 1000000).toFixed(4)} km²\n\n` +
                        `Total conquered: ${((totalArea + savedTerritory.area) / 1000000).toFixed(4)} km²`
                    );
                } else if (currentPath.length > 1) {
                    Alert.alert(
                        "Activity Saved!",
                        `${currentActivityType} completed!\n\n` +
                        `Distance: ${(distance / 1000).toFixed(2)} km\n` +
                        `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s\n\n` +
                        `Tip: Close your loop to claim territory!`
                    );
                }
            } catch (err) {
                console.error('Failed to save activity:', err);
                Alert.alert("Error", "Failed to save activity. Please try again.");
            }

            setTimeout(() => {
                setPath([]);
                setArea(0);
                setActivityType(null);
                setTrackingStartTime(null);
                setCurrentDistance(0);
            }, 100);
        } else {
            setShowActivityPicker(true);
        }
    };

    const startTracking = (type: ActivityType) => {
        setActivityType(type);
        setShowActivityPicker(false);
        setIsTracking(true);
        setPath([]);
        setArea(0);
        setTrackingStartTime(Date.now());
        setCurrentDistance(0);
        console.log('Started tracking:', type, 'at', new Date().toISOString());
    };

    return (
        <View style={styles.container}>
            <MapContainer location={location} path={path} territories={savedTerritories} style={styles.map} />

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

                    <View style={styles.statsContainer}>
                        {isTracking ? (
                            <>
                                <Text style={styles.statsLabel}>DISTANCE / AREA</Text>
                                <Text style={styles.statsValue}>
                                    {(currentDistance / 1000).toFixed(2)} km • {(area / 1000000).toFixed(4)} km²
                                </Text>
                            </>
                        ) : (
                            <>
                                <Text style={styles.statsLabel}>TOTAL CONQUERED</Text>
                                <Text style={styles.statsValue}>{(totalArea / 1000000).toFixed(4)} km²</Text>
                            </>
                        )}
                    </View>

                    <TouchableOpacity style={styles.iconButton}>
                        <Layers color="#fff" size={24} />
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomControls} pointerEvents="box-none">
                    <TouchableOpacity style={styles.centerButton}>
                        <Crosshair color="#fff" size={24} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.startButton, isTracking && styles.stopButton]}
                        onPress={handleStartPress}
                    >
                        {isTracking ? <Square color="#fff" size={24} fill="#fff" /> : <Play color="#000" size={24} fill="#000" />}
                        <Text style={[styles.startButtonText, isTracking && styles.stopButtonText]}>
                            {isTracking ? 'STOP CONQUERING' : 'START CONQUERING'}
                        </Text>
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
        backgroundColor: '#000',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    errorOverlay: {
        position: 'absolute',
        top: '40%',
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.95)',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
        zIndex: 1000,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 12,
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
        width: 48,
        height: 48,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    statsContainer: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.3)',
    },
    statsLabel: {
        fontSize: 10,
        color: '#22d3ee',
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    statsValue: {
        fontSize: 16,
        color: '#fff',
        fontWeight: 'bold',
    },
    bottomControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
    },
    centerButton: {
        width: 56,
        height: 56,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    startButton: {
        flex: 1,
        height: 56,
        backgroundColor: '#22d3ee',
        borderRadius: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    stopButton: {
        backgroundColor: '#ef4444',
    },
    startButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    stopButtonText: {
        color: '#fff',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
    },
    activityOption: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(34, 211, 238, 0.1)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(34, 211, 238, 0.3)',
        gap: 16,
    },
    activityText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    cancelButton: {
        marginTop: 8,
        padding: 16,
        alignItems: 'center',
    },
    cancelText: {
        color: '#888',
        fontSize: 16,
    },
});
