import { GPSPoint, ActivityType, Territory } from '../lib/types';
import { getDistance } from 'geolib';
import { polygon, area, unkinkPolygon, rewind, centroid, length, lineString } from '@turf/turf';
import { v4 as uuidv4 } from 'uuid';

// Constraints
const SPEED_LIMITS = {
    WALK: { min: 0, max: 7 / 3.6 }, // Increased slightly for loose GPS
    RUN: { min: 5 / 3.6, max: 25 / 3.6 },
    RIDE: { min: 10 / 3.6, max: 50 / 3.6 }
};

export const GameEngine = {
    validateSpeed(point: GPSPoint, type: ActivityType) {
        if (point.speed === null || point.speed === undefined) return { valid: true };

        const limit = SPEED_LIMITS[type];
        const ms = point.speed;

        if (ms > limit.max) {
            if (type === 'WALK') return { valid: false, reason: 'TOO_FAST_FOR_WALK', suggested: 'RUN' };
            if (type === 'RUN') return { valid: false, reason: 'TOO_FAST_FOR_RUN', suspicious: true };
            if (type === 'RIDE') return { valid: false, reason: 'TOO_FAST_FOR_RIDE', suspicious: true };
        }

        return { valid: true };
    },

    checkLoopClosure(path: GPSPoint[]): { isClosed: boolean, distance: number } {
        if (path.length < 10) return { isClosed: false, distance: Infinity };

        const start = path[0];
        const end = path[path.length - 1];

        const dist = getDistance(
            { latitude: start.lat, longitude: start.lng },
            { latitude: end.lat, longitude: end.lng }
        );

        return { isClosed: dist <= 200, distance: dist };
    },

    calculateArea(path: GPSPoint[]): number {
        const coords = path.map(p => [p.lng, p.lat]);
        if (coords.length < 3) return 0;
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }
        try {
            return area(polygon([coords]));
        } catch { return 0; }
    },

    processTerritory(path: GPSPoint[], ownerId: string, activityId: string): Territory | null {
        if (!this.checkLoopClosure(path).isClosed) return null;

        const coords = path.map(p => [p.lng, p.lat]);

        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }

        try {
            let turfPoly = polygon([coords]);
            const unkinked = unkinkPolygon(turfPoly);

            if (unkinked.features.length > 0) {
                let maxArea = 0;
                let maxFeature = unkinked.features[0];

                for (const feature of unkinked.features) {
                    const featureArea = area(feature);
                    if (featureArea > maxArea) {
                        maxArea = featureArea;
                        maxFeature = feature;
                    }
                }
                turfPoly = maxFeature as any;
            }

            turfPoly = rewind(turfPoly) as any;
            const polyArea = area(turfPoly);

            if (polyArea < 10) return null;

            const finalCoords = turfPoly.geometry.coordinates[0];
            // Calculate proper centroid instead of using first point
            const centerPoint = centroid(turfPoly);
            const center = {
                lat: centerPoint.geometry.coordinates[1],
                lng: centerPoint.geometry.coordinates[0]
            };

            // Calculate perimeter from the polygon boundary
            const perimeterLine = lineString(finalCoords);
            const perimeterLength = length(perimeterLine, { units: 'meters' });

            return {
                id: uuidv4(),
                name: '',
                ownerId,
                activityId,
                claimedAt: Date.now(),
                area: polyArea,
                perimeter: perimeterLength,
                center,
                polygon: finalCoords as [number, number][],
                history: [{
                    claimedBy: ownerId,
                    claimedAt: Date.now(),
                    activityId
                }]
            };
        } catch (e) {
            console.error('Invalid polygon', e);
            return null;
        }
    }
};
