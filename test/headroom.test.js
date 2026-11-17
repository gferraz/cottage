require("./helpers/load-modules");
const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/views/roofs.js');
require('../src/models/headroom.js');
const comfort = globalThis.FloorPlanHeadroom;
const room = { x: 0, y: 0, w: 4, l: 4 };
const roof = (id, orientation = 'longitudinal', extra = {}) => ({ id, orientation, type: 'gable', base: 'base', pitch: 45, z0: 1, ...extra });
const surfaces = definitions => FloorPlanRoofs.intersectingSurfaces({
  allRoofs: definitions, currentConfig: {}, resolve: Number,
  references: new Map([['base', FloorPlanGeometryBox.fromValues({ ...room, z0: 0, h: 1 })]]),
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('single gable produces exact threshold areas relative to room floor', () => {
  const result = comfort.calculate([room], surfaces([roof('single')]), 0);
  close(result[0].area, 13.6);
  close(result[1].area, 7.2);
  close(result[2].area, 0);
  const raised = comfort.calculate([room], surfaces([roof('single')]), 1);
  close(raised[0].area, 5.6);
  close(raised[1].area, 0);
});

test('crossed gables use the intersected envelope, including diagonal valleys', () => {
  const definitions = [roof('long'), roof('cross', 'transverse')];
  const result = comfort.calculate([room], surfaces(definitions), 0);
  // The high region is the union of two crossing strips.
  close(result[0].area, 16 - 0.6 * 0.6);
  close(result[1].area, 16 - 2.2 * 2.2);
  assert.ok(result[1].area > comfort.calculate([room], surfaces([definitions[0]]), 0)[1].area);
  close(comfort.calculate([room], surfaces(definitions.reverse()), 0)[1].area, result[1].area);
});

test('retained low roof limits the high roof; coplanar coverage is counted once', () => {
  const definitions = [roof('low', 'longitudinal', { clip_intersections: false }), roof('high', 'transverse', { z0: 6 })];
  close(comfort.calculate([room], surfaces(definitions), 0)[1].area, 7.2);
  close(comfort.calculate([room], surfaces([roof('a'), roof('b')]), 0)[1].area, 7.2);
});

test('compound room pieces and deductions do not double-count overlapping footprints', () => {
  const parts = [room, { x: 2, y: 2, w: 3, l: 3 }];
  const flat = [{ polygons: [[[0, 0, 4], [6, 0, 4], [6, 6, 4], [0, 6, 4]]] }];
  const result = comfort.calculate(parts, flat, 0, [{ x: 0, y: 0, w: 1, l: 1 }, { x: 0, y: 0, w: 1, l: 1 }]);
  result.forEach(entry => close(entry.area, 20));
});

test('missing roofs and roofs entirely below the floor yield zero area', () => {
  comfort.calculate([room], [], 0).forEach(entry => close(entry.area, 0));
  comfort.calculate([room], surfaces([roof('below')]), 5).forEach(entry => close(entry.area, 0));
});

test('shed, flat threshold equality and partially uncovered rooms are handled', () => {
  const result = comfort.calculate([room], surfaces([roof('shed', 'transverse', { type: 'shed' })]), 0);
  close(result[1].area, 11.6);
  const flat = [{ polygons: [[[0, 0, 3], [2, 0, 3], [2, 4, 3], [0, 4, 3]]] }];
  comfort.calculate([room], flat, 0).forEach(entry => close(entry.area, 8));
});


test('existing plans show comfort zones by default and explicit settings override inheritance', () => {
  const plan = { roomDefinitions: new Map([['bedroom', {}]]), roomFloorConfigs: new Map([['bedroom', {}]]), currentConfig: {} };
  assert.equal(comfort.enabled(plan, 'bedroom'), true);
  plan.currentConfig.comfort_zones = false;
  assert.equal(comfort.enabled(plan, 'bedroom'), false);
  plan.roomFloorConfigs.get('bedroom').comfort_zones = true;
  assert.equal(comfort.enabled(plan, 'bedroom'), true);
  plan.roomDefinitions.get('bedroom').comfort_zones = false;
  assert.equal(comfort.enabled(plan, 'bedroom'), false);
});


test('below 1.3 m band covers only roof-covered floor and excludes the higher band', () => {
  const entries = surfaces([roof('single')]);
  const covered = comfort.calculate([room], entries, 0, [], [0])[0];
  const higher = comfort.calculate([room], entries, 0)[0];
  let band = covered.polygons;
  for (const cutter of higher.polygons) band = band.flatMap(polygon => comfort.subtract(polygon, cutter));
  close(band.reduce((sum, polygon) => sum + comfort.area(polygon), 0), 2.4);
  close(comfort.calculate([room], [], 0, [], [0])[0].area, 0);
});
