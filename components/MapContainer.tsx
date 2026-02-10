import * as React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { GPSPoint, Territory } from '../lib/types';

export interface MapContainerHandle {
    centerOnUser: () => void;
    centerOnLocation: (lat: number, lng: number, zoom?: number) => void;
    fitBounds: (bounds: [[number, number], [number, number]], padding?: number) => void;
}

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    territories?: Territory[];
    currentUserId?: string;
    style?: any;
    onReady?: () => void;
    onTerritoryPress?: (territory: { id: string; ownerId: string; ownerName: string }) => void;
}

// Static HTML that never changes - prevents WebView reloads
const MAP_HTML = `
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
            background: #000;
            overflow: hidden;
            -webkit-overflow-scrolling: none;
            touch-action: pan-x pan-y;
        }
        .leaflet-container {
            background: #000;
        }
        .leaflet-tile-pane {
            opacity: 1;
        }
        /* Smooth marker movement */
        .leaflet-marker-icon {
            transition: transform 0.2s ease-out !important;
            will-change: transform;
        }
        .leaflet-marker-pane {
            will-change: transform;
        }
        /* User marker */
        .user-marker-container {
            position: relative;
        }
        .user-marker {
            width: 16px;
            height: 16px;
            background: #FC4C02;
            border-radius: 50%;
            border: 3px solid #fff;
            box-shadow: 0 0 0 3px rgba(252,76,2,0.3);
            position: relative;
            z-index: 2;
        }
        .user-marker-pulse {
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(252, 76, 2, 0.2);
            border-radius: 50%;
            top: -12px;
            left: -12px;
            z-index: 1;
            animation: pulse 2s ease-out infinite;
        }
        @keyframes pulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2); opacity: 0; }
        }
        .leaflet-control-attribution { display: none; }
        .loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: opacity 0.3s;
        }
        .loading-overlay.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(252,76,2,0.2);
            border-top-color: #FC4C02;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="loading" class="loading-overlay"><div class="spinner"></div></div>
    <div id="map"></div>
    <script>
        (function() {
            var map, userMarker, pathLine, startMarker, territoryLayers = [];
            var isFirstLocation = true;
            var mapReady = false;

            // Deterministic color palette for user territories
            var USER_COLORS = [
                '#FC4C02', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
                '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
                '#6366F1', '#14B8A6', '#E879F9', '#22D3EE', '#A3E635',
                '#FB923C', '#818CF8', '#2DD4BF', '#C084FC', '#34D399'
            ];

            // Hash a userId string to a consistent color index
            function userColor(userId) {
                if (!userId) return '#888888';
                var hash = 0;
                for (var i = 0; i < userId.length; i++) {
                    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
                    hash = hash & hash;
                }
                var idx = Math.abs(hash) % USER_COLORS.length;
                return USER_COLORS[idx];
            }

            // Initialize map with default center (will be updated when location arrives)
            map = L.map('map', {
                zoomControl: false,
                attributionControl: false,
                fadeAnimation: false,
                zoomAnimation: true,
                markerZoomAnimation: false
            }).setView([37.7749, -122.4194], 16);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd',
                updateWhenIdle: true,
                updateWhenZooming: false
            }).addTo(map);

            // Hide loading after tiles load or timeout
            var loadingEl = document.getElementById('loading');
            map.whenReady(function() {
                setTimeout(function() {
                    loadingEl.classList.add('hidden');
                    mapReady = true;
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
                }, 300);
            });
            setTimeout(function() {
                loadingEl.classList.add('hidden');
                if (!mapReady) {
                    mapReady = true;
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
                }
            }, 3000);

            var userIcon = L.divIcon({
                className: 'user-marker-container',
                html: '<div class="user-marker-pulse"></div><div class="user-marker"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            var startIcon = L.divIcon({
                className: 'start-marker',
                html: '<div style="width:12px;height:12px;background:#00D26A;border-radius:50%;border:2px solid #fff;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            window.updateLocation = function(lat, lng) {
                if (!map) return;
                var latlng = [lat, lng];
                if (!userMarker) {
                    userMarker = L.marker(latlng, { icon: userIcon, interactive: false }).addTo(map);
                } else {
                    userMarker.setLatLng(latlng);
                }
                if (isFirstLocation) {
                    map.setView(latlng, 17, { animate: false });
                    isFirstLocation = false;
                }
            };

            window.updatePath = function(coords) {
                if (!map || !coords) return;
                if (coords.length === 0) {
                    if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
                    if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
                    return;
                }
                if (!startMarker) {
                    startMarker = L.marker(coords[0], { icon: startIcon, interactive: false }).addTo(map);
                } else {
                    startMarker.setLatLng(coords[0]);
                }
                if (coords.length >= 2) {
                    if (pathLine) {
                        pathLine.setLatLngs(coords);
                    } else {
                        pathLine = L.polyline(coords, {
                            color: '#FC4C02',
                            weight: 4,
                            opacity: 1,
                            lineJoin: 'round',
                            lineCap: 'round'
                        }).addTo(map);
                    }
                } else if (pathLine) {
                    map.removeLayer(pathLine);
                    pathLine = null;
                }
            };

            window.clearPath = function() {
                if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
                if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
            };

            window.centerOnUser = function() {
                if (userMarker && map) {
                    map.setView(userMarker.getLatLng(), map.getZoom(), { animate: true });
                }
            };

            window.centerOnLocation = function(lat, lng, zoom) {
                if (map) {
                    map.setView([lat, lng], zoom || 17, { animate: true });
                }
            };

            window.fitBounds = function(southWest, northEast, padding) {
                if (!map) return;
                var p = padding || 40;
                var bounds = L.latLngBounds(southWest, northEast);
                map.fitBounds(bounds, { padding: [p, p], animate: false });
            };

            var currentUserId = null;
            window.setCurrentUser = function(userId) {
                currentUserId = userId;
            };

            window.updateTerritories = function(territories) {
                if (!map) return;
                territoryLayers.forEach(function(l) { map.removeLayer(l); });
                territoryLayers = [];
                territories.forEach(function(t) {
                    if (t.polygon && t.polygon.length > 2) {
                        var isOwn = currentUserId && t.ownerId === currentUserId;
                        var color = isOwn ? '#FC4C02' : userColor(t.ownerId);

                        var poly = L.polygon(t.polygon, {
                            color: color,
                            weight: 2,
                            opacity: 0.8,
                            fillColor: color,
                            fillOpacity: isOwn ? 0.25 : 0.2
                        }).addTo(map);

                        poly.on('click', function() {
                            window.ReactNativeWebView.postMessage(JSON.stringify({
                                type: 'territoryPress',
                                id: t.id,
                                ownerId: t.ownerId,
                                ownerName: t.ownerName || ''
                            }));
                        });

                        territoryLayers.push(poly);
                    }
                });
            };
        })();
    </script>
</body>
</html>
`;

function MapContainerComponent(
    { location, path, territories = [], currentUserId, style, onReady, onTerritoryPress }: MapContainerProps,
    ref: React.Ref<MapContainerHandle>
) {
    const webViewRef = React.useRef<WebView>(null);
    const [isReady, setIsReady] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const isMountedRef = React.useRef(true);

    // Refs to track last sent values - prevents duplicate updates
    const lastLocationRef = React.useRef<string>('');
    const lastPathLengthRef = React.useRef<number>(0);
    const lastTerritoriesRef = React.useRef<string>('');

    // Throttle refs
    const locationThrottleRef = React.useRef<number>(0);
    const pathThrottleRef = React.useRef<number>(0);
    const LOCATION_THROTTLE = 200;
    const PATH_THROTTLE = 300;

    // Keep onTerritoryPress in a ref so the handleMessage callback stays stable
    const onTerritoryPressRef = React.useRef(onTerritoryPress);
    onTerritoryPressRef.current = onTerritoryPress;

    const injectScript = React.useCallback((script: string) => {
        if (!webViewRef.current || !isMountedRef.current) return;
        webViewRef.current.injectJavaScript(`${script}; true;`);
    }, []);

    React.useImperativeHandle(ref, () => ({
        centerOnUser: () => {
            if (isReady) injectScript('window.centerOnUser && window.centerOnUser()');
        },
        centerOnLocation: (lat: number, lng: number, zoom?: number) => {
            if (isReady) {
                const z = zoom || 17;
                injectScript(`window.centerOnLocation && window.centerOnLocation(${lat}, ${lng}, ${z})`);
            }
        },
        fitBounds: (bounds: [[number, number], [number, number]], padding?: number) => {
            if (isReady) {
                const p = padding || 40;
                injectScript(`window.fitBounds && window.fitBounds([${bounds[0][0]}, ${bounds[0][1]}], [${bounds[1][0]}, ${bounds[1][1]}], ${p})`);
            }
        },
    }), [isReady, injectScript]);

    // Update location - throttled
    React.useEffect(() => {
        if (!isReady || !location) return;

        const key = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
        if (key === lastLocationRef.current) return;

        const now = Date.now();
        if (now - locationThrottleRef.current < LOCATION_THROTTLE) return;

        locationThrottleRef.current = now;
        lastLocationRef.current = key;
        injectScript(`window.updateLocation && window.updateLocation(${location.lat}, ${location.lng})`);
    }, [location, isReady, injectScript]);

    // Update path - throttled
    React.useEffect(() => {
        if (!isReady) return;

        const now = Date.now();
        if (now - pathThrottleRef.current < PATH_THROTTLE && path.length > 0) {
            // Schedule update for later
            const timer = setTimeout(() => {
                if (!isMountedRef.current) return;
                pathThrottleRef.current = Date.now();
                const validPath = path.filter(p => p && !isNaN(p.lat) && !isNaN(p.lng));
                if (validPath.length !== lastPathLengthRef.current) {
                    lastPathLengthRef.current = validPath.length;
                    const coords = JSON.stringify(validPath.map(p => [p.lat, p.lng]));
                    injectScript(`window.updatePath && window.updatePath(${coords})`);
                }
            }, PATH_THROTTLE);
            return () => clearTimeout(timer);
        }

        pathThrottleRef.current = now;
        const validPath = path.filter(p => p && !isNaN(p.lat) && !isNaN(p.lng));

        if (validPath.length === 0 && lastPathLengthRef.current > 0) {
            lastPathLengthRef.current = 0;
            injectScript('window.clearPath && window.clearPath()');
        } else if (validPath.length !== lastPathLengthRef.current) {
            lastPathLengthRef.current = validPath.length;
            const coords = JSON.stringify(validPath.map(p => [p.lat, p.lng]));
            injectScript(`window.updatePath && window.updatePath(${coords})`);
        }
    }, [path, isReady, injectScript]);

    // Set current user ID
    React.useEffect(() => {
        if (!isReady || !currentUserId) return;
        injectScript(`window.setCurrentUser && window.setCurrentUser('${currentUserId}')`);
    }, [currentUserId, isReady, injectScript]);

    // Update territories
    React.useEffect(() => {
        if (!isReady || !territories) return;

        const validTerritories = territories.filter(t =>
            t && t.id && Array.isArray(t.polygon) && t.polygon.length > 2
        );
        const key = validTerritories.map(t => `${t.id}-${t.ownerId}`).join(',');
        if (key === lastTerritoriesRef.current) return;

        lastTerritoriesRef.current = key;
        const data = JSON.stringify(validTerritories.map(t => ({
            id: t.id,
            ownerId: t.ownerId,
            ownerName: t.ownerName || null,
            center: t.center ? [t.center.lat, t.center.lng] : null,
            polygon: t.polygon
                .filter(c => Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1]))
                .map(c => [c[1], c[0]])
        })));
        injectScript(`window.updateTerritories && window.updateTerritories(${data})`);
    }, [territories, isReady, injectScript]);

    // Cleanup
    React.useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const handleMessage = React.useCallback((event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'ready') {
                setIsReady(true);
                setIsLoading(false);
                onReady?.();
            } else if (data.type === 'territoryPress') {
                onTerritoryPressRef.current?.({
                    id: data.id,
                    ownerId: data.ownerId,
                    ownerName: data.ownerName,
                });
            }
        } catch {
            // Legacy: plain string message
            if (event.nativeEvent.data === 'ready') {
                setIsReady(true);
                setIsLoading(false);
                onReady?.();
            }
        }
    }, [onReady]);

    return (
        <View style={[styles.container, style]}>
            <WebView
                ref={webViewRef}
                source={{ html: MAP_HTML }}
                style={styles.webview}
                onMessage={handleMessage}
                onLoadEnd={() => setTimeout(() => setIsLoading(false), 1000)}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                androidLayerType="hardware"
                cacheEnabled={true}
                originWhitelist={['*']}
                startInLoadingState={false}
            />
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#FC4C02" />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    webview: {
        flex: 1,
        backgroundColor: '#000',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
});

const MapContainer = React.memo(
    React.forwardRef<MapContainerHandle, MapContainerProps>(MapContainerComponent)
);

export default MapContainer;
