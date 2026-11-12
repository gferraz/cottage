const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/config/coordinates.js');

test('Symbolic reflection preserves local origins, asymmetric insets and roof defaults', () => {
  const config = {
    config: { roofs: { eaves: { left: 'params.a', right: 'params.b', pitch: 30 }, rake: [0.1, 0.4] } },
    zones: [{ id: 'box', rectangle: [2, 1, 'x0 + 4', 'y0 + 6'] },
      { id: 'inside', inset: ['box', 'params.a', 0, 'params.b', 0] }],
    roofs: [{ id: 'a', base: 'box', orientation: 'longitudinal' },
      { id: 'b', base: 'box', orientation: 'transverse' }],
  };
  const result = FloorPlanCoordinates.reflectX(config);
  assert.deepEqual(result.zones[0].rectangle, [-6, 1, -2, 'y0 + 6']);
  assert.deepEqual(result.zones[1].inset, ['box', 'params.b', 0, 'params.a', 0]);
  assert.deepEqual(result.roofs[0].eaves, { left: 'params.b', right: 'params.a', pitch: 30 });
  assert.deepEqual(result.roofs[1].eaves, { left: 'params.a', right: 'params.b', pitch: 30 });
  assert.deepEqual(result.roofs[1].rake, [0.4, 0.1]);
  const roundtrip = FloorPlanCoordinates.reflectX(result);
  assert.deepEqual(roundtrip.zones, config.zones.map((zone, i) => i ? zone : { ...zone, rectangle: [2, 1, 6, 'y0 + 6'] }));
  assert.deepEqual(roundtrip.roofs[0].eaves, config.config.roofs.eaves);
});
