require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/models/walls.js');

test('a door cuts all coincident wall volumes without duplicating its panel', () => {
  const wall = { id: 'garage-left', from: [10, 9.7], to: [10, 16.2], z0: -0.34, z1: 7 };
  const door = { wallId: 'upper-service-left-wall', element: {},
    void: { horizontal: false, x: 10, y: 12.85, w: 0.8, z0: 3, z1: 5.1, h: 2.1 } };
  const [cut] = FloorPlanWalls.coincidentOpeningCuts(wall, [door]);
  for (const key of ["x", "y", "w", "z0", "z1", "h"])
    assert.ok(Math.abs(cut.void[key] - door.void[key]) < 1e-8, key);
  assert.equal(cut.element, null);
  assert.equal(FloorPlanWalls.coincidentOpeningCuts({ ...wall, z1: 3 }, [door]).length, 0);
  assert.equal(FloorPlanWalls.coincidentOpeningCuts({ ...wall, id: door.wallId }, [door]).length, 0);
  assert.equal(FloorPlanWalls.coincidentOpeningCuts({ ...wall, from: [11, 9.7], to: [11, 16.2] }, [door]).length, 0);
  const [clipped] = FloorPlanWalls.coincidentOpeningCuts({ ...wall, z0: 4 }, [door]);
  assert.equal(clipped.void.z0, 4);
  assert.ok(Math.abs(clipped.void.h - 1.1) < 1e-8);
});
