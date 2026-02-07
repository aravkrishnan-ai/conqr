import { GPSPoint } from '../lib/types';

// Constants
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;
export const BRAND_COLOR = '#E65100';
export const BRAND_COLOR_LIGHT = 'rgba(230, 81, 0, 0.3)';
export const ROUTE_COLOR = '#FFFFFF';
export const ROUTE_GLOW_COLOR = 'rgba(230, 81, 0, 0.4)';
export const START_COLOR = '#00D26A';
export const END_COLOR = '#E65100';
export const DOWNLOAD_TEXT = 'Download Conqr Beta';
export const DOWNLOAD_URL = 'https://expo.dev/artifacts/eas/rhkn636AALABimuEmqTL4Z.apk';

// Format functions
export const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(2)} km`;
};

export const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatPace = (speedMs: number): string => {
    if (!speedMs || speedMs <= 0) return '--:--';
    const paceSecondsPerKm = 1000 / speedMs;
    const minutes = Math.floor(paceSecondsPerKm / 60);
    const seconds = Math.floor(paceSecondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatArea = (sqMeters: number): string => {
    if (sqMeters < 10000) return `${Math.round(sqMeters)} m²`;
    return `${(sqMeters / 10000).toFixed(2)} ha`;
};

export const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

// GPS coordinate to SVG coordinate mapping
export function gpsPointsToSvgPath(
    points: { lat: number; lng: number }[],
    svgWidth: number,
    svgHeight: number,
    padding: number = 0.15,
): { points: string; startPoint: { x: number; y: number }; endPoint: { x: number; y: number } } {
    if (!points || points.length === 0) {
        return { points: '', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } };
    }

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
    }

    // Cosine correction for longitude distortion
    const centerLat = (minLat + maxLat) / 2;
    const cosLat = Math.cos(centerLat * Math.PI / 180);

    let latRange = maxLat - minLat;
    let lngRange = (maxLng - minLng) * cosLat;

    // Handle degenerate cases
    if (latRange < 0.0001) latRange = 0.0001;
    if (lngRange < 0.0001) lngRange = 0.0001;

    // Add padding
    const padLat = latRange * padding;
    const padLng = lngRange * padding / cosLat;
    minLat -= padLat; maxLat += padLat;
    minLng -= padLng; maxLng += padLng;
    latRange = maxLat - minLat;
    lngRange = maxLng - minLng;

    // Fit to viewport maintaining aspect ratio
    const lngRangeCorrected = lngRange * cosLat;
    const gpsAspect = lngRangeCorrected / latRange;
    const svgAspect = svgWidth / svgHeight;

    let scaleX: number, scaleY: number, offsetX = 0, offsetY = 0;
    if (gpsAspect > svgAspect) {
        scaleX = svgWidth / lngRangeCorrected;
        scaleY = scaleX;
        offsetY = (svgHeight - latRange * scaleY) / 2;
    } else {
        scaleY = svgHeight / latRange;
        scaleX = scaleY;
        offsetX = (svgWidth - lngRangeCorrected * scaleX) / 2;
    }

    const toSvg = (lat: number, lng: number) => ({
        x: ((lng - minLng) * cosLat) * scaleX + offsetX,
        y: ((maxLat - lat)) * scaleY + offsetY,
    });

    const svgPoints = points.map(p => {
        const { x, y } = toSvg(p.lat, p.lng);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const first = toSvg(points[0].lat, points[0].lng);
    const last = toSvg(points[points.length - 1].lat, points[points.length - 1].lng);

    return {
        points: svgPoints.join(' '),
        startPoint: first,
        endPoint: last,
    };
}

// Territory polygon to SVG polygon
export function territoryPolygonToSvg(
    polygon: [number, number][], // [lng, lat] GeoJSON format
    svgWidth: number,
    svgHeight: number,
    padding: number = 0.15,
): { points: string; center: { x: number; y: number } } {
    if (!polygon || polygon.length === 0) {
        return { points: '', center: { x: svgWidth / 2, y: svgHeight / 2 } };
    }

    // Convert [lng, lat] to {lat, lng}
    const coords = polygon.map(([lng, lat]) => ({ lat, lng }));
    const result = gpsPointsToSvgPath(coords, svgWidth, svgHeight, padding);

    // Calculate center
    let sumX = 0, sumY = 0;
    const svgPts = result.points.split(' ').map(p => {
        const [x, y] = p.split(',').map(Number);
        sumX += x;
        sumY += y;
        return { x, y };
    });

    return {
        points: result.points,
        center: {
            x: svgPts.length > 0 ? sumX / svgPts.length : svgWidth / 2,
            y: svgPts.length > 0 ? sumY / svgPts.length : svgHeight / 2,
        },
    };
}

// Flatten polylines (same as ActivityService but standalone)
export function flattenPolylines(polylines: GPSPoint[][]): GPSPoint[] {
    if (!polylines) return [];
    const flat: GPSPoint[] = [];
    for (const segment of polylines) {
        if (Array.isArray(segment)) {
            flat.push(...segment);
        }
    }
    return flat;
}
