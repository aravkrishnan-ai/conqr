import * as React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { GPSPoint } from '../lib/types';

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    style?: any;
}

function MapContainerComponent({ location, path, style }: MapContainerProps) {
    const webViewRef = React.useRef<WebView>(null);
    const [mapReady, setMapReady] = React.useState(false);

    // Update map when location changes
    React.useEffect(() => {
        if (mapReady && webViewRef.current && location) {
            const script = `
                if (window.updateLocation) {
                    window.updateLocation(${location.lat}, ${location.lng});
                }
                true;
            `;
            webViewRef.current.injectJavaScript(script);
        }
    }, [location, mapReady]);

    // Update path when it changes
    React.useEffect(() => {
        if (mapReady && webViewRef.current) {
            if (path.length > 0) {
                const pathCoords = JSON.stringify(path.map(p => [p.lat, p.lng]));
                const script = `
                    if (window.updatePath) {
                        window.updatePath(${pathCoords});
                    }
                    true;
                `;
                webViewRef.current.injectJavaScript(script);
            } else {
                // Clear the path when empty
                const script = `
                    if (window.clearPath) {
                        window.clearPath();
                    }
                    true;
                `;
                webViewRef.current.injectJavaScript(script);
            }
        }
    }, [path, mapReady]);

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

        // Signal that map is ready
        window.ReactNativeWebView.postMessage('mapReady');
    </script>
</body>
</html>
    `;

    const handleMessage = (event: any) => {
        if (event.nativeEvent.data === 'mapReady') {
            setMapReady(true);
            // Send initial location if available
            if (location && webViewRef.current) {
                const script = `
                    window.updateLocation(${location.lat}, ${location.lng});
                    true;
                `;
                webViewRef.current.injectJavaScript(script);
            }
        }
    };

    return (
        <View style={[styles.container, style]}>
            <WebView
                ref={webViewRef}
                source={{ html: mapHtml }}
                style={styles.webview}
                onMessage={handleMessage}
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
    // Only re-render if location or path actually changed meaningfully
    const locationSame = prevProps.location?.lat === nextProps.location?.lat &&
                         prevProps.location?.lng === nextProps.location?.lng;
    const pathSame = prevProps.path.length === nextProps.path.length;
    return locationSame && pathSame;
});

export default MapContainer;
