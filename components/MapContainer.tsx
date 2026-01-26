import * as React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { GPSPoint, Territory } from '../lib/types';

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    territories?: Territory[];
    style?: any;
}

function MapContainerComponent({ location, path, territories = [], style }: MapContainerProps) {
    const webViewRef = React.useRef<WebView>(null);
    const [mapReady, setMapReady] = React.useState(false);
    const [webViewError, setWebViewError] = React.useState<string | null>(null);

    // Safe script injection helper
    const injectScript = React.useCallback((script: string) => {
        if (!webViewRef.current) return;
        try {
            webViewRef.current.injectJavaScript(script);
        } catch (err) {
            console.error('Failed to inject script:', err);
        }
    }, []);

    // Update map when location changes
    React.useEffect(() => {
        if (mapReady && location) {
            // Validate coordinates
            if (typeof location.lat !== 'number' || typeof location.lng !== 'number' ||
                isNaN(location.lat) || isNaN(location.lng)) {
                console.warn('Invalid location coordinates:', location);
                return;
            }
            const script = `
                if (window.updateLocation) {
                    window.updateLocation(${location.lat}, ${location.lng});
                }
                true;
            `;
            injectScript(script);
        }
    }, [location, mapReady, injectScript]);

    // Update path when it changes
    React.useEffect(() => {
        if (mapReady) {
            if (path && path.length > 0) {
                // Filter out invalid points
                const validPath = path.filter(p =>
                    p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                    !isNaN(p.lat) && !isNaN(p.lng)
                );
                if (validPath.length > 0) {
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
                const script = `
                    if (window.clearPath) {
                        window.clearPath();
                    }
                    true;
                `;
                injectScript(script);
            }
        }
    }, [path, mapReady, injectScript]);

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
                    .filter(coord => Array.isArray(coord) && coord.length >= 2)
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
        /* Custom dark tile styling */
        .leaflet-tile-pane {
            filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9);
        }
        /* User marker pulse animation */
        .user-marker {
            width: 20px;
            height: 20px;
            background: #22d3ee;
            border-radius: 50%;
            border: 3px solid #fff;
            box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
        }
        .user-marker-pulse {
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(34, 211, 238, 0.3);
            border-radius: 50%;
            top: -10px;
            left: -10px;
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
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        // Initialize map
        var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([${initialLat}, ${initialLng}], 17);

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

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

            // Center map on first location or if user is near edge
            if (isFirstLocation) {
                map.setView([lat, lng], 17);
                isFirstLocation = false;
            } else {
                // Pan smoothly if marker is getting near edge of view
                var bounds = map.getBounds();
                var padding = 0.3;
                var latPad = (bounds.getNorth() - bounds.getSouth()) * padding;
                var lngPad = (bounds.getEast() - bounds.getWest()) * padding;

                if (lat > bounds.getNorth() - latPad ||
                    lat < bounds.getSouth() + latPad ||
                    lng > bounds.getEast() - lngPad ||
                    lng < bounds.getWest() + lngPad) {
                    map.panTo([lat, lng]);
                }
            }
        };

        // Update path/trail
        window.updatePath = function(coords) {
            if (pathLine) {
                map.removeLayer(pathLine);
                pathLine = null;
            }
            if (coords && coords.length > 1) {
                pathLine = L.polyline(coords, {
                    color: '#22d3ee',
                    weight: 4,
                    opacity: 0.8,
                    lineJoin: 'round'
                }).addTo(map);
            }
        };

        // Clear path completely
        window.clearPath = function() {
            if (pathLine) {
                map.removeLayer(pathLine);
                pathLine = null;
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
            if (event.nativeEvent.data === 'mapReady') {
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
            }
        } catch (err) {
            console.error('Error handling WebView message:', err);
        }
    };

    const handleError = (syntheticEvent: any) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView error:', nativeEvent);
        setWebViewError(nativeEvent.description || 'Map failed to load');
    };

    const handleHttpError = (syntheticEvent: any) => {
        const { nativeEvent } = syntheticEvent;
        console.error('WebView HTTP error:', nativeEvent);
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
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                scalesPageToFit={true}
                scrollEnabled={false}
                bounces={false}
                overScrollMode="never"
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                androidLayerType="hardware"
                cacheEnabled={true}
                cacheMode="LOAD_CACHE_ELSE_NETWORK"
            />
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
});

// Memoize to prevent unnecessary re-renders
const MapContainer = React.memo(MapContainerComponent, (prevProps, nextProps) => {
    // Compare location
    const prevLoc = prevProps.location;
    const nextLoc = nextProps.location;
    const locationSame = (prevLoc === null && nextLoc === null) ||
        (prevLoc !== null && nextLoc !== null &&
         prevLoc.lat === nextLoc.lat && prevLoc.lng === nextLoc.lng);

    // Compare path - check both length and last point (for tracking updates)
    const prevPath = prevProps.path || [];
    const nextPath = nextProps.path || [];
    const pathSame = prevPath.length === nextPath.length &&
        (prevPath.length === 0 ||
         (prevPath[prevPath.length - 1]?.lat === nextPath[nextPath.length - 1]?.lat &&
          prevPath[prevPath.length - 1]?.lng === nextPath[nextPath.length - 1]?.lng));

    // Compare territories
    const prevTerritories = prevProps.territories || [];
    const nextTerritories = nextProps.territories || [];
    const territoriesSame = prevTerritories.length === nextTerritories.length &&
        prevTerritories.every((t, i) => t.id === nextTerritories[i]?.id);

    return locationSame && pathSame && territoriesSame;
});

export default MapContainer;
