require("./helpers/load-modules");
const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/3d/slabs.js');

test('3D slabs follow independent floor selections', () => {
  const groups = [];
  const THREE = {
    MeshLambertMaterial: class {},
    Group: class { constructor() { this.userData = {}; } },
  };
  const plan = {
    selectedFloorIds: new Set(['front', 'rear']),
    allSlabs: ['front', 'rear', 'upper'].map(floorId => ({ floorId, key: floorId, parts: [] })),
  };
  FloorPlanSlabs.render({ plan, THREE, scene: { add: group => groups.push(group) } });
  assert.deepEqual(groups.map(group => group.userData.domainId), ['front', 'rear']);
  groups.length = 0;
  plan.selectedFloorIds.clear();
  FloorPlanSlabs.render({ plan, THREE, scene: { add: group => groups.push(group) } });
  assert.equal(groups.length, 0);
});

test('slabs preserve concave footprints, union overlaps and exclude stairs at each floor elevation', () => {
  const geometries = { a: [{ x: 0, y: 0, w: 4, l: 2 }], b: [{ x: 0, y: 1, w: 2, l: 3 }] };
  const floors = [{ id: 'ground', z0: 0, rooms: [{ id: 'a' }, { id: 'b' }, { id: 'stairs', classes: 'stair-flight' }] },
    { id: 'upper', z0: 3, rooms: [{ id: 'a' }], slabs: [{ id: 'upper-slab', thickness: 0.2 }] }];
  const slabs = FloorPlanSlabs.collect({ currentConfig: { floors }, getRoomGeometry: (id) => ({ geometryParts: geometries[id] }) });
  assert.equal(slabs.length, 2);
  assert.equal(slabs[0].parts.reduce((sum, p) => sum + p.w * p.l, 0), 12);
  assert.equal(slabs[1].z, 3);
  assert.equal(slabs[1].thickness, 0.2);
  assert.ok(!slabs[0].parts.some((p) => p.x >= 2 && p.y >= 2));
});

require('../src/models/openings.js');

test('slab openings preserve L-shaped parts and only cut their owning slab', () => {
  const floor = { id: 'upper', label: 'Dormitórios', z0: 3, rooms: [{ id: 'room' }], slabs: [
    { id: 'cut', openings: [{ id: 'well', parts: [
      { rectangle: [0, 0, 1, 3] }, { rectangle: [0, 2, 3, 3] },
    ] }] }, { id: 'intact', label: 'Outra laje' },
  ] };
  const plan = { currentConfig: { floors: [floor] },
    getRoomGeometry: () => ({ geometryParts: [{ x: 0, y: 0, w: 4, l: 4 }] }),
    normalizeGeometryAtFloor: ({ rectangle: [x, y, x1, y1] }) => ({ x, y, w: x1 - x, l: y1 - y }),
  };
  const slabs = FloorPlanSlabs.collect(plan);
  const area = slab => slab.parts.reduce((sum, part) => sum + part.w * part.l, 0);
  assert.equal(area(slabs[0]), 11);
  assert.equal(area(slabs[1]), 16);
  assert.equal(slabs[0].label, 'Dormitórios');
  assert.equal(slabs[1].label, 'Outra laje');
  assert.ok(slabs[0].parts.some(p => p.x <= 2 && p.x + p.w >= 2 && p.y <= 1 && p.y + p.l >= 1));
  const entries = FloorPlanOpenings.verticalForFloor(plan, floor);
  assert.equal(entries.length, 2);
  assert.ok(entries.every(entry => FloorPlanOpenings.isVerticalOpening(plan, entry)));
});

test('implicit slabs use the floor label and unlabeled slab keys stay distinct', () => {
  const floor = { id: 'ground', label: 'Térreo', z0: 0, rooms: [] };
  const plan = { currentConfig: { floors: [floor] } };
  assert.equal(FloorPlanSlabs.collect(plan)[0].label, 'Térreo');
  floor.slabs = [{}, {}];
  const slabs = FloorPlanSlabs.collect(plan);
  assert.notEqual(slabs[0].key, slabs[1].key);
});

test('stair projection accumulates slab opening parts instead of keeping only the last rectangle', () => {
  const element = { style: {} };
  const geometry = { x: 0, y: 0, w: 4, l: 4 };
  const clip = values => FloorPlanOpenings.clipProjection({}, element, geometry, { slabOpening: true, ...values });
  clip({ x: 0, y: 0, w: 1, l: 3 });
  clip({ x: 0, y: 2, w: 3, l: 1 });
  assert.match(element.style.clipPath, /^polygon\(evenodd,/);
  assert.equal(element.slabOpeningClips.length, 2);
  const path = element.style.clipPath;
  clip({ x: 10, y: 10, w: 1, l: 1 });
  assert.equal(element.style.clipPath, path);
});
