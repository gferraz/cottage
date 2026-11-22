const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-modules');
for (const name of ['models/terrain', 'config/catalog', 'config/coordinates', 'models/geometry',
  'models/geometry-domain', 'models/walls', 'config/parser', 'models/model', 'models/validation',
  'models/openings', 'models/references', 'views/elements', 'views/3d/slabs', 'models/headroom',
  'exports/html', 'main', 'views/dom', 'views/3d/elements']) require(`../src/${name}.js`);

const flight = (values = {}) => ({ ownerId: 'stairs', id: 'flight', classes: 'stair-flight',
  x: 0, y: 0, w: 2, l: 1, z0: 0, z1: 1, h: 1, risers: 3,
  stairAxis: 'horizontal', stairDirection: 'forward', stairRise: 'up', ...values });
const surface = (height, x = 0, w = 2) => ({ polygons: [
  [[x, 0, height], [x + w, 0, height], [x + w, 1, height], [x, 1, height]],
] });
const analyze = (parts, surfaces = []) => FloorPlanStairHeadroom.above(parts, surfaces).get('stairs');

test('each whole tread uses its lowest clearance under a sloping roof, including narrow covered corners', () => {
  const roof = { polygons: [[[0, 0, 3], [2, 0, 5], [2, 1, 5], [0, 1, 3]]] };
  const result = analyze([flight()], [roof]);
  const steps = result.parts.get('flight').steps;
  assert.ok(Math.abs(steps[0].minimum - (3 - 1 / 3)) < 1e-8);
  assert.ok(Math.abs(steps[1].minimum - (4 - 2 / 3)) < 1e-8);
  assert.equal(result.active, true);
  const narrow = analyze([flight()], [surface(2, 0.99, 0.02)]).parts.get('flight').steps;
  assert.ok(narrow.every(step => step.minimum < 2));
});

test('gradient fallback is shared by the whole stair, with a strict 2.70 m boundary', () => {
  const landing = { ...flight(), id: 'landing', classes: 'stair-landing', x: 2, w: 1, h: 0, z0: 1, z1: 1 };
  assert.equal(analyze([flight(), landing]).active, false);
  assert.equal(analyze([flight()], [surface(4)]).active, false);
  const single = flight({ risers: 2 }); // one tread at z = 0.5
  assert.equal(analyze([single], [surface(3.2)]).active, false);
  assert.equal(analyze([single], [surface(3.199)]).active, true);
  const mixed = analyze([flight(), landing], [surface(2.5, 2, 1)]);
  assert.equal(mixed.active, true);
  assert.equal(mixed.parts.get('flight').steps[0].minimum, Infinity);
  assert.equal(mixed.parts.get('landing').steps[0].minimum, 1.5);
});

test('ignore the source itself and floors below treads; include other stair undersides and penetrating covers', () => {
  assert.equal(analyze([flight()], [surface(-1)]).active, false);
  assert.equal(analyze([flight({ risers: 2 })], [surface(0.5)]).parts.get('flight').steps[0].minimum, 0);
  const upper = flight({ ownerId: 'other-stair', id: 'upper', z0: 2, z1: 3 });
  assert.ok(analyze([flight(), upper]).parts.get('flight').steps.every(step => step.minimum < 2));
  const crossing = { polygons: [[[0, 0, 0], [2, 0, 1], [2, 1, 1], [0, 1, 0]]] };
  assert.equal(analyze([flight()], [crossing]).parts.get('flight').steps[0].minimum, 0);
});

test('a vertical opening removes the slab obstruction and preserves the source floor', () => {
  const source = { floors: [
    { id: 'ground', z0: 0, ceiling_height: 3, rooms: [{ id: 'ground-room', pos: [0, 0], size: [2, 1], walls: [] }],
      stairs: [{ id: 'stairs', risers: 3, from: [0, 0, 0], to: [2, 1, 1], orientation: 'transverse' }] },
    { id: 'upper', z0: 2, ceiling_height: 3, rooms: [{ id: 'upper-room', pos: [0, 0], size: [2, 1], walls: [] }],
      openings: [{ id: 'well', from: 'ground', to: 'upper', rectangle: [0, 0, 2, 1] }] },
  ] };
  const prepare = config => {
    const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
    plan.prepareProject(config);
    assert.deepEqual(plan.errors, []);
    return plan;
  };
  const closed = structuredClone(source);
  closed.floors[1].openings = [];
  assert.equal(prepare(closed).stairAboveHeadroom.get('stairs').active, true);
  const open = prepare(source);
  assert.equal(open.stairAboveHeadroom.get('stairs').active, false);
  assert.equal(open.allSlabs.find(s => s.floorId === 'upper').parts.length, 0);
  assert.equal(open.allSlabs.find(s => s.floorId === 'ground').parts.reduce((s, p) => s + p.w * p.l, 0), 2);
  const intermediate = structuredClone(source);
  intermediate.floors.splice(1, 0, { id: 'mezzanine', z0: 1.5, ceiling_height: 3,
    rooms: [{ id: 'mezzanine-room', pos: [0, 0], size: [2, 1], walls: [] }] });
  assert.equal(prepare(intermediate).allSlabs.find(s => s.floorId === 'mezzanine').parts.length, 0);
  const reversed = structuredClone(source);
  Object.assign(reversed.floors[1].openings[0], { from: 'upper', to: 'ground' });
  assert.equal(prepare(reversed).stairAboveHeadroom.get('stairs').active, false);
  const partial = structuredClone(source);
  partial.floors[1].openings[0].rectangle = [0, 0, 1.99, 1];
  assert.equal(prepare(partial).stairAboveHeadroom.get('stairs').active, true);
});

test('headroom appearance replaces the gradient in 2D and 3D with the same discrete colors', () => {
  const part = flight();
  const plan = { stairAboveHeadroom: new Map([['stairs', analyze([part], [surface(2)])]]) };
  const properties = {};
  const element = { dataset: {}, style: { setProperty: (key, value) => { properties[key] = value; } } };
  FloorPlanDom.applyStairAppearance(plan, element, part, { base: 0, top: 1 }, 'stairs');
  assert.equal(element.dataset.stairGradient, 'headroom');
  assert.ok(properties['--stair-headroom-background'].startsWith('url('));
  assert.ok(!properties['--stair-headroom-background'].includes('linear-gradient'));
  assert.ok(properties.background.startsWith('var(--stair-headroom-background, linear-gradient('));
  const step = plan.stairAboveHeadroom.get('stairs').parts.get('flight').steps[0];
  const base = { clone: () => ({ color: { set(value) { this.value = value; } } }) };
  const elements = require('node:vm').runInNewContext(
    require('node:fs').readFileSync('src/views/3d/elements.js', 'utf8') + '\nFloorPlan3DElements;',
    { FloorPlanStairHeadroom });
  const material = elements.heightMaterial(plan, {}, base, part, step.z1);
  assert.equal(material.color.value, FloorPlanStairHeadroom.aboveColor(step.minimum));
});

test('office clearance includes stair undersides without a roof or slab', () => {
  const source = { floors: [{ id: 'ground', z0: 0.3, ceiling_height: 3,
    rooms: [{ id: 'office', pos: [0, 0], size: [2.4, 1.3], walls: [], overlaps: ['stairs'] }],
    stairs: [{ id: 'stairs', overlays: ['office'], parts: [{ id: 'upper-flight',
      risers: 9, orientation: 'transverse', from: [0, 0, 1.8], to: [2.4, 1.3, 3.3], walls: [] }] }],
  }] };
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(source);
  const result = plan.headroomResults.get('office');
  assert.ok(Math.abs(result.covered.area - 3.12) < 1e-8);
  assert.ok(Math.abs(result.areas[1].area - 1.716) < 1e-8);
  assert.ok(Math.abs(result.heightRange.min - 1.5) < 0.0001);
  assert.ok(Math.abs(result.heightRange.max - 2.833333) < 0.0001);
});
