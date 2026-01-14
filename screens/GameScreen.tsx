import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// import MapLibreGL from '@maplibre/maplibre-react-native';
import { User, Layers, Crosshair, Play, Square } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { LocationService } from '../services/LocationService';
import { GameEngine } from '../services/GameEngine';
import { GPSPoint } from '../lib/types';

// Set up MapLibre
// MapLibreGL access token is not required for standard MapLibre basemaps or self-hosted tiles.

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function GameScreen() {
    const navigation = useNavigation<any>();
    const [location, setLocation] = React.useState<GPSPoint | null>(null);
    const [path, setPath] = React.useState<GPSPoint[]>([]);
    const [isTracking, setIsTracking] = React.useState(false);
    const [area, setArea] = React.useState(0);

    React.useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        const start = async () => {
            unsubscribe = await LocationService.startTracking((point) => {
                setLocation(point);
                if (isTracking) {
                    setPath(prev => {
                        const newPath = [...prev, point];
                        setArea(GameEngine.calculateArea(newPath));
                        return newPath;
                    });
                }
            });
        };

        start();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [isTracking]);

    const toggleTracking = () => {
        if (isTracking) {
            const { isClosed } = GameEngine.checkLoopClosure(path);
            if (isClosed) {
                Alert.alert("Loop Closed!", `You conquered ${area.toFixed(2)} m²!`);
            }
            setIsTracking(false);
            setPath([]);
            setArea(0);
        } else {
            setIsTracking(true);
            setPath([]);
            setArea(0);
        }
    };

    return (
        <View style={styles.container}>
            {/* Temporary fallback to stop Expo Go crashing */}
            <View style={[styles.map, styles.fallbackMap]}>
                <Text style={styles.fallbackText}>Map module disabled for Expo Go.</Text>
                <Text style={styles.fallbackTextSmall}>Run native build to enable MapLibre.</Text>
            </View>

            <SafeAreaView style={styles.overlay} pointerEvents="box-none">
                <View style={styles.header} pointerEvents="box-none">
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.navigate('Profile')}
                    >
                        <User color="#fff" size={24} />
                    </TouchableOpacity>

                    <View style={styles.statsContainer}>
                        <Text style={styles.statsLabel}>{isTracking ? 'CURRENT AREA' : 'GLOBAL GRID'}</Text>
                        <Text style={styles.statsValue}>{(area / 1000000).toFixed(4)} km²</Text>
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
                        onPress={toggleTracking}
                    >
                        {isTracking ? <Square color="#fff" size={24} fill="#fff" /> : <Play color="#000" size={24} fill="#000" />}
                        <Text style={[styles.startButtonText, isTracking && styles.stopButtonText]}>
                            {isTracking ? 'STOP CONQUERING' : 'START CONQUERING'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    map: {
        flex: 1,
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'space-between',
        padding: 16,
        pointerEvents: 'box-none',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
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
        shadowColor: '#22d3ee',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    stopButton: {
        backgroundColor: '#ef4444',
        shadowColor: '#ef4444',
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
    fallbackMap: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
    },
    fallbackText: {
        color: '#71717a',
        fontSize: 16,
        fontWeight: '500',
    },
    fallbackTextSmall: {
        color: '#71717a',
        fontSize: 12,
        marginTop: 8,
    },
});
