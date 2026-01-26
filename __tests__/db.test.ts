import { db } from '../lib/db';
import { Activity, UserProfile, Territory } from '../lib/types';

describe('Database Layer', () => {
  describe('activities store', () => {
    it('should put and get an activity', async () => {
      const activity: Activity = {
        id: 'db-test-1',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      };

      await db.activities.put(activity);
      const retrieved = await db.activities.get('db-test-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('db-test-1');
      expect(retrieved?.type).toBe('WALK');
    });

    it('should update an existing activity', async () => {
      const activity: Activity = {
        id: 'db-test-2',
        userId: 'user-1',
        type: 'RUN',
        startTime: Date.now(),
        distance: 200,
        duration: 120,
        polylines: [],
        isSynced: false,
      };

      await db.activities.put(activity);
      await db.activities.update('db-test-2', { isSynced: true, distance: 250 });

      const retrieved = await db.activities.get('db-test-2');
      expect(retrieved?.isSynced).toBe(true);
      expect(retrieved?.distance).toBe(250);
    });

    it('should return all activities with toArray', async () => {
      await db.activities.put({
        id: 'db-test-3a',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      } as Activity);

      await db.activities.put({
        id: 'db-test-3b',
        userId: 'user-1',
        type: 'RUN',
        startTime: Date.now(),
        distance: 200,
        duration: 120,
        polylines: [],
        isSynced: false,
      } as Activity);

      const all = await db.activities.toArray();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete an activity', async () => {
      const activity: Activity = {
        id: 'db-test-4',
        userId: 'user-1',
        type: 'RIDE',
        startTime: Date.now(),
        distance: 500,
        duration: 300,
        polylines: [],
        isSynced: false,
      };

      await db.activities.put(activity);
      let retrieved = await db.activities.get('db-test-4');
      expect(retrieved).toBeDefined();

      await db.activities.delete('db-test-4');
      retrieved = await db.activities.get('db-test-4');
      expect(retrieved).toBeUndefined();
    });

    it('should add a new activity without replacing existing', async () => {
      const activity1: Activity = {
        id: 'db-test-5a',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      };

      const activity2: Activity = {
        id: 'db-test-5b',
        userId: 'user-1',
        type: 'RUN',
        startTime: Date.now(),
        distance: 200,
        duration: 120,
        polylines: [],
        isSynced: false,
      };

      await db.activities.add(activity1);
      await db.activities.add(activity2);

      const first = await db.activities.get('db-test-5a');
      const second = await db.activities.get('db-test-5b');

      expect(first).toBeDefined();
      expect(second).toBeDefined();
    });

    it('should use put to upsert (update if exists)', async () => {
      const activity: Activity = {
        id: 'db-test-6',
        userId: 'user-1',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      };

      await db.activities.put(activity);

      // Update via put
      const updated: Activity = {
        ...activity,
        distance: 150,
        isSynced: true,
      };
      await db.activities.put(updated);

      const retrieved = await db.activities.get('db-test-6');
      expect(retrieved?.distance).toBe(150);
      expect(retrieved?.isSynced).toBe(true);

      // Make sure there's only one entry
      const all = await db.activities.toArray();
      const matching = all.filter(a => a.id === 'db-test-6');
      expect(matching.length).toBe(1);
    });
  });

  describe('territories store', () => {
    it('should store and retrieve territories', async () => {
      const territory: Territory = {
        id: 'territory-1',
        name: 'Test Territory',
        ownerId: 'user-1',
        activityId: 'activity-1',
        claimedAt: Date.now(),
        area: 10000,
        perimeter: 400,
        center: { lat: 37.7749, lng: -122.4194 },
        polygon: [[0, 0], [0, 1], [1, 1], [1, 0]],
        history: [],
      };

      await db.territories.put(territory);
      const retrieved = await db.territories.get('territory-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Territory');
      expect(retrieved?.area).toBe(10000);
    });
  });

  describe('users store', () => {
    it('should store and retrieve user profiles', async () => {
      const user: UserProfile = {
        id: 'user-profile-1',
        username: 'testuser',
        email: 'test@example.com',
        createdAt: Date.now(),
      };

      await db.users.put(user);
      const retrieved = await db.users.get('user-profile-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.username).toBe('testuser');
    });
  });

  describe('where clause', () => {
    it('should find first matching item', async () => {
      await db.activities.put({
        id: 'where-test-1',
        userId: 'where-user',
        type: 'WALK',
        startTime: Date.now(),
        distance: 100,
        duration: 60,
        polylines: [],
        isSynced: false,
      } as Activity);

      const found = await db.activities.where('userId').equals('where-user').first();
      expect(found).toBeDefined();
      expect(found?.id).toBe('where-test-1');
    });

    it('should return undefined if no match', async () => {
      const found = await db.activities.where('userId').equals('non-existent-user').first();
      expect(found).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return undefined for non-existent id', async () => {
      const result = await db.activities.get('definitely-does-not-exist');
      expect(result).toBeUndefined();
    });

    it('should handle update for non-existent id gracefully', async () => {
      // Should not throw
      await db.activities.update('non-existent-id', { isSynced: true });
    });

    it('should handle delete for non-existent id gracefully', async () => {
      // Should not throw
      await db.activities.delete('non-existent-id');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent puts correctly', async () => {
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          db.activities.put({
            id: `concurrent-${i}`,
            userId: 'concurrent-user',
            type: 'WALK',
            startTime: Date.now() + i,
            distance: 100 + i,
            duration: 60,
            polylines: [],
            isSynced: false,
          } as Activity)
        );
      }

      await Promise.all(promises);

      const all = await db.activities.toArray();
      const concurrent = all.filter(a => a.id.startsWith('concurrent-'));
      expect(concurrent.length).toBe(10);
    });

    it('should handle concurrent updates correctly', async () => {
      await db.activities.put({
        id: 'concurrent-update',
        userId: 'user',
        type: 'WALK',
        startTime: Date.now(),
        distance: 0,
        duration: 60,
        polylines: [],
        isSynced: false,
      } as Activity);

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          db.activities.update('concurrent-update', { distance: i * 100 })
        );
      }

      await Promise.all(promises);

      const result = await db.activities.get('concurrent-update');
      // One of the updates should have won
      expect(result?.distance).toBeGreaterThanOrEqual(0);
    });
  });
});
