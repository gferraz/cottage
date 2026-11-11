const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const renderer = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/views/3d/renderer.js'), 'utf8') + '\nFloorPlanFacades3D;', { window: {} });
const plan = () => {
  const entries = [{ id: 'down', floorId: 'ground' }, { id: 'up', floorId: 'upper' }];
  return { currentFloorId: 'ground', currentConfig: { floors: [{ id: 'ground', z0: 0 }, { id: 'upper', z0: 3 }] },
    allRooms: entries, allItems: entries, allOpenings: entries, allWindows: entries,
    allRoofs: [{ id: 'roof' }],
    wallRenderParts: [{ id: 'wall', from: [0, 0, 0], to: [2, 0, 0], pos: [0, 0, 0], size: [2, 0.12, 7], z0: 0, z1: 7 }],
    independentWalls: new Map([['wall', { z0: 0, topZ: 7, x0: () => 0 }]]) };
};

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
