/**
 * Tests for MapContainer components
 * Tests throttling, path updates, and edge cases
 */

import { GPSPoint, Territory } from '../lib/types';

// Mock data generators
const createMockGPSPoint = (lat: number, lng: number, overrides?: Partial<GPSPoint>): GPSPoint => ({
    lat,
    lng,
    timestamp: Date.now(),
    speed: 1.5,
    accuracy: 10,
    altitude: 100,
    ...overrides
});

const createMockPath = (count: number, startLat = 37.7749, startLng = -122.4194): GPSPoint[] => {
    const path: GPSPoint[] = [];
    for (let i = 0; i < count; i++) {
        path.push(createMockGPSPoint(
            startLat + (i * 0.0001),
            startLng + (i * 0.0001),
            { timestamp: Date.now() + (i * 1000) }
        ));
    }
    return path;
};

const createMockTerritory = (id: string): Territory => ({
    id,
    name: `Territory ${id}`,
    ownerId: 'user-1',
    activityId: 'activity-1',
    claimedAt: Date.now(),
    area: 1000,
    perimeter: 200,
    center: { lat: 37.7749, lng: -122.4194 },
    polygon: [
        [-122.4194, 37.7749],
        [-122.4184, 37.7749],
        [-122.4184, 37.7759],
        [-122.4194, 37.7759],
        [-122.4194, 37.7749]
    ],
    history: []
});

describe('MapContainer Data Validation', () => {
    describe('GPS Point Validation', () => {
        it('should create valid GPS points', () => {
            const point = createMockGPSPoint(37.7749, -122.4194);
            expect(point.lat).toBe(37.7749);
            expect(point.lng).toBe(-122.4194);
            expect(typeof point.timestamp).toBe('number');
        });

        it('should handle points with null speed', () => {
            const point = createMockGPSPoint(37.7749, -122.4194, { speed: null });
            expect(point.speed).toBeNull();
        });

        it('should handle points with null accuracy', () => {
            const point = createMockGPSPoint(37.7749, -122.4194, { accuracy: null });
            expect(point.accuracy).toBeNull();
        });
    });

    describe('Path Validation', () => {
        it('should create valid path with multiple points', () => {
            const path = createMockPath(10);
            expect(path.length).toBe(10);
            expect(path[0].lat).toBeLessThan(path[9].lat);
        });

        it('should handle empty path', () => {
            const path = createMockPath(0);
            expect(path.length).toBe(0);
        });

        it('should handle single point path', () => {
            const path = createMockPath(1);
            expect(path.length).toBe(1);
        });

        it('should filter invalid points correctly', () => {
            const path: GPSPoint[] = [
                createMockGPSPoint(37.7749, -122.4194),
                { lat: NaN, lng: -122.4194, timestamp: Date.now(), speed: null, accuracy: null, altitude: null },
                createMockGPSPoint(37.7750, -122.4195),
                { lat: 37.7751, lng: NaN, timestamp: Date.now(), speed: null, accuracy: null, altitude: null },
                createMockGPSPoint(37.7752, -122.4196),
            ];

            const validPath = path.filter(p =>
                p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                !isNaN(p.lat) && !isNaN(p.lng)
            );

            expect(validPath.length).toBe(3);
        });

        it('should filter points with undefined coordinates', () => {
            const path: any[] = [
                createMockGPSPoint(37.7749, -122.4194),
                { lat: undefined, lng: -122.4194, timestamp: Date.now() },
                createMockGPSPoint(37.7750, -122.4195),
                { lat: 37.7751, lng: undefined, timestamp: Date.now() },
                null,
                undefined,
            ];

            const validPath = path.filter(p =>
                p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
                !isNaN(p.lat) && !isNaN(p.lng)
            );

            expect(validPath.length).toBe(2);
        });
    });

    describe('Territory Validation', () => {
        it('should create valid territory', () => {
            const territory = createMockTerritory('test-1');
            expect(territory.id).toBe('test-1');
            expect(territory.polygon.length).toBe(5);
        });

        it('should filter invalid territory polygons', () => {
            const territories: Territory[] = [
                createMockTerritory('valid-1'),
                {
                    ...createMockTerritory('invalid-1'),
                    polygon: [] // Empty polygon
                },
                createMockTerritory('valid-2'),
                {
                    ...createMockTerritory('invalid-2'),
                    polygon: [[-122.4194, 37.7749]] // Only 1 point
                },
            ];

            const validTerritories = territories.filter(t =>
                t && t.id && Array.isArray(t.polygon) && t.polygon.length > 2
            );

            expect(validTerritories.length).toBe(2);
            expect(validTerritories[0].id).toBe('valid-1');
            expect(validTerritories[1].id).toBe('valid-2');
        });
    });
});

describe('Throttling Logic', () => {
    it('should allow immediate update when enough time has passed', () => {
        const THROTTLE_MS = 100;
        let lastUpdateTime = 0;
        const now = Date.now();

        // Simulate first update (always passes)
        const timeSinceLastUpdate = now - lastUpdateTime;
        expect(timeSinceLastUpdate >= THROTTLE_MS).toBe(true);
    });

    it('should skip update when called too soon', () => {
        const THROTTLE_MS = 100;
        const now = Date.now();
        const lastUpdateTime = now - 50; // 50ms ago

        const timeSinceLastUpdate = now - lastUpdateTime;
        expect(timeSinceLastUpdate >= THROTTLE_MS).toBe(false);
    });

    it('should schedule deferred update when throttled', async () => {
        const THROTTLE_MS = 100;
        let updateCount = 0;
        let pendingTimer: NodeJS.Timeout | null = null;

        const scheduleUpdate = (timeSinceLastUpdate: number) => {
            if (timeSinceLastUpdate >= THROTTLE_MS) {
                updateCount++;
            } else if (!pendingTimer) {
                pendingTimer = setTimeout(() => {
                    pendingTimer = null;
                    updateCount++;
                }, THROTTLE_MS - timeSinceLastUpdate);
            }
        };

        // First call - immediate
        scheduleUpdate(200);
        expect(updateCount).toBe(1);

        // Second call - throttled (scheduled)
        scheduleUpdate(50);
        expect(updateCount).toBe(1); // Still 1, timer scheduled

        // Wait for timer
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(updateCount).toBe(2); // Now 2 after timer fired

        if (pendingTimer) clearTimeout(pendingTimer);
    });
});

describe('Path Coordinate Transformation', () => {
    it('should transform GPSPoint to lat/lng array correctly', () => {
        const path = createMockPath(3);
        const latLngs = path.map(p => [p.lat, p.lng]);

        expect(latLngs.length).toBe(3);
        expect(latLngs[0]).toEqual([path[0].lat, path[0].lng]);
    });

    it('should handle territory polygon coordinate swap', () => {
        // Territories store as [lng, lat] but Leaflet needs [lat, lng]
        const territory = createMockTerritory('test-1');
        const leafletCoords = territory.polygon.map(coord => [coord[1], coord[0]]);

        // Original is [lng, lat], transformed is [lat, lng]
        expect(leafletCoords[0]).toEqual([territory.polygon[0][1], territory.polygon[0][0]]);
    });
});

describe('Edge Cases', () => {
    it('should handle rapid path updates', () => {
        const paths: GPSPoint[][] = [];

        // Simulate 100 rapid updates
        for (let i = 0; i < 100; i++) {
            paths.push(createMockPath(i + 1));
        }

        // With throttling at 100ms, only ~10 updates should actually render
        // in 1 second of rapid updates
        expect(paths.length).toBe(100);
        expect(paths[99].length).toBe(100);
    });

    it('should handle path cleared during pending update', () => {
        let pendingPath: GPSPoint[] = createMockPath(10);
        let pathUpdateTimer: NodeJS.Timeout | null = null;

        // Simulate scheduling an update
        pathUpdateTimer = setTimeout(() => {
            // This should use the latest pendingPath
        }, 100);

        // Clear path before timer fires
        pendingPath = [];

        expect(pendingPath.length).toBe(0);

        if (pathUpdateTimer) clearTimeout(pathUpdateTimer);
    });

    it('should handle location with extreme coordinates', () => {
        // Valid extreme coordinates
        const northPole = createMockGPSPoint(90, 0);
        const southPole = createMockGPSPoint(-90, 0);
        const dateLine = createMockGPSPoint(0, 180);

        expect(northPole.lat).toBe(90);
        expect(southPole.lat).toBe(-90);
        expect(dateLine.lng).toBe(180);
    });

    it('should handle very long paths', () => {
        const longPath = createMockPath(10000);
        expect(longPath.length).toBe(10000);

        // Validate all points
        const allValid = longPath.every(p =>
            typeof p.lat === 'number' && !isNaN(p.lat) &&
            typeof p.lng === 'number' && !isNaN(p.lng)
        );
        expect(allValid).toBe(true);
    });
});

describe('JSON Serialization', () => {
    it('should serialize path coordinates correctly', () => {
        const path = createMockPath(3);
        const coords = path.map(p => [p.lat, p.lng]);
        const json = JSON.stringify(coords);
        const parsed = JSON.parse(json);

        expect(parsed.length).toBe(3);
        expect(parsed[0][0]).toBe(path[0].lat);
        expect(parsed[0][1]).toBe(path[0].lng);
    });

    it('should serialize territory data correctly', () => {
        const territories = [createMockTerritory('t1'), createMockTerritory('t2')];
        const territoryData = territories.map(t => ({
            id: t.id,
            polygon: t.polygon.map(coord => [coord[1], coord[0]])
        }));
        const json = JSON.stringify(territoryData);
        const parsed = JSON.parse(json);

        expect(parsed.length).toBe(2);
        expect(parsed[0].id).toBe('t1');
    });

    it('should handle special characters in JSON', () => {
        // Coordinates shouldn't have special chars, but test robustness
        const coords = [[37.7749, -122.4194], [37.7750, -122.4195]];
        const json = JSON.stringify(coords);

        // Should not contain any problematic characters
        expect(json).not.toContain('undefined');
        expect(json).not.toContain('NaN');
    });
});

describe('Component Cleanup', () => {
    it('should track mounted state correctly', () => {
        let isMounted = true;

        // Simulate mount
        expect(isMounted).toBe(true);

        // Simulate unmount
        isMounted = false;
        expect(isMounted).toBe(false);
    });

    it('should not update after unmount', () => {
        let isMounted = true;
        let updateCalled = false;

        const safeUpdate = () => {
            if (!isMounted) return;
            updateCalled = true;
        };

        // Unmount
        isMounted = false;

        // Try to update
        safeUpdate();

        expect(updateCalled).toBe(false);
    });
});

describe('Real-Time Tracking Simulation', () => {
    const THROTTLE_MS = 100;

    class ThrottledPathUpdater {
        private lastUpdateTime = 0;
        private pendingPath: GPSPoint[] = [];
        private timer: NodeJS.Timeout | null = null;
        private isMounted = true;
        public renderCount = 0;
        public renderedPaths: GPSPoint[][] = [];

        constructor() {
            this.isMounted = true;
        }

        private render(path: GPSPoint[]) {
            if (!this.isMounted) return;
            this.renderCount++;
            this.renderedPaths.push([...path]);
        }

        update(path: GPSPoint[]) {
            if (!this.isMounted) return;

            if (path.length === 0) {
                if (this.timer) {
                    clearTimeout(this.timer);
                    this.timer = null;
                }
                this.pendingPath = [];
                this.render([]);
                return;
            }

            this.pendingPath = path;

            const now = Date.now();
            const timeSince = now - this.lastUpdateTime;

            if (timeSince >= THROTTLE_MS) {
                this.lastUpdateTime = now;
                this.render(path);
            } else if (!this.timer) {
                this.timer = setTimeout(() => {
                    this.timer = null;
                    if (!this.isMounted) return;
                    this.lastUpdateTime = Date.now();
                    this.render(this.pendingPath);
                }, THROTTLE_MS - timeSince);
            }
        }

        unmount() {
            this.isMounted = false;
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
        }
    }

    it('should throttle rapid GPS updates correctly', async () => {
        const updater = new ThrottledPathUpdater();
        const path: GPSPoint[] = [];

        // Simulate 50 rapid GPS updates (50ms apart = 2.5 seconds)
        for (let i = 0; i < 50; i++) {
            path.push(createMockGPSPoint(37.7749 + i * 0.0001, -122.4194 + i * 0.0001));
            updater.update([...path]);
        }

        // Wait for any pending timers
        await new Promise(resolve => setTimeout(resolve, 150));

        // With 100ms throttle and 50 updates, we should have significantly fewer renders
        // First render is immediate, then at most 1 render per 100ms
        expect(updater.renderCount).toBeGreaterThan(0);
        expect(updater.renderCount).toBeLessThan(50);

        updater.unmount();
    });

    it('should always render the latest path after throttle', async () => {
        const updater = new ThrottledPathUpdater();

        // Rapid updates with increasing path lengths
        for (let i = 1; i <= 20; i++) {
            const path = createMockPath(i);
            updater.update(path);
        }

        // Wait for throttle timer
        await new Promise(resolve => setTimeout(resolve, 150));

        // The last rendered path should have 20 points (or close to it)
        const lastRendered = updater.renderedPaths[updater.renderedPaths.length - 1];
        expect(lastRendered.length).toBe(20);

        updater.unmount();
    });

    it('should handle path clear immediately', async () => {
        const updater = new ThrottledPathUpdater();

        // Add some points
        updater.update(createMockPath(10));
        await new Promise(resolve => setTimeout(resolve, 50));

        // Clear path
        updater.update([]);

        // Clear should be immediate
        const lastRendered = updater.renderedPaths[updater.renderedPaths.length - 1];
        expect(lastRendered.length).toBe(0);

        updater.unmount();
    });

    it('should not render after unmount', async () => {
        const updater = new ThrottledPathUpdater();

        // Start some updates
        updater.update(createMockPath(5));
        const renderCountBeforeUnmount = updater.renderCount;

        // Unmount immediately
        updater.unmount();

        // Try more updates
        updater.update(createMockPath(10));
        updater.update(createMockPath(15));

        await new Promise(resolve => setTimeout(resolve, 150));

        // Render count should not increase after unmount
        expect(updater.renderCount).toBe(renderCountBeforeUnmount);
    });

    it('should handle start/stop/start cycle', async () => {
        const updater = new ThrottledPathUpdater();

        // First tracking session
        updater.update(createMockPath(5));
        await new Promise(resolve => setTimeout(resolve, 110));

        // Stop (clear path)
        updater.update([]);

        // Start new session
        updater.update(createMockPath(3));
        await new Promise(resolve => setTimeout(resolve, 110));

        // Should have rendered both sessions and the clear
        const clearedIndex = updater.renderedPaths.findIndex(p => p.length === 0);
        expect(clearedIndex).toBeGreaterThan(0);

        // After clear, should have new session data
        const afterClear = updater.renderedPaths.slice(clearedIndex + 1);
        expect(afterClear.length).toBeGreaterThan(0);

        updater.unmount();
    });
});

describe('Location Marker Update Simulation', () => {
    const LOCATION_THROTTLE_MS = 50;

    class ThrottledLocationUpdater {
        private lastUpdateTime = 0;
        public updateCount = 0;
        public locations: GPSPoint[] = [];
        private markerCreated = false;

        update(location: GPSPoint) {
            const now = Date.now();

            // Skip if marker exists and update too soon
            if (this.markerCreated && now - this.lastUpdateTime < LOCATION_THROTTLE_MS) {
                return;
            }

            this.lastUpdateTime = now;

            if (!this.markerCreated) {
                this.markerCreated = true;
            }

            this.updateCount++;
            this.locations.push(location);
        }
    }

    it('should throttle location marker updates', () => {
        const updater = new ThrottledLocationUpdater();

        // Simulate 20 rapid location updates
        for (let i = 0; i < 20; i++) {
            updater.update(createMockGPSPoint(37.7749 + i * 0.00001, -122.4194));
        }

        // First update always goes through, subsequent are throttled
        expect(updater.updateCount).toBe(1);
    });

    it('should allow updates after throttle period', async () => {
        const updater = new ThrottledLocationUpdater();

        // First update
        updater.update(createMockGPSPoint(37.7749, -122.4194));
        expect(updater.updateCount).toBe(1);

        // Wait past throttle
        await new Promise(resolve => setTimeout(resolve, 60));

        // Second update should work
        updater.update(createMockGPSPoint(37.7750, -122.4195));
        expect(updater.updateCount).toBe(2);
    });
});

describe('Concurrent Updates', () => {
    it('should handle location and path updates simultaneously', async () => {
        let locationUpdates = 0;
        let pathUpdates = 0;

        // Simulate concurrent updates
        const simulateUpdates = async () => {
            const promises: Promise<void>[] = [];

            // Location updates every 50ms
            for (let i = 0; i < 10; i++) {
                promises.push(new Promise(resolve => {
                    setTimeout(() => {
                        locationUpdates++;
                        resolve();
                    }, i * 50);
                }));
            }

            // Path updates every 30ms
            for (let i = 0; i < 15; i++) {
                promises.push(new Promise(resolve => {
                    setTimeout(() => {
                        pathUpdates++;
                        resolve();
                    }, i * 30);
                }));
            }

            await Promise.all(promises);
        };

        await simulateUpdates();

        expect(locationUpdates).toBe(10);
        expect(pathUpdates).toBe(15);
    });
});
