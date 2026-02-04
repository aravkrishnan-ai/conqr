import * as React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { GPSPoint, Territory } from '../lib/types';

export interface MapContainerHandle {
    centerOnUser: () => void;
}

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    territories?: Territory[];
    style?: any;
}

function MapContainerComponent({ location, path, territories = [], style }: MapContainerProps, ref: React.Ref<MapContainerHandle>) {
    const webViewRef = React.useRef<WebView>(null);
    const [mapReady, setMapReady] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [webViewError, setWebViewError] = React.useState<string | null>(null);

    // Throttling refs for path updates
    const lastPathUpdateRef = React.useRef<number>(0);
    const pendingPathRef = React.useRef<GPSPoint[]>([]);
    const pathUpdateTimerRef = React.useRef<any>(null);
    const PATH_UPDATE_THROTTLE_MS = 100; // Update path at most every 100ms

    // Safe script injection helper
    const injectScript = React.useCallback((script: string) => {
        if (!webViewRef.current) return;
        try {
            webViewRef.current.injectJavaScript(script);
        } catch (err) {
            console.error('Failed to inject script:', err);
        }
    }, []);

    React.useImperativeHandle(ref, () => ({
        centerOnUser: () => {
            if (!mapReady) return;
            injectScript(`if (window.centerOnUser) { window.centerOnUser(); } true;`);
        },
    }), [mapReady, injectScript]);

    // Throttle location marker updates
    const lastLocationUpdateRef = React.useRef<number>(0);
    const LOCATION_UPDATE_THROTTLE_MS = 50; // Update marker at most every 50ms

    // Update map when location changes
    React.useEffect(() => {
        if (mapReady && location) {
            // Validate coordinates
            if (typeof location.lat !== 'number' || typeof location.lng !== 'number' ||
                isNaN(location.lat) || isNaN(location.lng)) {
                console.warn('Invalid location coordinates:', location);
                return;
            }

            // Throttle marker position updates
            const now = Date.now();
            if (now - lastLocationUpdateRef.current < LOCATION_UPDATE_THROTTLE_MS) {
                return; // Skip this update, too soon
            }
            lastLocationUpdateRef.current = now;

            const script = `
                if (window.updateLocation) {
                    window.updateLocation(${location.lat}, ${location.lng});
                }
                true;
            `;
            injectScript(script);
        }
    }, [location, mapReady, injectScript]);

    // Track last sent path length to detect actual changes
    const lastPathLengthRef = React.useRef(0);

    // Actual path rendering function
    const renderPath = React.useCallback((pathToRender: GPSPoint[]) => {
        if (!mapReady) return;

        if (pathToRender && pathToRender.length > 0) {
            // Filter out invalid points
            const validPath = pathToRender.filter(p =>
                p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                !isNaN(p.lat) && !isNaN(p.lng)
            );

            if (validPath.length > 0) {
                // Only log when path actually grows
                if (validPath.length > lastPathLengthRef.current) {
                    console.log(`Path updated: ${validPath.length} points`);
                }
                lastPathLengthRef.current = validPath.length;

                const pathCoords = JSON.stringify(validPath.map(p => [p.lat, p.lng]));
                const script = `
                    if (window.updatePath) {
                        window.updatePath(${pathCoords});
                    }
                    true;
                `;
                injectScript(script);
            }
        } else {
            // Path cleared
            if (lastPathLengthRef.current > 0) {
                console.log('Path cleared');
            }
            lastPathLengthRef.current = 0;

            const script = `
                if (window.clearPath) {
                    window.clearPath();
                }
                true;
            `;
            injectScript(script);
        }
    }, [mapReady, injectScript]);

    // Update path when it changes - throttled to prevent glitchy rendering
    React.useEffect(() => {
        if (!mapReady) return;

        // Handle path cleared
        if (!path || path.length === 0) {
            if (pathUpdateTimerRef.current) {
                clearTimeout(pathUpdateTimerRef.current);
                pathUpdateTimerRef.current = null;
            }
            pendingPathRef.current = [];
            renderPath([]);
            return;
        }

        // Store pending path
        pendingPathRef.current = path;

        const now = Date.now();
        const timeSinceLastUpdate = now - lastPathUpdateRef.current;

        // If enough time has passed, update immediately
        if (timeSinceLastUpdate >= PATH_UPDATE_THROTTLE_MS) {
            lastPathUpdateRef.current = now;
            renderPath(path);
        } else if (!pathUpdateTimerRef.current) {
            // Schedule a deferred update
            pathUpdateTimerRef.current = setTimeout(() => {
                pathUpdateTimerRef.current = null;
                // Guard against updates after unmount
                if (!isMountedRef.current) return;
                lastPathUpdateRef.current = Date.now();
                renderPath(pendingPathRef.current);
            }, PATH_UPDATE_THROTTLE_MS - timeSinceLastUpdate);
        }
        // If timer already scheduled, it will pick up the latest pendingPathRef
    }, [path, mapReady, renderPath]);

    // Track mounted state to prevent updates after unmount
    const isMountedRef = React.useRef(true);

    // Cleanup on unmount
    React.useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (pathUpdateTimerRef.current) {
                clearTimeout(pathUpdateTimerRef.current);
                pathUpdateTimerRef.current = null;
            }
        };
    }, []);

    // Update territories when they change
    React.useEffect(() => {
        if (mapReady && territories) {
            // Filter out territories with invalid polygons
            const validTerritories = territories.filter(t =>
                t && t.id && Array.isArray(t.polygon) && t.polygon.length > 2
            );
            const territoryData = JSON.stringify(validTerritories.map(t => ({
                id: t.id,
                polygon: t.polygon
                    .filter(coord => Array.isArray(coord) && coord.length >= 2 &&
                        typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                        !isNaN(coord[0]) && !isNaN(coord[1]))
                    .map(coord => [coord[1], coord[0]])
            })));
            const script = `
                if (window.updateTerritories) {
                    window.updateTerritories(${territoryData});
                }
                true;
            `;
            injectScript(script);
        }
    }, [territories, mapReady, injectScript]);

    const initialLat = location?.lat || 37.7749;
    const initialLng = location?.lng || -122.4194;

    const mapHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #map {
            width: 100%;
            height: 100%;
            background: #1a1a2e;
        }
        .leaflet-container {
            background: #1a1a2e;
        }
        /* No filter needed - using native dark tiles from CartoDB */
        /* User marker pulse animation */
        .user-marker-container {
            position: relative;
        }
        .user-marker {
            width: 20px;
            height: 20px;
            background: #22d3ee;
            border-radius: 50%;
            border: 3px solid #fff;
            box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
            position: relative;
            z-index: 2;
        }
        .user-marker-pulse {
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(34, 211, 238, 0.3);
            border-radius: 50%;
            top: -10px;
            left: -10px;
            z-index: 1;
            animation: pulse 2s ease-out infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
        }
        /* Hide attribution for cleaner look */
        .leaflet-control-attribution {
            display: none;
        }
        /* Loading state */
        .loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #1a1a2e;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: opacity 0.3s ease;
        }
        .loading-overlay.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(34, 211, 238, 0.2);
            border-top-color: #22d3ee;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="loading" class="loading-overlay"><div class="loading-spinner"></div></div>
    <div id="map"></div>
    <script>
        var mapInitialized = false;
        var tilesLoaded = false;

        function hideLoading() {
            var loadingEl = document.getElementById('loading');
            if (loadingEl) {
                loadingEl.classList.add('hidden');
                setTimeout(function() { loadingEl.style.display = 'none'; }, 300);
            }
        }

        // Initialize map
        var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([${initialLat}, ${initialLng}], 17);

        // Add dark-themed map tiles (CartoDB Dark Matter for better dark mode)
        var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(map);

        // Hide loading when tiles are loaded
        tileLayer.on('load', function() {
            tilesLoaded = true;
            hideLoading();
        });

        // Fallback: hide loading after timeout even if tiles haven't fully loaded
        setTimeout(function() {
            if (!tilesLoaded) {
                hideLoading();
            }
        }, 5000);

        // Custom user marker icon
        var userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker-pulse"></div><div class="user-marker"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        var userMarker = null;
        var pathLine = null;
        var territoryLayers = [];
        var isFirstLocation = true;

        // Update user location
        window.updateLocation = function(lat, lng) {
            if (!userMarker) {
                userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
            } else {
                userMarker.setLatLng([lat, lng]);
            }

            // Only center map on first location - no auto-panning during tracking
            // This prevents glitchy map jumps. Users can manually center with the button.
            if (isFirstLocation) {
                map.setView([lat, lng], 17);
                isFirstLocation = false;
            }
            // Auto-pan removed - was causing glitchy behavior during tracking
        };

        // Update path/trail - show immediately even with 1 point
        var startMarker = null;
        var startIcon = L.divIcon({
            className: 'start-marker',
            html: '<div style="width:12px;height:12px;background:#10b981;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(16,185,129,0.5);"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        window.updatePath = function(coords) {
            if (!coords || coords.length === 0) {
                // Clear path if no coords
                if (pathLine) {
                    map.removeLayer(pathLine);
                    pathLine = null;
                }
                if (startMarker) {
                    map.removeLayer(startMarker);
                    startMarker = null;
                }
                return;
            }

            // Update or create start marker
            if (startMarker) {
                startMarker.setLatLng(coords[0]);
            } else {
                startMarker = L.marker(coords[0], { icon: startIcon }).addTo(map);
            }

            // Update or create path line (use setLatLngs for smooth updates)
            if (coords.length >= 2) {
                if (pathLine) {
                    // Update existing polyline in place - much smoother than recreating
                    pathLine.setLatLngs(coords);
                } else {
                    pathLine = L.polyline(coords, {
                        color: '#22d3ee',
                        weight: 4,
                        opacity: 0.9,
                        lineJoin: 'round',
                        lineCap: 'round'
                    }).addTo(map);
                }
            } else if (pathLine) {
                // Only 1 point, remove line but keep start marker
                map.removeLayer(pathLine);
                pathLine = null;
            }
        };

        // Clear path completely
        window.clearPath = function() {
            if (pathLine) {
                map.removeLayer(pathLine);
                pathLine = null;
            }
            if (startMarker) {
                map.removeLayer(startMarker);
                startMarker = null;
            }
        };

        // Center on user
        window.centerOnUser = function() {
            if (userMarker) {
                map.setView(userMarker.getLatLng(), 17);
            }
        };

        // Update conquered territories
        window.updateTerritories = function(territories) {
            // Clear old territory layers
            territoryLayers.forEach(function(layer) {
                map.removeLayer(layer);
            });
            territoryLayers = [];

            // Add new territories
            territories.forEach(function(territory) {
                if (territory.polygon && territory.polygon.length > 2) {
                    var polygon = L.polygon(territory.polygon, {
                        color: '#22d3ee',
                        weight: 2,
                        opacity: 0.8,
                        fillColor: '#22d3ee',
                        fillOpacity: 0.2
                    }).addTo(map);
                    territoryLayers.push(polygon);
                }
            });
        };

        // Signal that map is ready
        window.ReactNativeWebView.postMessage('mapReady');
    </script>
</body>
</html>
    `;

    const handleMessage = (event: any) => {
        try {
            const message = event.nativeEvent.data;
            if (message === 'mapReady') {
                setMapReady(true);
                setWebViewError(null);
                // Send initial location if available
                if (location &&
                    typeof location.lat === 'number' && typeof location.lng === 'number' &&
                    !isNaN(location.lat) && !isNaN(location.lng)) {
                    const script = `
                        window.updateLocation(${location.lat}, ${location.lng});
                        true;
                    `;
                    injectScript(script);
                }
                // Send initial path if tracking is already in progress
                if (path && path.length > 0) {
                    const validPath = path.filter(p =>
                        p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                        !isNaN(p.lat) && !isNaN(p.lng)
                    );
                    if (validPath.length > 0) {
                        const pathCoords = JSON.stringify(validPath.map(p => [p.lat, p.lng]));
                        injectScript(`if (window.updatePath) { window.updatePath(${pathCoords}); } true;`);
                    }
                }
                // Send initial territories if available
                if (territories && territories.length > 0) {
                    const validTerritories = territories.filter(t =>
                        t && t.id && Array.isArray(t.polygon) && t.polygon.length > 2
                    );
                    if (validTerritories.length > 0) {
                        const territoryData = JSON.stringify(validTerritories.map(t => ({
                            id: t.id,
                            polygon: t.polygon
                                .filter(coord => Array.isArray(coord) && coord.length >= 2 &&
                                    typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                                    !isNaN(coord[0]) && !isNaN(coord[1]))
                                .map(coord => [coord[1], coord[0]])
                        })));
                        injectScript(`if (window.updateTerritories) { window.updateTerritories(${territoryData}); } true;`);
                    }
                }
            } else if (message === 'tilesLoaded') {
                setIsLoading(false);
            }
        } catch (err) {
            console.error('Error handling WebView message:', err);
        }
    };

    const handleError = (syntheticEvent: any) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView error:', nativeEvent);
        setWebViewError(nativeEvent.description || 'Map failed to load');
        setIsLoading(false);
    };

    const handleHttpError = (syntheticEvent: any) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView HTTP error:', nativeEvent);
    };

    const handleLoadEnd = () => {
        // Give a brief moment for the map JS to initialize
        setTimeout(() => setIsLoading(false), 500);
    };

    return (
        <View style={[styles.container, style]}>
            <WebView
                ref={webViewRef}
                source={{ html: mapHtml }}
                style={styles.webview}
                onMessage={handleMessage}
                onError={handleError}
                onHttpError={handleHttpError}
                onLoadEnd={handleLoadEnd}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                androidLayerType="hardware"
                cacheEnabled={true}
                cacheMode="LOAD_CACHE_ELSE_NETWORK"
                originWhitelist={['*']}
                mixedContentMode="compatibility"
            />
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#22d3ee" />
                    <Text style={styles.loadingText}>Loading map...</Text>
                </View>
            )}
            {webViewError && (
                <View style={styles.errorOverlay}>
                    <Text style={styles.errorText}>Map failed to load</Text>
                    <Text style={styles.errorHint}>Check your internet connection</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: '#71717a',
        fontSize: 14,
        marginTop: 12,
    },
    errorOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        fontWeight: 'bold',
    },
    errorHint: {
        color: '#71717a',
        fontSize: 14,
        marginTop: 8,
    },
});

// Wrap with forwardRef - don't memoize to ensure real-time updates
const MapContainer = React.forwardRef<MapContainerHandle, MapContainerProps>(MapContainerComponent);

export default MapContainer;
