const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-modules');
for (const name of ['models/terrain', 'config/catalog', 'config/coordinates', 'models/geometry',
  'models/geometry-domain', 'models/walls', 'config/parser', 'models/model', 'models/validation',
  'models/openings', 'models/references', 'views/elements', 'views/3d/slabs', 'models/headroom',
  'exports/html', 'main']) require(`../src/${name}.js`);
const prepare = (config) => {
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(config);
  return plan;
};
const config = () => ({ floors: [
  { id: 'ground', z0: 0, ceiling_height: 3, rooms: [
    { id: 'room', pos: [0, 0], size: [4, 4], walls: [] },
  ], stairs: [{ id: 'access', from: [4, 0, 0], to: [5.2, 3, 3], orientation: 'longitudinal', risers: 18 }] },
  { id: 'upper', z0: 3, ceiling_height: 3, rooms: [
    { id: 'upper-room', pos: [0, 0], size: [4, 4], walls: [] },
  ] },
] });
test('first-class stairs keep access and clearance analyses without room area or generated slabs', () => {
  const plan = prepare(config());
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.allRooms.map(r => r.id), ['room', 'upper-room']);
  assert.deepEqual(plan.allStairs.map(s => s.id), ['access']);
  assert.equal(plan.references.get('access').z1(), 3);
  assert.equal(plan.stairConnectivity.nodes.length, 1);
  assert.equal(plan.derivedZones.length, 2);
  assert.ok(plan.stairHeadroomResults.some(r => r.ownerId === 'access'));
  const rows = FloorPlanModel.floorRows(plan.model.floors, plan.roomDefinitions, plan.roomReferences);
  assert.deepEqual(rows.map(r => r.count), [1, 1]);
  assert.deepEqual(rows.map(r => r.area), [16, 16]);
  assert.ok(plan.allSlabs.every(s => s.parts.every(p => p.x + p.w <= 4)));
});
test('walls can use a first-class stair at its declared floor as their upper limit', () => {
  const source = config();
  source.floors[0].stairs = [];
  source.floors[1].stairs = [{ id: 'upper-access', from: [4, 0, 3], to: [5.2, 3, 6], orientation: 'longitudinal' }];
  const plan = prepare(source);
  const limits = FloorPlanWalls.undersideLimits(plan, { under: 'upper-access' });
  assert.equal(limits.length, 1);
  assert.equal(limits[0].peakZ, 6);
});

test('room walls accept direct top expressions and independent wall references resolve the same height', () => {
  const source = config();
  source.floors[0].rooms[0].walls = ['left'];
  source.floors[0].rooms[0].top = 'upper.z0 - 0.15';
  source.walls = [{ id: 'limit', from: [0,0], to: [1,0], base: { level: 0 }, top: 'upper.z0 - 0.15' }];
  const plan = prepare(source);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.references.get('limit').z1(), 2.85);
  assert.equal(plan.independentWalls.get('limit').topZ, 2.85);
  assert.equal(plan.walls.get('room-left').z1, 2.85);
});

test('compound stair part walls generate 3D wall volumes at the part elevation and keep owner identity', () => {
  const source = config();
  source.floors[0].stairs = [{ id: 'access', walls: [], parts: [
    { id: 'lower', from: [4, 0, 0], to: [6.4, 1.3, 1.5], orientation: 'transverse', risers: 9, walls: [] },
    { id: 'landing', kind: 'landing', from: [6.4, 0, 1.5], to: [7.7, 2.8, 1.5], walls: [] },
    { id: 'upper-flight', from: [6.4, 1.5, 1.5], to: [4, 2.8, 3], orientation: 'transverse', risers: 9,
      walls: ['rear', 'right'] },
  ] }];
  const plan = prepare(source);
  assert.deepEqual(plan.errors, []);
  const walls = [...plan.walls.values()].filter(wall => wall.id.startsWith('access.upper-flight-'));
  assert.equal(walls.length, 2);
  for (const wall of walls) {
    assert.equal(wall.z0, 1.5);
    assert.equal(wall.z1, 3);
    assert.deepEqual(wall.sourceRoomIds, ['access']);
    assert.equal(wall.sourceSides[0].partId, 'upper-flight');
    assert.ok(plan.wallRenderParts.some(part => part.id === wall.id));
  }
  assert.ok(![...plan.walls.keys()].some(id => id.startsWith('access.lower-') || id.startsWith('access.landing-')));
  const drawn = [];
  plan.showAllFloors = true;
  plan.roomElements = [];
  plan.stairElements = [{ dataset: { id: 'access', layer: '1' } }];
  plan.add = definition => {
    const element = { dataset: {}, style: { setProperty() {} } };
    drawn.push({ definition, element });
    return element;
  };
  plan.renderWallsForFloor(plan.model.floors[0]);
  const drawnStairWalls = drawn.filter(({ definition }) => definition.id.startsWith('access.upper-flight-'));
  assert.equal(drawnStairWalls.length, 2);
  assert.ok(drawnStairWalls.every(({ element }) => element.dataset.layer === '1'));
  source.floors[0].stairs[0].parts[2].top = 'upper.z0 + 1.1';
  const taller = prepare(source);
  assert.deepEqual(taller.errors, []);
  assert.ok(Math.abs(taller.walls.get('access.upper-flight-bottom').z1 - 4.1) < 1e-8);
});
