import * as React from 'react';
import { View, StyleSheet } from 'react-native';
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

// Dark map tiles from CartoDB
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function MapContainerComponent({ location, path, territories = [], style }: MapContainerProps, ref: React.Ref<MapContainerHandle>) {
    const mapRef = React.useRef<HTMLDivElement>(null);
    const mapInstanceRef = React.useRef<any>(null);
    const markerRef = React.useRef<any>(null);
    const polylineRef = React.useRef<any>(null);
    const territoryLayersRef = React.useRef<any[]>([]);
    const [leaflet, setLeaflet] = React.useState<any>(null);

    // Throttle path updates to prevent glitchy rendering
    const lastPathUpdateRef = React.useRef<number>(0);
    const pendingPathRef = React.useRef<GPSPoint[]>([]);
    const pathUpdateTimerRef = React.useRef<any>(null);
    const PATH_UPDATE_THROTTLE_MS = 100; // Update path at most every 100ms

    React.useImperativeHandle(ref, () => ({
        centerOnUser: () => {
            if (mapInstanceRef.current && markerRef.current) {
                mapInstanceRef.current.setView(markerRef.current.getLatLng(), mapInstanceRef.current.getZoom());
            }
        },
    }), []);

    // Load Leaflet dynamically
    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        // Add Leaflet CSS
        const linkId = 'leaflet-css';
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        // Load Leaflet JS
        import('leaflet').then((L) => {
            setLeaflet(L.default || L);
        });
    }, []);

    // Initialize map
    React.useEffect(() => {
        if (!leaflet || !mapRef.current || mapInstanceRef.current) return;

        const initialCenter = location
            ? [location.lat, location.lng]
            : [39.8, -98.5];
        const initialZoom = location ? 16 : 4;

        const map = leaflet.map(mapRef.current, {
            center: initialCenter,
            zoom: initialZoom,
            zoomControl: false,
            attributionControl: false,
        });

        leaflet.tileLayer(DARK_TILE_URL, {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(map);

        // Add zoom control to bottom right
        leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location is only for initial center; re-running would destroy the map
    }, [leaflet]);

    // Track if we've centered on user initially
    const hasInitialCenterRef = React.useRef(false);
    // Throttle location marker updates
    const lastLocationUpdateRef = React.useRef<number>(0);
    const LOCATION_UPDATE_THROTTLE_MS = 50; // Update marker at most every 50ms

    // Update location marker
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current || !location) return;

        const map = mapInstanceRef.current;

        // Throttle marker position updates to prevent glitchy movement
        const now = Date.now();
        if (markerRef.current && now - lastLocationUpdateRef.current < LOCATION_UPDATE_THROTTLE_MS) {
            return; // Skip this update, too soon
        }
        lastLocationUpdateRef.current = now;

        // Create custom cyan marker icon (only once)
        if (!markerRef.current) {
            const markerHtml = `
                <div style="
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: rgba(34, 211, 238, 0.3);
                    border: 2px solid #22d3ee;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">
                    <div style="
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: #22d3ee;
                    "></div>
                </div>
            `;

            const icon = leaflet.divIcon({
                html: markerHtml,
                className: 'custom-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });

            markerRef.current = leaflet.marker([location.lat, location.lng], { icon }).addTo(map);
        } else {
            markerRef.current.setLatLng([location.lat, location.lng]);
        }

        // Only center on first location, not every update (prevents glitchy behavior)
        if (!hasInitialCenterRef.current) {
            map.setView([location.lat, location.lng], map.getZoom());
            hasInitialCenterRef.current = true;
        }
    }, [leaflet, location]);

    // Track start marker for web version
    const startMarkerRef = React.useRef<any>(null);
    // Track last rendered path length to avoid redundant updates
    const lastRenderedPathLengthRef = React.useRef<number>(0);

    // Actual path rendering function
    const renderPath = React.useCallback((pathToRender: GPSPoint[]) => {
        if (!leaflet || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        if (pathToRender.length === 0) {
            // Clear path
            if (polylineRef.current) {
                polylineRef.current.remove();
                polylineRef.current = null;
            }
            if (startMarkerRef.current) {
                startMarkerRef.current.remove();
                startMarkerRef.current = null;
            }
            lastRenderedPathLengthRef.current = 0;
            return;
        }

        // Filter valid points
        const validPath = pathToRender.filter(p =>
            p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
            !isNaN(p.lat) && !isNaN(p.lng)
        );

        if (validPath.length === 0) return;

        const latLngs = validPath.map(p => [p.lat, p.lng]);

        // Update or create start marker (only on first point or when cleared)
        if (!startMarkerRef.current) {
            const startIcon = leaflet.divIcon({
                className: 'start-marker',
                html: '<div style="width:12px;height:12px;background:#10b981;border-radius:50%;border:2px solid #fff;box-shadow:0 0 6px rgba(16,185,129,0.5);"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            startMarkerRef.current = leaflet.marker(latLngs[0], { icon: startIcon }).addTo(map);
        }

        // Update or create polyline if we have 2+ points
        if (validPath.length >= 2) {
            if (polylineRef.current) {
                // Update existing polyline in place - smoother than recreating
                polylineRef.current.setLatLngs(latLngs);
            } else {
                polylineRef.current = leaflet.polyline(latLngs, {
                    color: '#22d3ee',
                    weight: 4,
                    opacity: 1,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(map);
            }
        } else if (polylineRef.current) {
            // Only 1 point, remove line but keep start marker
            polylineRef.current.remove();
            polylineRef.current = null;
        }

        lastRenderedPathLengthRef.current = validPath.length;
    }, [leaflet]);

    // Update path polyline - throttled for smooth updates
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current) return;

        // Handle path cleared
        if (path.length === 0) {
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
    }, [leaflet, path, renderPath]);

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

    // Update territory polygons
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Remove existing territory layers
        territoryLayersRef.current.forEach(layer => {
            layer.remove();
        });
        territoryLayersRef.current = [];

        // Draw territories
        territories.forEach(territory => {
            if (territory.polygon && territory.polygon.length > 2) {
                const latLngs = territory.polygon
                    .filter(coord => Array.isArray(coord) && coord.length >= 2 &&
                        typeof coord[0] === 'number' && typeof coord[1] === 'number' &&
                        !isNaN(coord[0]) && !isNaN(coord[1]))
                    .map(coord => [coord[1], coord[0]]);
                const polygon = leaflet.polygon(latLngs, {
                    color: '#22d3ee',
                    weight: 2,
                    opacity: 0.8,
                    fillColor: '#22d3ee',
                    fillOpacity: 0.2,
                }).addTo(map);
                territoryLayersRef.current.push(polygon);
            }
        });
    }, [leaflet, territories]);

    return (
        <View style={[styles.container, style]}>
            <div
                ref={mapRef}
                style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#1a1a1a'
                }}
            />
            <style>{`
                .custom-marker {
                    background: transparent !important;
                    border: none !important;
                }
                .leaflet-control-zoom {
                    border: none !important;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                }
                .leaflet-control-zoom a {
                    background: rgba(0,0,0,0.8) !important;
                    color: #fff !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                }
                .leaflet-control-zoom a:hover {
                    background: rgba(0,0,0,0.9) !important;
                }
            `}</style>
        </View>
    );
}

const MapContainer = React.forwardRef<MapContainerHandle, MapContainerProps>(MapContainerComponent);
export default MapContainer;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
});
