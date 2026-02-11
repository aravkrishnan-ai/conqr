import * as React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { GPSPoint, Territory } from '../lib/types';

export interface MapContainerHandle {
    centerOnUser: () => void;
}

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    territories?: Territory[];
    currentUserId?: string;
    style?: any;
}

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function MapContainerComponent(
    { location, path, territories = [], currentUserId, style }: MapContainerProps,
    ref: React.Ref<MapContainerHandle>
) {
    const mapRef = React.useRef<HTMLDivElement>(null);
    const mapInstanceRef = React.useRef<any>(null);
    const markerRef = React.useRef<any>(null);
    const polylineRef = React.useRef<any>(null);
    const startMarkerRef = React.useRef<any>(null);
    const territoryLayersRef = React.useRef<any[]>([]);
    const [leaflet, setLeaflet] = React.useState<any>(null);
    const [isLoading, setIsLoading] = React.useState(true);

    const hasInitialCenterRef = React.useRef(false);
    const lastLocationRef = React.useRef<string>('');
    const lastPathLengthRef = React.useRef<number>(0);
    const isMountedRef = React.useRef(true);

    // Throttle refs
    const locationThrottleRef = React.useRef<number>(0);
    const pathThrottleRef = React.useRef<number>(0);

    React.useImperativeHandle(ref, () => ({
        centerOnUser: () => {
            if (mapInstanceRef.current && markerRef.current) {
                mapInstanceRef.current.setView(markerRef.current.getLatLng(), mapInstanceRef.current.getZoom());
            }
        },
    }), []);

    // Load Leaflet
    React.useEffect(() => {
        if (typeof window === 'undefined') return;

        const linkId = 'leaflet-css';
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        import('leaflet').then((L) => {
            setLeaflet(L.default || L);
        });

        return () => { isMountedRef.current = false; };
    }, []);

    // Initialize map
    React.useEffect(() => {
        if (!leaflet || !mapRef.current || mapInstanceRef.current) return;

        const map = leaflet.map(mapRef.current, {
            center: [37.7749, -122.4194],
            zoom: 16,
            zoomControl: false,
            attributionControl: false,
        });

        leaflet.tileLayer(DARK_TILE_URL, {
            maxZoom: 19,
            subdomains: 'abcd',
        }).addTo(map);

        mapInstanceRef.current = map;
        setTimeout(() => setIsLoading(false), 500);

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [leaflet]);

    // Update location
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current || !location) return;

        const key = `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
        if (key === lastLocationRef.current) return;

        const now = Date.now();
        if (now - locationThrottleRef.current < 200) return;

        locationThrottleRef.current = now;
        lastLocationRef.current = key;

        const map = mapInstanceRef.current;

        if (!markerRef.current) {
            const icon = leaflet.divIcon({
                className: 'user-marker',
                html: `<div style="
                    width: 16px; height: 16px;
                    background: #FC4C02;
                    border-radius: 50%;
                    border: 3px solid #fff;
                    box-shadow: 0 0 0 3px rgba(252,76,2,0.3);
                "></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
            });
            markerRef.current = leaflet.marker([location.lat, location.lng], { icon, interactive: false }).addTo(map);
        } else {
            markerRef.current.setLatLng([location.lat, location.lng]);
        }

        if (!hasInitialCenterRef.current) {
            map.setView([location.lat, location.lng], 17, { animate: false });
            hasInitialCenterRef.current = true;
        }
    }, [leaflet, location]);

    // Update path
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current) return;

        const now = Date.now();
        if (now - pathThrottleRef.current < 300 && path.length > 0) return;
        pathThrottleRef.current = now;

        const map = mapInstanceRef.current;
        const validPath = path.filter(p => p && !isNaN(p.lat) && !isNaN(p.lng));

        if (validPath.length === 0) {
            if (polylineRef.current) { polylineRef.current.remove(); polylineRef.current = null; }
            if (startMarkerRef.current) { startMarkerRef.current.remove(); startMarkerRef.current = null; }
            lastPathLengthRef.current = 0;
            return;
        }

        if (validPath.length === lastPathLengthRef.current) return;
        lastPathLengthRef.current = validPath.length;

        const latLngs = validPath.map(p => [p.lat, p.lng]);

        if (!startMarkerRef.current) {
            const startIcon = leaflet.divIcon({
                className: 'start-marker',
                html: '<div style="width:12px;height:12px;background:#00D26A;border-radius:50%;border:2px solid #fff;"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });
            startMarkerRef.current = leaflet.marker(latLngs[0], { icon: startIcon, interactive: false }).addTo(map);
        }

        if (validPath.length >= 2) {
            if (polylineRef.current) {
                polylineRef.current.setLatLngs(latLngs);
            } else {
                polylineRef.current = leaflet.polyline(latLngs, {
                    color: '#FC4C02',
                    weight: 4,
                    opacity: 1,
                    lineJoin: 'round',
                    lineCap: 'round'
                }).addTo(map);
            }
        }
    }, [leaflet, path]);

    // Deterministic color palette for user territories (matches native MapContainer)
    const userColor = React.useCallback((userId: string | undefined) => {
        const USER_COLORS = [
            '#FC4C02', '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
            '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
            '#6366F1', '#14B8A6', '#E879F9', '#22D3EE', '#A3E635',
            '#FB923C', '#818CF8', '#2DD4BF', '#C084FC', '#34D399'
        ];
        if (!userId) return '#888888';
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = ((hash << 5) - hash) + userId.charCodeAt(i);
            hash = hash & hash;
        }
        return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
    }, []);

    // Update territories
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        territoryLayersRef.current.forEach(layer => layer.remove());
        territoryLayersRef.current = [];

        territories.forEach(territory => {
            if (territory.polygon && territory.polygon.length > 2) {
                const isOwn = currentUserId && territory.ownerId === currentUserId;
                const color = isOwn ? '#FC4C02' : userColor(territory.ownerId);
                
                const latLngs = territory.polygon
                    .filter(c => Array.isArray(c) && c.length >= 2 && !isNaN(c[0]) && !isNaN(c[1]))
                    .map(c => [c[1], c[0]]);
                const polygon = leaflet.polygon(latLngs, {
                    color: color,
                    weight: 2,
                    opacity: 0.8,
                    fillColor: color,
                    fillOpacity: isOwn ? 0.2 : 0.12,
                }).addTo(map);
                territoryLayersRef.current.push(polygon);
            }
        });
    }, [leaflet, territories, currentUserId]);

    return (
        <View style={[styles.container, style]}>
            <div ref={mapRef} style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#FC4C02" />
                </View>
            )}
            <style>{`
                .user-marker, .start-marker { background: transparent !important; border: none !important; }
                .leaflet-marker-icon { transition: transform 0.2s ease-out !important; }
            `}</style>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
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
