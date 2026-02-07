import { ActivityService } from '../services/ActivityService';
import { GPSPoint } from '../lib/types';

const point = (lat: number, lng: number, speed: number | null = 1.5): GPSPoint => ({
  lat,
  lng,
  timestamp: Date.now(),
  speed,
  accuracy: 10,
  altitude: 0,
});

describe('Activity Details Map Utilities', () => {
  describe('flattenPolylines', () => {
    it('should flatten multiple segments into one array', () => {
      const polylines = [
        [point(37.77, -122.42), point(37.78, -122.43)],
        [point(37.79, -122.44), point(37.80, -122.45)],
      ];
      const result = ActivityService.flattenPolylines(polylines);
      expect(result).toHaveLength(4);
      expect(result[0].lat).toBe(37.77);
      expect(result[1].lat).toBe(37.78);
      expect(result[2].lat).toBe(37.79);
      expect(result[3].lat).toBe(37.80);
    });

    it('should return empty array for empty polylines', () => {
      expect(ActivityService.flattenPolylines([])).toEqual([]);
    });

    it('should return empty array for null', () => {
      expect(ActivityService.flattenPolylines(null as any)).toEqual([]);
    });

    it('should return empty array for undefined', () => {
      expect(ActivityService.flattenPolylines(undefined as any)).toEqual([]);
    });

    it('should handle single segment', () => {
      const polylines = [[point(37.77, -122.42), point(37.78, -122.43)]];
      const result = ActivityService.flattenPolylines(polylines);
      expect(result).toHaveLength(2);
    });

    it('should handle single point segment', () => {
      const polylines = [[point(37.77, -122.42)]];
      const result = ActivityService.flattenPolylines(polylines);
      expect(result).toHaveLength(1);
    });

    it('should skip non-array segments', () => {
      const polylines = [
        [point(37.77, -122.42)],
        null as any,
        [point(37.78, -122.43)],
      ];
      const result = ActivityService.flattenPolylines(polylines);
      expect(result).toHaveLength(2);
    });

    it('should handle many segments', () => {
      const polylines = Array.from({ length: 10 }, (_, i) => [
        point(37.77 + i * 0.01, -122.42 + i * 0.01),
      ]);
      const result = ActivityService.flattenPolylines(polylines);
      expect(result).toHaveLength(10);
    });

    it('should preserve GPS point properties', () => {
      const p = point(37.77, -122.42, 2.5);
      p.accuracy = 5;
      p.altitude = 100;
      const result = ActivityService.flattenPolylines([[p]]);
      expect(result[0].speed).toBe(2.5);
      expect(result[0].accuracy).toBe(5);
      expect(result[0].altitude).toBe(100);
    });

    it('should return empty array for non-array input', () => {
      expect(ActivityService.flattenPolylines('invalid' as any)).toEqual([]);
    });
  });

  describe('calculateRouteBounds', () => {
    it('should calculate correct bounds for a route', () => {
      const points = [
        point(37.77, -122.45),
        point(37.80, -122.42),
        point(37.78, -122.43),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.45]);
      expect(bounds!.northEast).toEqual([37.80, -122.42]);
    });

    it('should return null for empty points', () => {
      expect(ActivityService.calculateRouteBounds([])).toBeNull();
    });

    it('should return null for null', () => {
      expect(ActivityService.calculateRouteBounds(null as any)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(ActivityService.calculateRouteBounds(undefined as any)).toBeNull();
    });

    it('should handle single point', () => {
      const bounds = ActivityService.calculateRouteBounds([point(37.77, -122.42)]);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.42]);
      expect(bounds!.northEast).toEqual([37.77, -122.42]);
    });

    it('should handle two points', () => {
      const bounds = ActivityService.calculateRouteBounds([
        point(37.77, -122.45),
        point(37.80, -122.42),
      ]);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.45]);
      expect(bounds!.northEast).toEqual([37.80, -122.42]);
    });

    it('should skip NaN coordinates', () => {
      const points = [
        point(37.77, -122.42),
        { lat: NaN, lng: -122.43, timestamp: 0, speed: null, accuracy: null, altitude: null } as GPSPoint,
        point(37.80, -122.45),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.45]);
      expect(bounds!.northEast).toEqual([37.80, -122.42]);
    });

    it('should skip points with NaN lng', () => {
      const points = [
        point(37.77, -122.42),
        { lat: 37.78, lng: NaN, timestamp: 0, speed: null, accuracy: null, altitude: null } as GPSPoint,
        point(37.80, -122.45),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.45]);
      expect(bounds!.northEast).toEqual([37.80, -122.42]);
    });

    it('should return null when all points are NaN', () => {
      const points = [
        { lat: NaN, lng: NaN, timestamp: 0, speed: null, accuracy: null, altitude: null } as GPSPoint,
        { lat: NaN, lng: NaN, timestamp: 0, speed: null, accuracy: null, altitude: null } as GPSPoint,
      ];
      expect(ActivityService.calculateRouteBounds(points)).toBeNull();
    });

    it('should skip null points', () => {
      const points = [
        point(37.77, -122.42),
        null as any,
        point(37.80, -122.45),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -122.45]);
      expect(bounds!.northEast).toEqual([37.80, -122.42]);
    });

    it('should return null for non-array input', () => {
      expect(ActivityService.calculateRouteBounds('invalid' as any)).toBeNull();
    });

    it('should handle points crossing negative/positive longitude', () => {
      const points = [
        point(37.77, -0.1),
        point(37.80, 0.1),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([37.77, -0.1]);
      expect(bounds!.northEast).toEqual([37.80, 0.1]);
    });

    it('should handle negative latitudes', () => {
      const points = [
        point(-33.87, 151.20),
        point(-33.85, 151.22),
      ];
      const bounds = ActivityService.calculateRouteBounds(points);
      expect(bounds).not.toBeNull();
      expect(bounds!.southWest).toEqual([-33.87, 151.20]);
      expect(bounds!.northEast).toEqual([-33.85, 151.22]);
    });
  });
});
