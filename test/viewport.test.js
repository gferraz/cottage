require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/views/viewport.js');

test('responsive scale changes redraw existing elevations once at the new scale', () => {
  const styles = new Map();
  const definitions = [{ direction: 'front' }];
  const calls = [];
  const plan = {
    viewport: { size: [24, 32] }, viewportScale: 56,
    root: { parentElement: { clientWidth: 960 }, style: { setProperty: (key, value) => styles.set(key, value) } },
    facadeDefinitions: definitions,
    facadeLayer: { querySelector: () => ({}) },
    renderFacades: value => calls.push([value, plan.viewportScale]),
  };
  FloorPlanViewport.resize(plan);
  assert.equal(styles.get('--m'), '40px');
  assert.deepEqual(calls, [[definitions, 40]]);
  FloorPlanViewport.resize(plan);
  assert.equal(calls.length, 1);
  plan.root.parentElement.clientWidth = 720;
  FloorPlanViewport.resize(plan);
  assert.equal(calls[1][1], 30);
});
