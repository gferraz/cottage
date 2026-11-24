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

test('prepared headroom bands partition coverage and retain cumulative threshold areas', () => {
  const input = { parts: [{ x: 0, y: 0, w: 4, l: 2 }], z0: 0 };
  const surfaces = [{ polygons: [[[0, 0, 1], [4, 0, 3], [4, 2, 3], [0, 2, 1]]] }];
  const result = FloorPlanHeadroomAnalysis.analyzeRoom(input, surfaces, []);
  [6.8, 3.6, 2.8, 0.6, 0].forEach((expected, i) => close(result.areas[i].area, expected));
  [1.2, 3.2, 0.8, 2.2, 0.6, 0].forEach((expected, i) => close(result.bands[i].area, expected));
  close(result.bands.reduce((sum, band) => sum + band.area, 0), result.covered.area);
  assert.equal(result.bands[5].labelPosition, null);
  close(result.bands[0].labelPosition[0], 0.3);
});

test('headroom preparation does not mutate frozen inputs or depend on presentation flags', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const input = freeze({ parts: [room], z0: 0, comfort_zones: false });
  const overhead = freeze([{ polygons: [[[0, 0, 4], [4, 0, 4], [4, 4, 4], [0, 4, 4]]] }]);
  const original = structuredClone({ input, overhead });
  const hidden = FloorPlanHeadroomAnalysis.analyzeRoom(input, overhead, []);
  const visible = FloorPlanHeadroomAnalysis.analyzeRoom({ ...input, comfort_zones: true }, overhead, []);
  assert.deepEqual(hidden, visible);
  assert.deepEqual({ input, overhead }, original);
  assert.ok(hidden.areas.every(entry => entry.area === 16));
});

test('single gable produces exact threshold areas relative to room floor', () => {
  const result = comfort.calculate([room], surfaces([roof('single')]), 0);
  close(result[0].area, 13.6);
  close(result[1].area, 7.2);
  close(result[2].area, 5.6);
  close(result[3].area, 1.2);
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
  comfort.calculate([room], flat, 0).forEach(entry => close(entry.area, entry.height <= 3 ? 8 : 0));
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


test('slab underside limits clearance while openings retain roof clearance', () => {
  const slabs = [{ z: 3, thickness: 0.15, parts: [{ x: 0, y: 0, w: 2, l: 4 }] },
    { z: 0, thickness: 0.15, parts: [room] }];
  const overhead = [{ polygons: [[[0, 0, 5], [4, 0, 5], [4, 4, 5], [0, 4, 5]]] },
    ...FloorPlanHeadroomAnalysis.slabSurfaces(slabs)];
  const result = FloorPlanHeadroomAnalysis.analyzeRoom({ parts: [room], z0: 0 }, overhead, []);
  close(result.covered.area, 16);
  close(result.areas.find(entry => entry.height === 2.1).area, 16);
  close(result.areas.find(entry => entry.height === 2.85).area, 16);
  close(result.areas.find(entry => entry.height === 3.1).area, 8);
  close(FloorPlanHeadroomAnalysis.calculate([room], overhead, 0, [], [2.85])[0].area, 16);
  close(FloorPlanHeadroomAnalysis.calculate([room], overhead, 0, [], [2.86])[0].area, 8);
});

test('height range reports the lowest overhead surface and the area above 2.10 m', () => {
  const result = FloorPlanHeadroomAnalysis.analyzeRoom(
    { z0: 0, parts: [{ x: 0, y: 0, w: 4, l: 4 }] },
    [{ polygons: [[[0, 0, 1], [4, 0, 5], [4, 4, 5], [0, 4, 1]]] },
      { polygons: [[[0, 0, 2.5], [4, 0, 2.5], [4, 4, 2.5], [0, 4, 2.5]]] }], [],
  );
  assert.ok(Math.abs(result.heightRange.min - 1) < 0.0001);
  assert.ok(Math.abs(result.heightRange.max - 2.5) < 0.0001);
  assert.ok(Math.abs(result.areas.find(entry => entry.height === 2.1).area - 11.6) < 1e-8);
});
