require("./helpers/load-modules");
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
require('../src/models/metrics.js');
const renderer = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/views/3d/renderer.js'), 'utf8') + '\nFloorPlanFacades3D;', { window: {}, FloorPlanMetrics });
const plan = () => {
  const entries = [{ id: 'down', floorId: 'ground' }, { id: 'up', floorId: 'upper' }];
  return { currentFloorId: 'ground', currentConfig: { floors: [{ id: 'ground', z0: 0 }, { id: 'upper', z0: 3 }] },
    allRooms: entries, allItems: entries, allOpenings: entries, allWindows: entries,
    allRoofs: [{ id: 'roof' }],
    wallRenderParts: [{ id: 'wall', from: [0, 0, 0], to: [2, 0, 0], pos: [0, 0, 0], size: [2, 0.12, 7], z0: 0, z1: 7 }],
    independentWalls: new Map([['wall', { z0: 0, topZ: 7, x0: () => 0 }]]) };
};

test('3D uses the only visible floor on load even when the active floor is hidden', () => {
  const source = plan();
  source.selectedFloorIds = new Set(['upper']);
  source.showAllFloors = false;
  source.currentConfig.floors[0].visible = false;
  const view = renderer.floorView(source);
  assert.equal(view.visibleFloor.id, 'upper');
  assert.equal(view.allRooms[0].id, 'up');
  assert.equal(view.wallRenderParts[0].z0, 3);
  assert.equal(source.currentFloorId, 'ground');
});

test('adjacent split levels do not cut rear walls or doors at the front slab height', () => {
  const source = plan();
  source.currentConfig.floors = [
    { id: 'ground', z0: -0.34 },
    { id: 'front', z0: 0 },
    { id: 'upper', z0: 3 },
  ];
  source.allSlabs = [
    { floorId: 'ground', parts: [{ x: 0, y: 10, w: 10, l: 10 }] },
    { floorId: 'front', parts: [{ x: 0, y: 0, w: 10, l: 10 }] },
    { floorId: 'upper', parts: [{ x: 0, y: 0, w: 10, l: 20 }] },
  ];
  source.allOpenings = [{ id: 'door', floorId: 'ground', z0: -0.34, z1: 1.76 }];
  source.wallRenderParts[0].z0 = -0.34;
  const view = renderer.floorView(source);
  assert.deepEqual(Array.from(view.visibleFloorRange), [-0.34, 3]);
  assert.equal(view.wallRenderParts[0].z0, -0.34);
  assert.equal(view.wallRenderParts[0].z1, 3);
  assert.equal(view.allOpenings[0].z0, -0.34);
  assert.ok(view.allOpenings[0].z1 < view.wallRenderParts[0].z1);
  source.wallRenderParts[0].sourceRoomIds = ['down'];
  source.currentFloorId = 'front';
  assert.equal(renderer.floorView(source).wallRenderParts.length, 0);
  source.currentFloorId = 'upper';
  assert.equal(renderer.floorView(source).wallRenderParts.length, 1);
  source.showAllFloors = true;
  assert.equal(renderer.floorView(source).wallRenderParts.length, 1);
});

test('ground view selects rooms, furniture and openings and clips walls at the next floor', () => {
  const source = plan();
  const view = renderer.floorView(source);
  for (const key of ['allRooms', 'allItems', 'allOpenings', 'allWindows']) {
    assert.equal(view[key].length, 1);
    assert.equal(view[key][0].id, 'down');
  }
  assert.equal(view.wallRenderParts[0].size[2], 3);
  assert.equal(view.independentWalls.get('wall').topZ, 3);
  assert.equal(source.wallRenderParts[0].size[2], 7);
  assert.equal(source.allRooms.length, 2);
});
test('upper view keeps walls extending to the roof and retains world elevations', () => {
  const source = plan(); source.currentFloorId = 'upper';
  const view = renderer.floorView(source);
  assert.equal(view.allRooms[0].id, 'up');
  assert.equal(view.wallRenderParts[0].pos[2], 3);
  assert.equal(view.wallRenderParts[0].size[2], 4);
  assert.equal(view.wallRenderParts[0].z1, 7);
  assert.equal(view.independentWalls.get('wall').z0, 3);
  assert.equal(view.allRoofs, source.allRoofs);
});
test('single-floor legacy configuration is unchanged', () => {
  const source = { currentConfig: { rooms: [] } };
  assert.equal(renderer.floorView(source), source);
});

test('3D combines independent floor selections without changing the prepared model', () => {
  const source = plan();
  source.currentConfig.floors.push({ id: 'attic', z0: 6 });
  source.allRooms = [...source.allRooms, { id: 'loft', floorId: 'attic' }];
  source.selectedFloorIds = new Set(['ground', 'attic']);
  source.showAllFloors = true;
  const view = renderer.floorView(source);
  assert.equal(view.allRooms.map(room => room.id).join(','), 'down,loft');
  assert.equal(view.allItems.map(item => item.id).join(','), 'down');
  assert.equal(source.allRooms.length, 3);
  source.selectedFloorIds = new Set();
  assert.equal(renderer.floorView(source).allRooms.length, 0);
  assert.equal(renderer.floorView(source).wallRenderParts.length, 0);
});

test('all-floors mode restores the complete model without clipping wall heights', () => {
  const source = plan(); source.showAllFloors = true; source.currentFloorId = 'upper';
  const view = renderer.floorView(source);
  assert.equal(view, source);
  assert.equal(view.allRooms.length, 2);
  assert.equal(view.allItems.length, 2);
  assert.equal(view.wallRenderParts[0].size[2], 7);
  source.showAllFloors = false;
  assert.equal(renderer.floorView(source).allRooms[0].id, 'up');
});

test('wall scope filters by owning floor even when its volume spans both floors', () => {
  const source = plan();
  source.wallRenderParts.push({ ...source.wallRenderParts[0], id: 'scoped', scopeFloorId: 'upper' });
  source.independentWalls.set('scoped', { ...source.independentWalls.get('wall'), scopeFloorId: 'upper' });
  const ground = renderer.floorView(source);
  assert.equal(ground.wallRenderParts.length, 1);
  assert.equal(ground.independentWalls.has('scoped'), false);
  source.currentFloorId = 'upper';
  const upper = renderer.floorView(source);
  assert.equal(upper.wallRenderParts.length, 2);
  assert.equal(upper.independentWalls.has('scoped'), true);
  source.showAllFloors = true;
  assert.equal(renderer.floorView(source), source);
  assert.equal(source.independentWalls.size, 2);
});

test('ground view retains the terrain-to-floor plinth and hides it on upper floors', () => {
  const source = plan();
  source.wallRenderParts.push({ id: 'plinth', scopeFloorId: 'ground', base: 'terrain',
    from: [0, 0, -6], to: [2, 0, -6], pos: [0, 0, -6], size: [2, 0.12, 6], z0: -6, z1: 0 });
  source.independentWalls.set('plinth', { scopeFloorId: 'ground', base: 'terrain', z0: -6, topZ: 0 });
  const ground = renderer.floorView(source);
  assert.equal(ground.wallRenderParts.find((wall) => wall.id === 'plinth').z0, -6);
  assert.ok(ground.independentWalls.has('plinth'));
  source.currentFloorId = 'upper';
  const upper = renderer.floorView(source);
  assert.ok(!upper.wallRenderParts.some((wall) => wall.id === 'plinth'));
  assert.ok(!upper.independentWalls.has('plinth'));
});

test('multiple selected floors retain separate wall ranges and exclude unselected geometry', () => {
  const source = plan();
  source.currentConfig.floors.push({ id: 'attic', z0: 6 });
  source.allRooms.push({ id: 'top', floorId: 'attic' });
  source.selectedFloorIds = new Set(['ground', 'attic']);
  source.showAllFloors = true;
  const view = renderer.floorView(source);
  assert.deepEqual(Array.from(view.allRooms, room => room.id), ['down', 'top']);
  assert.deepEqual(Array.from(view.wallRenderParts, wall => [wall.z0, wall.z1]), [[0, 3], [6, 7]]);
  assert.equal(view.visibleFloorConfigs.length, 2);
  assert.equal(source.wallRenderParts[0].z1, 7);
});


test('roof selection remains independent when all floors are unchecked', () => {
  const source = plan();
  source.selectedFloorIds = new Set();
  source.showAllFloors = true;
  source.showRoofs = true;
  source.allRoofs = [{ id: 'rear-roof', floorId: 'ground' }, { id: 'upper-roof', floorId: 'upper' }];
  const view = renderer.floorView(source);
  assert.equal(view.allRooms.length, 0);
  assert.equal(view.wallRenderParts.length, 0);
  assert.equal(view.allRoofs, source.allRoofs);
  assert.equal(view.showRoofs, true);
});

test('coplanar sectors do not clip walls to zero height', () => {
  const source = plan();
  source.currentConfig.floors[0].storey = 'upper';
  source.currentConfig.floors[1].storey = 'upper';
  source.currentConfig.floors[1].z0 = 0;
  assert.equal(renderer.nextFloorAbove(source, source.currentConfig.floors[0]), undefined);
  const view = renderer.floorView(source);
  assert.equal(view.wallRenderParts[0].z1, 7);
});

test('scoped terrain plinth keeps its ground contact on the higher split ground floor', () => {
  const source = plan();
  source.currentConfig.floors = [
    { id: 'rear', z0: -0.34 },
    { id: 'ground', z0: 0.3 },
    { id: 'upper', z0: 3 },
  ];
  source.wallRenderParts = [{
    id: 'plinth', scopeFloorId: 'ground', base: 'terrain',
    from: [0, 0, -6], to: [2, 0, -6], pos: [0, 0, -6],
    size: [2, 0.12, 6.45], z0: -6, z1: 0.45, h: 6.45,
  }];
  source.independentWalls = new Map([['plinth', {
    scopeFloorId: 'ground', base: 'terrain', z0: -6, topZ: 0.45,
  }]]);
  const view = renderer.floorView(source);
  assert.equal(view.wallRenderParts[0].z0, -6);
  assert.equal(view.wallRenderParts[0].pos[2], -6);
  assert.equal(view.wallRenderParts[0].z1, 0.45);
  assert.equal(view.independentWalls.get('plinth').z0, -6);
  source.currentFloorId = 'upper';
  assert.equal(renderer.floorView(source).wallRenderParts.length, 0);
  assert.equal(renderer.floorView(source).independentWalls.size, 0);
});
