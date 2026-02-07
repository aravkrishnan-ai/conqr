import { GPSPoint, ActivityType, Territory, TerritoryInvasion, ConquerResult } from '../lib/types';
import { getDistance } from 'geolib';
import { polygon, area, unkinkPolygon, rewind, centroid, length, lineString, intersect, difference, featureCollection } from '@turf/turf';
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
        if (!Array.isArray(path) || path.length < 10) {
            return { isClosed: false, distance: Infinity };
        }

        const start = path[0];
        const end = path[path.length - 1];

        // Validate start and end points (NaN is typeof 'number', so check explicitly)
        if (!start || !end ||
            typeof start.lat !== 'number' || typeof start.lng !== 'number' ||
            typeof end.lat !== 'number' || typeof end.lng !== 'number' ||
            isNaN(start.lat) || isNaN(start.lng) ||
            isNaN(end.lat) || isNaN(end.lng)) {
            return { isClosed: false, distance: Infinity };
        }

        try {
            const dist = getDistance(
                { latitude: start.lat, longitude: start.lng },
                { latitude: end.lat, longitude: end.lng }
            );
            return { isClosed: dist <= 200, distance: dist };
        } catch (err) {
            console.error('Error checking loop closure:', err);
            return { isClosed: false, distance: Infinity };
        }
    },

    calculateArea(path: GPSPoint[]): number {
        if (!Array.isArray(path) || path.length < 3) return 0;

        // Filter out invalid points
        const validPath = path.filter(p =>
            p && typeof p.lng === 'number' && typeof p.lat === 'number' &&
            !isNaN(p.lng) && !isNaN(p.lat)
        );

        if (validPath.length < 3) return 0;

        const coords = validPath.map(p => [p.lng, p.lat]);
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push(coords[0]);
        }
        try {
            return area(polygon([coords]));
        } catch (err) {
            console.error('Error calculating area:', err);
            return 0;
        }
    },

    processTerritory(path: GPSPoint[], ownerId: string, activityId: string): Territory | null {
        if (!Array.isArray(path) || path.length < 10) return null;
        if (!this.checkLoopClosure(path).isClosed) return null;

        // Filter out invalid points
        const validPath = path.filter(p =>
            p && typeof p.lng === 'number' && typeof p.lat === 'number' &&
            !isNaN(p.lng) && !isNaN(p.lat)
        );

        if (validPath.length < 10) return null;

        const coords = validPath.map(p => [p.lng, p.lat]);

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
    },

    resolveOverlaps(
        newTerritory: Territory,
        existingTerritories: Territory[],
        invaderUsername?: string
    ): ConquerResult {
        const result: ConquerResult = {
            newTerritory,
            modifiedTerritories: [],
            deletedTerritoryIds: [],
            invasions: [],
            totalConqueredArea: 0,
        };

        // Build the new territory's Turf polygon
        const newCoords: number[][] = [...newTerritory.polygon];
        if (newCoords.length < 3) return result;

        // Ensure ring is closed
        if (newCoords[0][0] !== newCoords[newCoords.length - 1][0] ||
            newCoords[0][1] !== newCoords[newCoords.length - 1][1]) {
            newCoords.push(newCoords[0]);
        }

        let newPoly;
        try {
            newPoly = polygon([newCoords]);
        } catch (e) {
            console.error('Failed to create polygon for new territory:', e);
            return result;
        }

        // Only process other users' territories
        const otherTerritories = existingTerritories.filter(
            t => t.ownerId !== newTerritory.ownerId
        );

        for (const existing of otherTerritories) {
            if (!existing.polygon || existing.polygon.length < 3) continue;

            try {
                const existCoords: number[][] = [...existing.polygon];
                if (existCoords[0][0] !== existCoords[existCoords.length - 1][0] ||
                    existCoords[0][1] !== existCoords[existCoords.length - 1][1]) {
                    existCoords.push(existCoords[0]);
                }
                const existPoly = polygon([existCoords]);

                // Check for intersection
                const overlap = intersect(featureCollection([newPoly, existPoly]));
                if (!overlap) continue;

                const overlapArea = area(overlap);
                if (overlapArea < 1) continue; // GPS noise, skip

                // Subtract new territory from existing
                const diff = difference(featureCollection([existPoly, newPoly]));

                if (!diff) {
                    // Existing territory fully consumed
                    result.deletedTerritoryIds.push(existing.id);
                    result.totalConqueredArea += existing.area;

                    result.invasions.push({
                        id: '',
                        invadedUserId: existing.ownerId,
                        invaderUserId: newTerritory.ownerId,
                        invaderUsername,
                        invadedTerritoryId: existing.id,
                        newTerritoryId: newTerritory.id,
                        overlapArea: existing.area,
                        territoryWasDestroyed: true,
                        createdAt: Date.now(),
                        seen: false,
                    });
                } else {
                    // Territory was partially consumed
                    let remainingCoords: number[][];

                    if (diff.geometry.type === 'MultiPolygon') {
                        // Pick the largest fragment
                        let maxArea = 0;
                        let maxRing: number[][] = [];
                        for (const ring of diff.geometry.coordinates) {
                            const ringPoly = polygon(ring as number[][][]);
                            const ringArea = area(ringPoly);
                            if (ringArea > maxArea) {
                                maxArea = ringArea;
                                maxRing = ring[0] as number[][];
                            }
                        }
                        remainingCoords = maxRing;
                    } else {
                        remainingCoords = diff.geometry.coordinates[0] as number[][];
                    }

                    // Recalculate stats for modified territory
                    const modifiedPoly = rewind(polygon([remainingCoords]));
                    const modifiedArea = area(modifiedPoly);
                    const modifiedCenter = centroid(modifiedPoly);
                    const modifiedPerimeter = length(lineString(remainingCoords), { units: 'meters' });

                    const modifiedTerritory: Territory = {
                        ...existing,
                        polygon: remainingCoords as [number, number][],
                        area: modifiedArea,
                        perimeter: modifiedPerimeter,
                        center: {
                            lat: modifiedCenter.geometry.coordinates[1],
                            lng: modifiedCenter.geometry.coordinates[0],
                        },
                        history: [
                            ...(existing.history || []),
                            {
                                previousOwnerId: existing.ownerId,
                                claimedBy: newTerritory.ownerId,
                                claimedAt: Date.now(),
                                activityId: newTerritory.activityId,
                            }
                        ],
                    };

                    result.modifiedTerritories.push(modifiedTerritory);
                    result.totalConqueredArea += overlapArea;

                    result.invasions.push({
                        id: '',
                        invadedUserId: existing.ownerId,
                        invaderUserId: newTerritory.ownerId,
                        invaderUsername,
                        invadedTerritoryId: existing.id,
                        newTerritoryId: newTerritory.id,
                        overlapArea,
                        territoryWasDestroyed: false,
                        createdAt: Date.now(),
                        seen: false,
                    });
                }
            } catch (e) {
                console.error('Error processing overlap with territory:', existing.id, e);
                continue;
            }
        }

        return result;
    }
};
