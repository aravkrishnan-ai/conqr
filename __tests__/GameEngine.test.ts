import { GameEngine } from '../services/GameEngine';
import { GPSPoint } from '../lib/types';

describe('GameEngine', () => {
  const createGPSPoint = (lat: number, lng: number, speed: number | null = 1.5): GPSPoint => ({
    lat,
    lng,
    timestamp: Date.now(),
    speed,
    accuracy: 10,
    altitude: 0,
  });

  // Create a simple square path (closed loop)
  const createSquarePath = (centerLat: number, centerLng: number, size: number = 0.001): GPSPoint[] => {
    const halfSize = size / 2;
    const points: GPSPoint[] = [];

    // Create a square with 5 points per side (20 points total for a closed loop)
    const corners = [
      [centerLat - halfSize, centerLng - halfSize],
      [centerLat - halfSize, centerLng + halfSize],
      [centerLat + halfSize, centerLng + halfSize],
      [centerLat + halfSize, centerLng - halfSize],
    ];

    for (let c = 0; c < corners.length; c++) {
      const nextC = (c + 1) % corners.length;
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        points.push(createGPSPoint(
          corners[c][0] + t * (corners[nextC][0] - corners[c][0]),
          corners[c][1] + t * (corners[nextC][1] - corners[c][1])
        ));
      }
    }

    // Close the loop
    points.push(createGPSPoint(corners[0][0], corners[0][1]));

    return points;
  };

  describe('validateSpeed', () => {
    it('should return valid for null speed', () => {
      const point = createGPSPoint(37.7749, -122.4194, null);
      expect(GameEngine.validateSpeed(point, 'WALK').valid).toBe(true);
    });

    it('should return valid for normal walking speed', () => {
      // 5 km/h = 1.39 m/s
      const point = createGPSPoint(37.7749, -122.4194, 1.39);
      expect(GameEngine.validateSpeed(point, 'WALK').valid).toBe(true);
    });

    it('should flag too fast for walking', () => {
      // 15 km/h = 4.17 m/s - too fast for walking
      const point = createGPSPoint(37.7749, -122.4194, 4.17);
      const result = GameEngine.validateSpeed(point, 'WALK');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TOO_FAST_FOR_WALK');
      expect(result.suggested).toBe('RUN');
    });

    it('should return valid for normal running speed', () => {
      // 12 km/h = 3.33 m/s
      const point = createGPSPoint(37.7749, -122.4194, 3.33);
      expect(GameEngine.validateSpeed(point, 'RUN').valid).toBe(true);
    });

    it('should flag too fast for running', () => {
      // 100 km/h = 27.78 m/s - too fast for running
      const point = createGPSPoint(37.7749, -122.4194, 27.78);
      const result = GameEngine.validateSpeed(point, 'RUN');
      expect(result.valid).toBe(false);
      expect(result.suspicious).toBe(true);
    });

    it('should return valid for normal riding speed', () => {
      // 25 km/h = 6.94 m/s
      const point = createGPSPoint(37.7749, -122.4194, 6.94);
      expect(GameEngine.validateSpeed(point, 'RIDE').valid).toBe(true);
    });
  });

  describe('checkLoopClosure', () => {
    it('should return not closed for empty path', () => {
      expect(GameEngine.checkLoopClosure([]).isClosed).toBe(false);
    });

    it('should return not closed for path with fewer than 10 points', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        createGPSPoint(37.7750, -122.4193),
        createGPSPoint(37.7751, -122.4192),
      ];
      expect(GameEngine.checkLoopClosure(path).isClosed).toBe(false);
    });

    it('should return closed for path where start and end are within 200m', () => {
      const path = createSquarePath(37.7749, -122.4194, 0.001);
      // The square path ends at the start
      const result = GameEngine.checkLoopClosure(path);
      expect(result.isClosed).toBe(true);
      expect(result.distance).toBeLessThan(200);
    });

    it('should return not closed for path where start and end are far apart', () => {
      const path: GPSPoint[] = [];
      // Create a line that doesn't close
      for (let i = 0; i < 15; i++) {
        path.push(createGPSPoint(37.7749 + i * 0.001, -122.4194));
      }
      const result = GameEngine.checkLoopClosure(path);
      expect(result.isClosed).toBe(false);
      expect(result.distance).toBeGreaterThan(200);
    });

    it('should handle invalid start/end points', () => {
      const path: GPSPoint[] = [
        { lat: NaN, lng: -122.4194, timestamp: Date.now(), speed: null, accuracy: null, altitude: null },
      ];
      for (let i = 0; i < 10; i++) {
        path.push(createGPSPoint(37.7749, -122.4194));
      }
      const result = GameEngine.checkLoopClosure(path);
      expect(result.isClosed).toBe(false);
    });
  });

  describe('calculateArea', () => {
    it('should return 0 for empty path', () => {
      expect(GameEngine.calculateArea([])).toBe(0);
    });

    it('should return 0 for path with fewer than 3 points', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        createGPSPoint(37.7750, -122.4193),
      ];
      expect(GameEngine.calculateArea(path)).toBe(0);
    });

    it('should calculate area for valid polygon', () => {
      // Create a roughly 100m x 100m square (~0.001 degrees ≈ 111m)
      const path = createSquarePath(37.7749, -122.4194, 0.001);
      const area = GameEngine.calculateArea(path);

      // Should be roughly 12,000 sq meters (111m * 111m ≈ 12321)
      // Allow some tolerance for calculation differences
      expect(area).toBeGreaterThan(5000);
      expect(area).toBeLessThan(20000);
    });

    it('should filter out invalid points', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        { lat: NaN, lng: -122.4194, timestamp: Date.now(), speed: null, accuracy: null, altitude: null },
        createGPSPoint(37.7750, -122.4193),
        createGPSPoint(37.7749, -122.4192),
        createGPSPoint(37.7748, -122.4193),
      ];
      // Should still calculate area with valid points
      const area = GameEngine.calculateArea(path);
      expect(area).toBeGreaterThan(0);
    });
  });

  describe('processTerritory', () => {
    it('should return null for path that is not closed', () => {
      const path: GPSPoint[] = [];
      for (let i = 0; i < 15; i++) {
        path.push(createGPSPoint(37.7749 + i * 0.001, -122.4194));
      }
      const result = GameEngine.processTerritory(path, 'user-1', 'activity-1');
      expect(result).toBeNull();
    });

    it('should return null for path with fewer than 10 points', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        createGPSPoint(37.7750, -122.4193),
        createGPSPoint(37.7751, -122.4192),
      ];
      const result = GameEngine.processTerritory(path, 'user-1', 'activity-1');
      expect(result).toBeNull();
    });

    it('should create territory for valid closed loop', () => {
      const path = createSquarePath(37.7749, -122.4194, 0.002);
      const result = GameEngine.processTerritory(path, 'user-1', 'activity-1');

      expect(result).not.toBeNull();
      expect(result!.ownerId).toBe('user-1');
      expect(result!.activityId).toBe('activity-1');
      expect(result!.area).toBeGreaterThan(0);
      expect(result!.perimeter).toBeGreaterThan(0);
      expect(result!.center).toBeDefined();
      expect(result!.center.lat).toBeCloseTo(37.7749, 2);
      expect(result!.center.lng).toBeCloseTo(-122.4194, 2);
      expect(result!.polygon.length).toBeGreaterThan(0);
      expect(result!.history.length).toBe(1);
      expect(result!.history[0].claimedBy).toBe('user-1');
    });

    it('should return null for very small area', () => {
      // Create a tiny square that would result in area < 10 sq meters
      const path = createSquarePath(37.7749, -122.4194, 0.00001);
      const result = GameEngine.processTerritory(path, 'user-1', 'activity-1');
      expect(result).toBeNull();
    });
  });
});
