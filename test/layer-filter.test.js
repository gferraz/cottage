const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/layers.js');

test('above-zero hides the base while keeping all upper layers', () => {
  const layers = [0, 1, 2, 3];
  assert.deepEqual(layers.filter((layer) => FloorPlanLayers.isLayerVisible(layer, 'above-zero')), [1, 2, 3]);
  assert.deepEqual(layers.filter((layer) => FloorPlanLayers.isLayerVisible(layer, null)), layers);
  assert.deepEqual(layers.filter((layer) => FloorPlanLayers.isLayerVisible(layer, 0)), [0]);
  assert.deepEqual(layers.filter((layer) => FloorPlanLayers.isLayerVisible(layer, 1)), [0, 1]);
});
