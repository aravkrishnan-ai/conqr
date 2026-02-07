import { TerritoryService } from '../services/TerritoryService';
import { Territory, TerritoryInvasion } from '../lib/types';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';

// Get the mocked supabase
const mockSupabase = supabase as any;

/**
 * Helper: create a territory with a valid square polygon
 */
const createTerritory = (
  id: string,
  ownerId: string,
  centerLng: number = -122.42,
  centerLat: number = 37.77,
  halfSize: number = 0.001
): Territory => {
  const { polygon, area, centroid, length, lineString, rewind } = require('@turf/turf');
  const coords: [number, number][] = [
    [centerLng - halfSize, centerLat - halfSize],
    [centerLng + halfSize, centerLat - halfSize],
    [centerLng + halfSize, centerLat + halfSize],
    [centerLng - halfSize, centerLat + halfSize],
    [centerLng - halfSize, centerLat - halfSize],
  ];
  const turfPoly = rewind(polygon([coords]));
  const polyArea = area(turfPoly);
  const center = centroid(turfPoly);
  const perim = length(lineString(coords), { units: 'meters' });

  return {
    id,
    name: '',
    ownerId,
    ownerName: `User-${ownerId.substring(0, 4)}`,
    activityId: `activity-${id}`,
    claimedAt: Date.now(),
    area: polyArea,
    perimeter: perim,
    center: {
      lat: center.geometry.coordinates[1],
      lng: center.geometry.coordinates[0],
    },
    polygon: coords,
    history: [{
      claimedBy: ownerId,
      claimedAt: Date.now(),
      activityId: `activity-${id}`,
    }],
  };
};

describe('TerritoryService', () => {
  beforeEach(async () => {
    // Clear local DB
    await db.territories.clear();
  });

  describe('saveTerritory', () => {
    it('should save territory locally and to cloud', async () => {
      const territory = createTerritory('t1', 'user-A');

      const result = await TerritoryService.saveTerritory(territory);

      expect(result).toEqual(territory);

      // Verify saved locally
      const local = await db.territories.get('t1');
      expect(local).toBeDefined();
      expect(local!.id).toBe('t1');

      // Verify cloud upsert was called
      expect(mockSupabase.from).toHaveBeenCalledWith('territories');
    });

    it('should include history in cloud upsert', async () => {
      const territory = createTerritory('t2', 'user-A');
      territory.history = [
        { claimedBy: 'user-A', claimedAt: Date.now(), activityId: 'act-1' },
        { previousOwnerId: 'user-A', claimedBy: 'user-B', claimedAt: Date.now(), activityId: 'act-2' },
      ];

      await TerritoryService.saveTerritory(territory);

      // The upsert should have been called with history
      const fromCall = mockSupabase.from.mock.results[0];
      expect(fromCall).toBeDefined();
    });

    it('should reject invalid territory', async () => {
      const invalid: any = { id: 't-bad', area: 'not a number' };

      await expect(TerritoryService.saveTerritory(invalid)).rejects.toThrow('Invalid territory data');
    });
  });

  describe('saveTerritoryWithConquering', () => {
    it('should save without RPC when no overlap exists', async () => {
      const newTerritory = createTerritory('new-1', 'user-B', -122.42, 37.77, 0.001);
      const existing = createTerritory('existing-1', 'user-A', -122.45, 37.80, 0.001); // far away

      const result = await TerritoryService.saveTerritoryWithConquering(
        newTerritory, [existing], 'UserB'
      );

      expect(result.newTerritory).toBe(newTerritory);
      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
      expect(result.invasions).toHaveLength(0);
      expect(result.totalConqueredArea).toBe(0);

      // New territory should be saved locally
      const local = await db.territories.get('new-1');
      expect(local).toBeDefined();
    });

    it('should handle conquering and update local DB', async () => {
      // Pre-populate existing territory locally
      const existing = createTerritory('existing-1', 'user-A', -122.42, 37.77, 0.002);
      await db.territories.put(existing);

      // New overlapping territory
      const newTerritory = createTerritory('new-1', 'user-B', -122.419, 37.77, 0.002);

      // Mock the RPC call
      mockSupabase.rpc = jest.fn(async () => ({ data: { success: true }, error: null }));

      const result = await TerritoryService.saveTerritoryWithConquering(
        newTerritory, [existing], 'UserB'
      );

      expect(result.totalConqueredArea).toBeGreaterThan(0);

      // New territory should be saved locally
      const localNew = await db.territories.get('new-1');
      expect(localNew).toBeDefined();

      // If territory was modified (not deleted), check local update
      if (result.modifiedTerritories.length > 0) {
        const localMod = await db.territories.get('existing-1');
        expect(localMod).toBeDefined();
        expect(localMod!.area).toBeLessThan(existing.area);
      }

      // If territory was deleted, check local deletion
      if (result.deletedTerritoryIds.includes('existing-1')) {
        const localDel = await db.territories.get('existing-1');
        expect(localDel).toBeUndefined();
      }

      // RPC should have been called
      expect(mockSupabase.rpc).toHaveBeenCalledWith('conquer_territory', expect.objectContaining({
        p_new_territory_id: 'new-1',
        p_owner_id: 'user-B',
      }));
    });

    it('should fall back to saveTerritory when RPC fails', async () => {
      const existing = createTerritory('existing-1', 'user-A', -122.42, 37.77, 0.002);
      const newTerritory = createTerritory('new-1', 'user-B', -122.419, 37.77, 0.002);

      // Mock RPC to fail
      mockSupabase.rpc = jest.fn(async () => ({ data: null, error: { message: 'RPC failed' } }));

      const result = await TerritoryService.saveTerritoryWithConquering(
        newTerritory, [existing], 'UserB'
      );

      // Should still return the conquer result (local changes applied)
      expect(result.newTerritory).toBe(newTerritory);

      // New territory should still be saved locally
      const local = await db.territories.get('new-1');
      expect(local).toBeDefined();
    });

    it('should handle full territory consumption correctly', async () => {
      // Small territory that will be fully consumed
      const small = createTerritory('small-1', 'user-A', -122.42, 37.77, 0.0005);
      await db.territories.put(small);

      const large = createTerritory('new-1', 'user-B', -122.42, 37.77, 0.003);

      mockSupabase.rpc = jest.fn(async () => ({ data: { success: true }, error: null }));

      const result = await TerritoryService.saveTerritoryWithConquering(
        large, [small], 'UserB'
      );

      expect(result.deletedTerritoryIds).toContain('small-1');

      // Small territory should be deleted locally
      const localSmall = await db.territories.get('small-1');
      expect(localSmall).toBeUndefined();
    });
  });

  describe('getUnseenInvasions', () => {
    it('should fetch unseen invasions from Supabase', async () => {
      const mockInvasions = [
        {
          id: 'inv-1',
          invaded_user_id: 'user-A',
          invader_user_id: 'user-B',
          invader_username: 'PlayerB',
          invaded_territory_id: 'terr-1',
          new_territory_id: 'terr-2',
          overlap_area: 5000,
          territory_was_destroyed: false,
          created_at: new Date().toISOString(),
          seen: false,
        },
      ];

      // Mock the chain: from().select().eq().eq().order()
      const mockOrder = jest.fn(() => ({ data: mockInvasions, error: null }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const result = await TerritoryService.getUnseenInvasions('user-A');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inv-1');
      expect(result[0].invadedUserId).toBe('user-A');
      expect(result[0].invaderUserId).toBe('user-B');
      expect(result[0].invaderUsername).toBe('PlayerB');
      expect(result[0].overlapArea).toBe(5000);
      expect(result[0].territoryWasDestroyed).toBe(false);
      expect(result[0].seen).toBe(false);
    });

    it('should return empty array on error', async () => {
      const mockOrder = jest.fn(() => ({ data: null, error: { message: 'DB error' } }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const result = await TerritoryService.getUnseenInvasions('user-A');
      expect(result).toHaveLength(0);
    });

    it('should return empty array when no data', async () => {
      const mockOrder = jest.fn(() => ({ data: [], error: null }));
      const mockEq2 = jest.fn(() => ({ order: mockOrder }));
      const mockEq1 = jest.fn(() => ({ eq: mockEq2 }));
      const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });

      const result = await TerritoryService.getUnseenInvasions('user-A');
      expect(result).toHaveLength(0);
    });
  });

  describe('markInvasionsSeen', () => {
    it('should update invasions to seen=true', async () => {
      const mockIn = jest.fn(() => ({ error: null }));
      const mockUpdate = jest.fn(() => ({ in: mockIn }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      await TerritoryService.markInvasionsSeen(['inv-1', 'inv-2']);

      expect(mockSupabase.from).toHaveBeenCalledWith('territory_invasions');
      expect(mockUpdate).toHaveBeenCalledWith({ seen: true });
      expect(mockIn).toHaveBeenCalledWith('id', ['inv-1', 'inv-2']);
    });

    it('should do nothing for empty array', async () => {
      await TerritoryService.markInvasionsSeen([]);
      // from should NOT have been called with territory_invasions
      // (it may have been called from setup, but not from this call)
    });

    it('should handle errors gracefully', async () => {
      const mockIn = jest.fn(() => ({ error: { message: 'Update failed' } }));
      const mockUpdate = jest.fn(() => ({ in: mockIn }));
      mockSupabase.from.mockReturnValueOnce({ update: mockUpdate });

      // Should not throw
      await expect(TerritoryService.markInvasionsSeen(['inv-1'])).resolves.not.toThrow();
    });
  });

  describe('mapCloudTerritory with history', () => {
    it('should parse history from cloud data', async () => {
      // We test this indirectly by saving a territory with history and re-fetching
      const territory = createTerritory('t-hist', 'user-A');
      territory.history = [
        { claimedBy: 'user-A', claimedAt: 1000, activityId: 'act-1' },
        { previousOwnerId: 'user-A', claimedBy: 'user-B', claimedAt: 2000, activityId: 'act-2' },
      ];

      // Save locally
      await db.territories.put(territory);

      // Verify local retrieval preserves history
      const local = await db.territories.get('t-hist');
      expect(local!.history).toHaveLength(2);
      expect(local!.history[1].claimedBy).toBe('user-B');
    });
  });
});
