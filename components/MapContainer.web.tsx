import * as React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { GPSPoint, Territory } from '../lib/types';

interface MapContainerProps {
    location: GPSPoint | null;
    path: GPSPoint[];
    territories?: Territory[];
    style?: any;
}

// Dark map tiles from CartoDB
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export default function MapContainer({ location, path, territories = [], style }: MapContainerProps) {
    const mapRef = React.useRef<HTMLDivElement>(null);
    const mapInstanceRef = React.useRef<any>(null);
    const markerRef = React.useRef<any>(null);
    const polylineRef = React.useRef<any>(null);
    const territoryLayersRef = React.useRef<any[]>([]);
    const [leaflet, setLeaflet] = React.useState<any>(null);

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
    }, [leaflet]);

    // Update location marker
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current || !location) return;

        const map = mapInstanceRef.current;

        // Create custom cyan marker icon
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

        if (markerRef.current) {
            markerRef.current.setLatLng([location.lat, location.lng]);
        } else {
            markerRef.current = leaflet.marker([location.lat, location.lng], { icon }).addTo(map);
        }

        // Center map on location
        map.setView([location.lat, location.lng], map.getZoom());
    }, [leaflet, location]);

    // Update path polyline
    React.useEffect(() => {
        if (!leaflet || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Remove existing polyline
        if (polylineRef.current) {
            polylineRef.current.remove();
            polylineRef.current = null;
        }

        // Draw new polyline if path exists
        if (path.length > 1) {
            const latLngs = path.map(p => [p.lat, p.lng]);
            polylineRef.current = leaflet.polyline(latLngs, {
                color: '#22d3ee',
                weight: 4,
                opacity: 1,
            }).addTo(map);
        }
    }, [leaflet, path]);

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
                const latLngs = territory.polygon.map(coord => [coord[1], coord[0]]);
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
});
