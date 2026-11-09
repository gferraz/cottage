const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/lists.js');
require('../src/models/openings.js');

function fixture(orientation = 'vertical') {
  const room = (id, x, y) => ({
    dataset: { id }, wallState: () => 'none', z0: () => 3,
    x0: () => x, x1: () => x + 4, y0: () => y, y1: () => y + 4,
  });
  return {
    roomElements: [room('a', 0, 0), room('b', orientation === 'vertical' ? 4 : 0, orientation === 'vertical' ? 0 : 4)],
    roomFloorConfigs: new Map(['a', 'b'].map((id) => [id, { id: 'upper', z0: 3 }])),
    independentWalls: new Map(),
    wallSegment(room, side) { return FloorPlanOpenings.wallSegment(this, room, side); },
  };
}
const detect = (plan) => FloorPlanLists.findNaturalCommunications(plan);
const wall = (points, overrides = {}) => ({
  path: { points }, z0: 3, z1: 5, thickness: 0.12, scopeFloorId: 'upper', ...overrides,
});

test('independent walls close shared boundaries in both orientations, including reversed paths', () => {
  for (const orientation of ['vertical', 'horizontal']) {
    const plan = fixture(orientation);
    assert.equal(detect(plan)[0].length, 4);
    const points = orientation === 'vertical' ? [[4, 4], [4, 0]] : [[4, 4], [0, 4]];
    plan.independentWalls.set('boundary', wall(points));
    assert.deepEqual(detect(plan), []);
  }
});

test('partial and overlapping wall segments leave only the uncovered length', () => {
  const plan = fixture();
  plan.independentWalls.set('first', wall([[4, 0], [4, 2]]));
  plan.independentWalls.set('second', wall([[4, 1], [4, 3]]));
  assert.equal(detect(plan)[0].length, 1);
});

test('walls on other floors, above the floor, or away from the boundary do not close it', () => {
  for (const candidate of [
    wall([[4, 0], [4, 4]], { scopeFloorId: 'ground' }),
    wall([[4, 0], [4, 4]], { z0: 4 }),
    wall([[4, 0], [4, 4]], { z0: 0, z1: 3 }),
    wall([[5, 0], [5, 4]]),
  ]) {
    const plan = fixture();
    plan.independentWalls.set('boundary', candidate);
    assert.equal(detect(plan)[0].length, 4);
  }
});

test('rooms on different floors do not communicate through coincident boundaries', () => {
  const plan = fixture();
  plan.roomFloorConfigs.set('b', { id: 'ground', z0: 0 });
  assert.deepEqual(detect(plan), []);
});
