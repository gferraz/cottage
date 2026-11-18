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
