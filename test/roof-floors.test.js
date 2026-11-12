const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/roofs.js');

test('explicit roof elevations select the supporting floor before footprint overlap', () => {
  const ground = { id: 'ground', z0: 0 };
  const upper = { id: 'upper', z0: 3 };
  const plan = { currentConfig: { floors: [ground, upper] }, resolve: Number };
  for (const roof of [{ z0: 4 }, { from: [0, 0, 4] }, { pos: [0, 0, 4] }]) {
    assert.equal(FloorPlanRoofs.floorForRoof(plan, roof, roof), upper);
  }
  assert.equal(FloorPlanRoofs.floorForRoof(plan, { z0: 2.7 }, {}), ground);
  assert.equal(FloorPlanRoofs.floorForRoof(plan, { floorId: 'ground', z0: 4 }, {}), ground);
});
