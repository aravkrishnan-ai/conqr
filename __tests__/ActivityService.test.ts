import { ActivityService } from '../services/ActivityService';
import { GPSPoint, Activity } from '../lib/types';
import { db } from '../lib/db';

describe('ActivityService', () => {
  // Sample GPS points for testing
  const createGPSPoint = (lat: number, lng: number, speed: number | null = 1.5): GPSPoint => ({
    lat,
    lng,
    timestamp: Date.now(),
    speed,
    accuracy: 10,
    altitude: 0,
  });

  const createPath = (numPoints: number, startLat = 37.7749, startLng = -122.4194): GPSPoint[] => {
    const points: GPSPoint[] = [];
    for (let i = 0; i < numPoints; i++) {
      points.push(createGPSPoint(
        startLat + (i * 0.0001), // ~11 meters per increment
        startLng + (i * 0.0001),
        1.5
      ));
    }
    return points;
  };

  describe('calculateDistance', () => {
    it('should return 0 for empty path', () => {
      expect(ActivityService.calculateDistance([])).toBe(0);
    });

    it('should return 0 for single point', () => {
      expect(ActivityService.calculateDistance([createGPSPoint(37.7749, -122.4194)])).toBe(0);
    });

    it('should calculate distance for valid path', () => {
      const path = createPath(5);
      const distance = ActivityService.calculateDistance(path);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1000); // Should be reasonable
    });

    it('should skip invalid points', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        { lat: NaN, lng: -122.4194, timestamp: Date.now(), speed: null, accuracy: null, altitude: null },
        createGPSPoint(37.7750, -122.4193),
      ];
      const distance = ActivityService.calculateDistance(path);
      expect(distance).toBeGreaterThan(0);
    });

    it('should skip unrealistic distances (GPS jumps)', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194),
        createGPSPoint(38.7749, -122.4194), // 1 degree = ~111km - unrealistic jump
        createGPSPoint(37.7750, -122.4194),
      ];
      const distance = ActivityService.calculateDistance(path);
      // Should skip the big jump
      expect(distance).toBeLessThan(100);
    });

    it('should handle null/undefined in path', () => {
      expect(ActivityService.calculateDistance(null as any)).toBe(0);
      expect(ActivityService.calculateDistance(undefined as any)).toBe(0);
    });
  });

  describe('calculateAverageSpeed', () => {
    it('should return 0 for empty path', () => {
      expect(ActivityService.calculateAverageSpeed([])).toBe(0);
    });

    it('should return 0 for single point', () => {
      expect(ActivityService.calculateAverageSpeed([createGPSPoint(37.7749, -122.4194)])).toBe(0);
    });

    it('should calculate average speed', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194, 1.5),
        createGPSPoint(37.7750, -122.4193, 2.0),
        createGPSPoint(37.7751, -122.4192, 2.5),
      ];
      const avgSpeed = ActivityService.calculateAverageSpeed(path);
      expect(avgSpeed).toBe(2); // (1.5 + 2.0 + 2.5) / 3
    });

    it('should filter out null speeds', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194, 2.0),
        createGPSPoint(37.7750, -122.4193, null),
        createGPSPoint(37.7751, -122.4192, 4.0),
      ];
      const avgSpeed = ActivityService.calculateAverageSpeed(path);
      expect(avgSpeed).toBe(3); // (2.0 + 4.0) / 2
    });

    it('should filter out unrealistic speeds (>100 m/s)', () => {
      const path = [
        createGPSPoint(37.7749, -122.4194, 2.0),
        createGPSPoint(37.7750, -122.4193, 150), // 540 km/h - unrealistic
        createGPSPoint(37.7751, -122.4192, 4.0),
      ];
      const avgSpeed = ActivityService.calculateAverageSpeed(path);
      expect(avgSpeed).toBe(3); // (2.0 + 4.0) / 2, 150 filtered out
    });
  });

  describe('calculatePace', () => {
    it('should return --:-- for zero speed', () => {
      expect(ActivityService.calculatePace(0)).toBe('--:--');
    });

    it('should return --:-- for negative speed', () => {
      expect(ActivityService.calculatePace(-1)).toBe('--:--');
    });

    it('should calculate pace correctly', () => {
      // 2.78 m/s = 10 km/h = 6 min/km
      expect(ActivityService.calculatePace(2.78)).toBe('5:59');
    });

    it('should format pace with leading zeros', () => {
      // 5 m/s = 18 km/h = 3:20/km
      const pace = ActivityService.calculatePace(5);
      expect(pace).toMatch(/^\d+:\d{2}$/);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds correctly', () => {
      expect(ActivityService.formatDuration(45)).toBe('0:45');
    });

    it('should format minutes correctly', () => {
      expect(ActivityService.formatDuration(125)).toBe('2:05');
    });

    it('should format hours correctly', () => {
      expect(ActivityService.formatDuration(3665)).toBe('1:01:05');
    });

    it('should handle zero', () => {
      expect(ActivityService.formatDuration(0)).toBe('0:00');
    });
  });

  describe('isValidActivity', () => {
    it('should return false for null activity', () => {
      expect(ActivityService.isValidActivity(null as any)).toBe(false);
    });

    it('should return false for activity without id', () => {
      expect(ActivityService.isValidActivity({ userId: 'test' } as any)).toBe(false);
    });

    it('should return false for activity without userId', () => {
      expect(ActivityService.isValidActivity({ id: 'test' } as any)).toBe(false);
    });

    it('should return false for activity with insufficient distance', () => {
      const activity: Partial<Activity> = {
        id: 'test',
        userId: 'user',
        distance: 5, // Less than 10m
        duration: 60,
        polylines: [createPath(5)],
      };
      expect(ActivityService.isValidActivity(activity)).toBe(false);
    });

    it('should return false for activity with insufficient duration', () => {
      const activity: Partial<Activity> = {
        id: 'test',
        userId: 'user',
        distance: 100,
        duration: 3, // Less than 5s
        polylines: [createPath(5)],
      };
      expect(ActivityService.isValidActivity(activity)).toBe(false);
    });

    it('should return false for activity with too few GPS points', () => {
      const activity: Partial<Activity> = {
        id: 'test',
        userId: 'user',
        distance: 100,
        duration: 60,
        polylines: [[createGPSPoint(37.7749, -122.4194)]], // Only 1 point
      };
      expect(ActivityService.isValidActivity(activity)).toBe(false);
    });

    it('should return true for valid activity', () => {
      const activity: Partial<Activity> = {
        id: 'test',
        userId: 'user',
        distance: 100,
        duration: 60,
        polylines: [createPath(5)],
      };
      expect(ActivityService.isValidActivity(activity)).toBe(true);
    });
  });

  describe('estimateCalories', () => {
    it('should estimate calories for walking', () => {
      // 1 hour of walking at MET 3.5, 70kg = 245 calories
      const calories = ActivityService.estimateCalories('WALK', 5000, 3600);
      expect(calories).toBe(245);
    });

    it('should estimate calories for running', () => {
      // 1 hour of running at MET 8.0, 70kg = 560 calories
      const calories = ActivityService.estimateCalories('RUN', 10000, 3600);
      expect(calories).toBe(560);
    });

    it('should estimate calories for riding', () => {
      // 1 hour of biking at MET 6.0, 70kg = 420 calories
      const calories = ActivityService.estimateCalories('RIDE', 15000, 3600);
      expect(calories).toBe(420);
    });

    it('should handle zero duration', () => {
      expect(ActivityService.estimateCalories('WALK', 0, 0)).toBe(0);
    });
  });

  describe('saveActivity', () => {
    it('should save valid activity to local db', async () => {
      const activity: Activity = {
        id: 'test-activity-1',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [createPath(5)],
        isSynced: false,
      };

      const result = await ActivityService.saveActivity(activity);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('test-activity-1');

      // Verify it's in the db
      const saved = await db.activities.get('test-activity-1');
      expect(saved).toBeDefined();
      expect(saved?.type).toBe('WALK');
    });

    it('should return null for invalid activity', async () => {
      const activity: Activity = {
        id: 'test-activity-2',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 5, // Too short
        duration: 60,
        polylines: [createPath(5)],
        isSynced: false,
      };

      const result = await ActivityService.saveActivity(activity);
      expect(result).toBeNull();
    });
  });

  describe('getUserActivities', () => {
    it('should return empty array for user with no activities', async () => {
      const activities = await ActivityService.getUserActivities('non-existent-user');
      expect(activities).toEqual([]);
    });

    it('should return activities for user', async () => {
      // Save an activity first
      const activity: Activity = {
        id: 'test-activity-3',
        userId: 'test-user-1',
        type: 'RUN',
        startTime: Date.now() - 60000,
        endTime: Date.now(),
        distance: 500,
        duration: 120,
        polylines: [createPath(10)],
        isSynced: false,
      };
      await db.activities.put(activity);

      const activities = await ActivityService.getUserActivities('test-user-1');
      expect(activities.length).toBe(1);
      expect(activities[0].id).toBe('test-activity-3');
    });

    it('should sort activities by start time (newest first)', async () => {
      const now = Date.now();
      await db.activities.put({
        id: 'old-activity',
        userId: 'sort-test-user',
        type: 'WALK',
        startTime: now - 120000, // 2 mins ago
        distance: 100,
        duration: 60,
        polylines: [createPath(3)],
        isSynced: false,
      } as Activity);
      await db.activities.put({
        id: 'new-activity',
        userId: 'sort-test-user',
        type: 'RUN',
        startTime: now - 60000, // 1 min ago
        distance: 200,
        duration: 60,
        polylines: [createPath(3)],
        isSynced: false,
      } as Activity);

      const activities = await ActivityService.getUserActivities('sort-test-user');
      expect(activities.length).toBe(2);
      expect(activities[0].id).toBe('new-activity'); // Newest first
      expect(activities[1].id).toBe('old-activity');
    });

    it('should return empty array for empty userId', async () => {
      const activities = await ActivityService.getUserActivities('');
      expect(activities).toEqual([]);
    });
  });

  describe('getActivityStats', () => {
    it('should calculate stats correctly', async () => {
      const userId = 'stats-test-user';
      await db.activities.put({
        id: 'stat-1',
        userId,
        type: 'WALK',
        startTime: Date.now(),
        distance: 1000,
        duration: 600,
        polylines: [createPath(3)],
        isSynced: false,
      } as Activity);
      await db.activities.put({
        id: 'stat-2',
        userId,
        type: 'RUN',
        startTime: Date.now(),
        distance: 2000,
        duration: 480,
        polylines: [createPath(3)],
        isSynced: false,
      } as Activity);
      await db.activities.put({
        id: 'stat-3',
        userId,
        type: 'WALK',
        startTime: Date.now(),
        distance: 500,
        duration: 300,
        polylines: [createPath(3)],
        isSynced: false,
      } as Activity);

      const stats = await ActivityService.getActivityStats(userId);

      expect(stats.totalActivities).toBe(3);
      expect(stats.totalDistance).toBe(3500);
      expect(stats.totalDuration).toBe(1380);
      expect(stats.byType['WALK'].count).toBe(2);
      expect(stats.byType['WALK'].distance).toBe(1500);
      expect(stats.byType['RUN'].count).toBe(1);
      expect(stats.byType['RUN'].distance).toBe(2000);
    });

    it('should use cached activities if provided', async () => {
      const cachedActivities: Activity[] = [{
        id: 'cached-1',
        userId: 'cached-user',
        type: 'RIDE',
        startTime: Date.now(),
        distance: 5000,
        duration: 1200,
        polylines: [],
        isSynced: true,
      }];

      const stats = await ActivityService.getActivityStats('cached-user', cachedActivities);
      expect(stats.totalActivities).toBe(1);
      expect(stats.byType['RIDE'].count).toBe(1);
    });
  });

  describe('deleteActivity', () => {
    it('should delete activity from local db', async () => {
      const activity: Activity = {
        id: 'delete-test',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      };
      await db.activities.put(activity);

      // Verify it exists
      let saved = await db.activities.get('delete-test');
      expect(saved).toBeDefined();

      // Delete it
      const result = await ActivityService.deleteActivity('delete-test');
      expect(result).toBe(true);

      // Verify it's gone
      saved = await db.activities.get('delete-test');
      expect(saved).toBeUndefined();
    });
  });

  describe('_parsePolylines', () => {
    it('should return empty array for null', () => {
      expect(ActivityService._parsePolylines(null)).toEqual([]);
    });

    it('should return array as-is', () => {
      const polylines = [[createGPSPoint(37.7749, -122.4194)]];
      expect(ActivityService._parsePolylines(polylines)).toEqual(polylines);
    });

    it('should parse JSON string', () => {
      const polylines = [[{ lat: 37.7749, lng: -122.4194 }]];
      const jsonString = JSON.stringify(polylines);
      expect(ActivityService._parsePolylines(jsonString)).toEqual(polylines);
    });

    it('should return empty array for invalid JSON', () => {
      expect(ActivityService._parsePolylines('invalid json')).toEqual([]);
    });
  });
});
