require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['config/catalog', 'config/coordinates', 'config/parser', 'models/terrain',
  'models/geometry', 'models/geometry-domain', 'models/model', 'models/validation', 'models/metrics',
  'models/walls', 'views/roofs', 'models/openings', 'models/references', 'main']) require(`../src/${name}.js`);
const prepare = (config) => {
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  plan.prepareGlobalLists(model.config);
  return plan;
};

const floor = (id, z0, extra = {}) => ({ id, z0, ceiling_height: 3, rooms: [], ...extra });
const config = (extra = {}) => ({ floors: [floor('ground', 0), floor('upper', 3)], ...extra });
const flight = (id, extra = {}) => ({ id, from: [0, 0, 0], to: [1.2, 3, 3], orientation: 'longitudinal', ...extra });

test('global scoped stairs and floor stairs register geometry without adding rooms or default walls', () => {
  const plan = prepare(config({ stairs: [flight('global', { scope: 'upper', from: [4, 0], to: [5.2, 3, 6] })],
    floors: [floor('ground', 0, { rooms: [{ id: 'room', pos: [10, 0], size: [3, 3] }], stairs: [flight('local')] }), floor('upper', 3)] }));
  assert.deepEqual(plan.allRooms.map(r => r.id), ['room']);
  assert.deepEqual(plan.allStairs.map(r => r.id), ['global', 'local']);
  assert.equal(plan.model.rooms.length, 1);
  assert.equal(plan.model.stairs.length, 2);
  assert.equal(plan.roomFloorConfigs.get('global').id, 'upper');
  assert.equal(plan.references.get('global').z0(), 3);
  assert.equal(plan.references.get('global').z1(), 6);
  assert.equal(plan.references.get('local').normalizedParts[0].stairAxis, 'vertical');
  assert.deepEqual(plan.stairDefinitions.get('local').walls, []);
  assert.equal([...plan.walls.values()].some(wall => wall.roomId === 'local'), false);
});

test('compound stairs infer flights and landings and expose global part references', () => {
  const plan = prepare(config({ stairs: [{ id: 'stairs', parts: [flight('flight'),
    { id: 'landing', kind: 'landing', pos: ['flight.x0', 'flight.y1', 3], size: [1.2, 1, 0] }] }] }));
  assert.equal(plan.references.get('flight').z1(), 3);
  assert.equal(plan.references.get('landing').y0(), 3);
  assert.equal(plan.references.get('stairs').normalizedParts[1].classes, 'stair-landing');
  assert.equal(plan.allRooms.length, 0);
  assert.equal(plan.errors.filter(e => e.category === 'stair').length, 0);
});

test('stairs report global duplicate IDs, missing scope and invalid risers', () => {
  const plan = prepare(config({ stairs: [flight('same'), flight('same'), flight('missing', {scope:'none'}), flight('bad', {risers: 1})] }));
  assert.ok(plan.errors.some(e => e.category === 'stair' && /duplicado/.test(e.message)));
  assert.ok(plan.errors.some(e => e.category === 'stair' && /desconhecido/.test(e.message)));
  assert.ok(plan.errors.some(e => e.category === 'stair' && e.id === 'bad'));
  assert.ok(plan.invalidRoomIds.has('bad'));
});

test('Cartesian first-class stair coordinates are reflected exactly once', () => {
  const plan = prepare(config({ coordinate_system: 'cartesian', stairs: [flight('cart', { from: [2, 0, 0], to: [4, 3, 3] })] }));
  assert.equal(plan.references.get('cart').x0(), -4);
  assert.equal(plan.references.get('cart').x1(), -2);
});

test('stair IDs cannot shadow roofs and invalid part kinds are reported', () => {
  const plan = prepare(config({ roofs: [{ id: 'roof', from: [0,0], to: [4,4], type:'gable', orientation:'longitudinal', pitch:30 }],
    stairs: [flight('roof'), {id:'invalid-kind', parts:[flight('part', {kind:'other'})]}] }));
  assert.ok(plan.errors.some(e => e.category === 'stair' && /duplicado/.test(e.message)));
  assert.ok(plan.errors.some(e => e.category === 'stair' && /Tipo de parte/.test(e.message)));
  assert.equal(plan.stairDefinitions.has('roof'), false);
});
