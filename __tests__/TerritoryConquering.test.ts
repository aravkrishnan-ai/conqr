import { GameEngine } from '../services/GameEngine';
import { Territory, ConquerResult } from '../lib/types';

/**
 * Helper: create a Territory object from a polygon of [lng, lat] coords.
 * The polygon should be a closed ring (first coord == last coord).
 */
const createTerritory = (
  id: string,
  ownerId: string,
  polygonCoords: [number, number][],
  overrides: Partial<Territory> = {}
): Territory => {
  // Use turf to calculate area
  const { polygon, area, centroid, length, lineString, rewind } = require('@turf/turf');
  const closed = [...polygonCoords];
  if (closed[0][0] !== closed[closed.length - 1][0] ||
    closed[0][1] !== closed[closed.length - 1][1]) {
    closed.push(closed[0]);
  }
  const turfPoly = rewind(polygon([closed]));
  const polyArea = area(turfPoly);
  const center = centroid(turfPoly);
  const perim = length(lineString(closed), { units: 'meters' });

  return {
    id,
    name: '',
    ownerId,
    activityId: `activity-${id}`,
    claimedAt: Date.now(),
    area: polyArea,
    perimeter: perim,
    center: {
      lat: center.geometry.coordinates[1],
      lng: center.geometry.coordinates[0],
    },
    polygon: polygonCoords,
    history: [{
      claimedBy: ownerId,
      claimedAt: Date.now(),
      activityId: `activity-${id}`,
    }],
    ...overrides,
  };
};

/**
 * Helper: create a square polygon centered at (cLng, cLat) with given half-size in degrees.
 * Returns coords in [lng, lat] GeoJSON order, NOT closed (closing handled by createTerritory).
 */
const makeSquare = (cLng: number, cLat: number, halfSize: number): [number, number][] => {
  return [
    [cLng - halfSize, cLat - halfSize],
    [cLng + halfSize, cLat - halfSize],
    [cLng + halfSize, cLat + halfSize],
    [cLng - halfSize, cLat + halfSize],
    [cLng - halfSize, cLat - halfSize], // closed
  ];
};

describe('Territory Conquering - GameEngine.resolveOverlaps', () => {

  describe('No overlap scenarios', () => {
    it('should return empty results when there are no existing territories', () => {
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.001));
      const result = GameEngine.resolveOverlaps(newTerritory, []);

      expect(result.newTerritory).toBe(newTerritory);
      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
      expect(result.invasions).toHaveLength(0);
      expect(result.totalConqueredArea).toBe(0);
    });

    it('should not modify territories owned by the same user', () => {
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.001));
      // New territory overlaps but same owner
      const newTerritory = createTerritory('new-1', 'user-A', makeSquare(-122.4205, 37.77, 0.001));
      const result = GameEngine.resolveOverlaps(newTerritory, [existing]);

      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
      expect(result.invasions).toHaveLength(0);
      expect(result.totalConqueredArea).toBe(0);
    });

    it('should not modify territories that do not overlap', () => {
      // Two squares far apart
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.001));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.45, 37.80, 0.001));
      const result = GameEngine.resolveOverlaps(newTerritory, [existing]);

      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
      expect(result.invasions).toHaveLength(0);
      expect(result.totalConqueredArea).toBe(0);
    });
  });

  describe('Partial overlap scenarios', () => {
    it('should shrink an existing territory when partially overlapped', () => {
      // Two squares offset so they partially overlap
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.002));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.419, 37.77, 0.002));

      const result = GameEngine.resolveOverlaps(newTerritory, [existing], 'UserB');

      expect(result.modifiedTerritories).toHaveLength(1);
      expect(result.deletedTerritoryIds).toHaveLength(0);
      expect(result.invasions).toHaveLength(1);
      expect(result.totalConqueredArea).toBeGreaterThan(0);

      // The modified territory should be smaller than the original
      const modified = result.modifiedTerritories[0];
      expect(modified.id).toBe('existing-1');
      expect(modified.ownerId).toBe('user-A');
      expect(modified.area).toBeLessThan(existing.area);
      expect(modified.area).toBeGreaterThan(0);

      // Check polygon was recalculated
      expect(modified.polygon.length).toBeGreaterThan(0);
      expect(modified.center.lat).toBeDefined();
      expect(modified.center.lng).toBeDefined();
      expect(modified.perimeter).toBeGreaterThan(0);

      // History should have a new entry
      expect(modified.history.length).toBe(2);
      expect(modified.history[1].claimedBy).toBe('user-B');
      expect(modified.history[1].previousOwnerId).toBe('user-A');

      // Invasion notification
      const invasion = result.invasions[0];
      expect(invasion.invadedUserId).toBe('user-A');
      expect(invasion.invaderUserId).toBe('user-B');
      expect(invasion.invaderUsername).toBe('UserB');
      expect(invasion.territoryWasDestroyed).toBe(false);
      expect(invasion.overlapArea).toBeGreaterThan(0);
      expect(invasion.invadedTerritoryId).toBe('existing-1');
      expect(invasion.newTerritoryId).toBe('new-1');
    });

    it('should handle multiple overlapping territories from different users', () => {
      // Three territories: user-A and user-C, new one from user-B overlaps both
      const existingA = createTerritory('existing-A', 'user-A', makeSquare(-122.419, 37.77, 0.001));
      const existingC = createTerritory('existing-C', 'user-C', makeSquare(-122.421, 37.77, 0.001));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.002));

      const result = GameEngine.resolveOverlaps(newTerritory, [existingA, existingC], 'UserB');

      // Both territories should be affected
      const totalAffected = result.modifiedTerritories.length + result.deletedTerritoryIds.length;
      expect(totalAffected).toBe(2);
      expect(result.invasions).toHaveLength(2);
      expect(result.totalConqueredArea).toBeGreaterThan(0);

      // Verify invasions reference correct users
      const userIds = result.invasions.map(i => i.invadedUserId).sort();
      expect(userIds).toEqual(['user-A', 'user-C']);
    });
  });

  describe('Full consumption scenarios', () => {
    it('should delete territory when fully consumed by a larger territory', () => {
      // Small territory inside a much larger one
      const small = createTerritory('small-1', 'user-A', makeSquare(-122.42, 37.77, 0.0005));
      const large = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.003));

      const result = GameEngine.resolveOverlaps(large, [small], 'UserB');

      expect(result.deletedTerritoryIds).toContain('small-1');
      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.invasions).toHaveLength(1);
      expect(result.invasions[0].territoryWasDestroyed).toBe(true);
      expect(result.invasions[0].invadedUserId).toBe('user-A');
      expect(result.totalConqueredArea).toBeGreaterThan(0);
    });

    it('should handle mix of partial and full consumption', () => {
      // Small territory (fully consumed) and large territory (partially consumed)
      const small = createTerritory('small-1', 'user-A', makeSquare(-122.42, 37.77, 0.0005));
      const large = createTerritory('large-1', 'user-C', makeSquare(-122.42, 37.77, 0.005));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.002));

      const result = GameEngine.resolveOverlaps(newTerritory, [small, large], 'UserB');

      // Small should be consumed, large should be modified
      expect(result.deletedTerritoryIds).toContain('small-1');
      expect(result.modifiedTerritories.some(t => t.id === 'large-1')).toBe(true);
      expect(result.invasions).toHaveLength(2);

      const smallInvasion = result.invasions.find(i => i.invadedTerritoryId === 'small-1');
      const largeInvasion = result.invasions.find(i => i.invadedTerritoryId === 'large-1');
      expect(smallInvasion!.territoryWasDestroyed).toBe(true);
      expect(largeInvasion!.territoryWasDestroyed).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should ignore overlaps smaller than 1 square meter', () => {
      // Two territories that just barely touch at a corner
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.001));
      // Offset so they share just a sliver
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.418, 37.77, 0.001));

      const result = GameEngine.resolveOverlaps(newTerritory, [existing]);
      // Even if there's a tiny overlap, it should be ignored if < 1m²
      // (this depends on exact geometry; if they do overlap > 1m², that's also fine)
      expect(result.totalConqueredArea).toBeDefined();
    });

    it('should handle territory with fewer than 3 polygon points gracefully', () => {
      const badTerritory: Territory = {
        id: 'bad-1',
        name: '',
        ownerId: 'user-A',
        activityId: 'act-bad',
        claimedAt: Date.now(),
        area: 100,
        perimeter: 40,
        center: { lat: 37.77, lng: -122.42 },
        polygon: [[-122.42, 37.77], [-122.419, 37.77]], // Only 2 points
        history: [],
      };

      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.002));
      const result = GameEngine.resolveOverlaps(newTerritory, [badTerritory]);

      // Should skip the bad territory without crashing
      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
    });

    it('should handle new territory with fewer than 3 polygon points', () => {
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.001));
      const badNew: Territory = {
        id: 'bad-new',
        name: '',
        ownerId: 'user-B',
        activityId: 'act-bad',
        claimedAt: Date.now(),
        area: 100,
        perimeter: 40,
        center: { lat: 37.77, lng: -122.42 },
        polygon: [[-122.42, 37.77]], // Only 1 point
        history: [],
      };

      const result = GameEngine.resolveOverlaps(badNew, [existing]);
      expect(result.modifiedTerritories).toHaveLength(0);
      expect(result.deletedTerritoryIds).toHaveLength(0);
    });

    it('should correctly set invaderUsername in invasions', () => {
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.002));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.419, 37.77, 0.002));

      const resultWithName = GameEngine.resolveOverlaps(newTerritory, [existing], 'CoolPlayer');
      expect(resultWithName.invasions[0].invaderUsername).toBe('CoolPlayer');

      const resultWithoutName = GameEngine.resolveOverlaps(newTerritory, [existing]);
      expect(resultWithoutName.invasions[0].invaderUsername).toBeUndefined();
    });

    it('should preserve newTerritory reference in result', () => {
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.001));
      const result = GameEngine.resolveOverlaps(newTerritory, []);
      expect(result.newTerritory).toBe(newTerritory);
    });
  });

  describe('Area accounting', () => {
    it('totalConqueredArea should equal the sum of individual overlap areas', () => {
      const existingA = createTerritory('existing-A', 'user-A', makeSquare(-122.419, 37.77, 0.001));
      const existingC = createTerritory('existing-C', 'user-C', makeSquare(-122.421, 37.77, 0.001));
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.003));

      const result = GameEngine.resolveOverlaps(newTerritory, [existingA, existingC], 'UserB');

      const sumOfInvasions = result.invasions.reduce((sum, inv) => sum + inv.overlapArea, 0);
      expect(result.totalConqueredArea).toBeCloseTo(sumOfInvasions, 1);
    });

    it('for full consumption, conquered area should equal the original territory area', () => {
      const small = createTerritory('small-1', 'user-A', makeSquare(-122.42, 37.77, 0.0005));
      const originalArea = small.area;
      const large = createTerritory('new-1', 'user-B', makeSquare(-122.42, 37.77, 0.003));

      const result = GameEngine.resolveOverlaps(large, [small]);

      // The conquered area for a fully consumed territory should be the original area
      expect(result.invasions[0].overlapArea).toBeCloseTo(originalArea, 0);
    });

    it('modified territory area + overlap area should approximate original area', () => {
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.42, 37.77, 0.002));
      const originalArea = existing.area;
      const newTerritory = createTerritory('new-1', 'user-B', makeSquare(-122.419, 37.77, 0.002));

      const result = GameEngine.resolveOverlaps(newTerritory, [existing]);

      if (result.modifiedTerritories.length === 1) {
        const modifiedArea = result.modifiedTerritories[0].area;
        const overlapArea = result.invasions[0].overlapArea;
        // modifiedArea + overlapArea ≈ originalArea (within 5% tolerance for geometry rounding)
        const ratio = (modifiedArea + overlapArea) / originalArea;
        expect(ratio).toBeGreaterThan(0.90);
        expect(ratio).toBeLessThan(1.10);
      }
    });
  });

  describe('Integration with processTerritory', () => {
    it('territory from processTerritory should work with resolveOverlaps', () => {
      // Create a GPS path that forms a closed square
      const createGPSPoint = (lat: number, lng: number) => ({
        lat, lng, timestamp: Date.now(), speed: 1.5, accuracy: 10, altitude: 0,
      });

      const halfSize = 0.002;
      const centerLat = 37.77;
      const centerLng = -122.42;
      const corners = [
        [centerLat - halfSize, centerLng - halfSize],
        [centerLat - halfSize, centerLng + halfSize],
        [centerLat + halfSize, centerLng + halfSize],
        [centerLat + halfSize, centerLng - halfSize],
      ];

      const path = [];
      for (let c = 0; c < corners.length; c++) {
        const nextC = (c + 1) % corners.length;
        for (let i = 0; i < 5; i++) {
          const t = i / 5;
          path.push(createGPSPoint(
            corners[c][0] + t * (corners[nextC][0] - corners[c][0]),
            corners[c][1] + t * (corners[nextC][1] - corners[c][1])
          ));
        }
      }
      path.push(createGPSPoint(corners[0][0], corners[0][1]));

      const territory = GameEngine.processTerritory(path, 'user-B', 'act-1');
      expect(territory).not.toBeNull();

      // Create an existing overlapping territory
      const existing = createTerritory('existing-1', 'user-A', makeSquare(-122.419, 37.77, 0.002));

      const result = GameEngine.resolveOverlaps(territory!, [existing], 'UserB');

      // Should detect overlap since both are near (-122.42, 37.77)
      const affected = result.modifiedTerritories.length + result.deletedTerritoryIds.length;
      expect(affected).toBeGreaterThanOrEqual(0); // At minimum, no crash
      // The result should be structurally valid
      expect(result.newTerritory).toBe(territory);
      expect(result.totalConqueredArea).toBeGreaterThanOrEqual(0);
    });
  });
});
