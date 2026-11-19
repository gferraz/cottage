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

require('../src/models/overlap-analysis.js');
test('projected stairs keep source layers without validating source dependencies against the destination floor', () => {
  const element = (id, projected = false) => ({
    dataset: { id, floorId: 'upper', ...(projected ? { spanningStair: 'true' } : {}) },
    geometryParts: [{ id: projected ? 'lower-flight' : id, x: 0, y: 0, w: 2, l: 2 }],
    allowedOverlaps: [], allowedOverlays: projected ? ['powder', 'laundry'] : [],
    classList: { remove() {}, add() {} }, style: { setProperty() {} },
  });
  const stair = element('stairs', true);
  const room = element('stair-arrival');
  const plan = { roomElements: [room], stairElements: [stair], itemElements: [], errors: [],
    stairSourceLayers: new Map([['stairs.lower-flight', 2]]), updateLayerVisibility() {} };
  FloorPlanLayers.updateOverlaps(plan);
  assert.deepEqual(plan.errors, []);
  assert.equal(stair.dataset.layer, '2');
  assert.equal(plan.maxLayer, 2);
  plan.roomElements.push(element('other-room'));
  FloorPlanLayers.updateOverlaps(plan);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].category, 'collision');
});
