require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/models/model.js');

test('presentation sorts by Z, front Y and authored X without changing the model order', () => {
  const floors = [
    { id: 'upper', z0: 3, rooms: [{ id: 'upper' }] },
    { id: 'rear', z0: 0, rooms: [{ id: 'rear' }] },
    { id: 'right', z0: 0, rooms: [{ id: 'right' }] },
    { id: 'left', z0: 0, rooms: [{ id: 'left' }] },
    { id: 'same', z0: 0, rooms: [{ id: 'same' }] },
    { id: 'empty', z0: 0 },
  ];
  const source = floors.slice();
  const reference = (x, y) => ({ x0: () => -x - 2, x1: () => -x, y0: () => y });
  const plan = { model: { floors, coordinateSystem: 'cartesian' }, roomReferences: new Map([
    ['upper', reference(0, 0)], ['rear', reference(0, 5)],
    ['right', reference(4, 0)], ['left', reference(-4, 0)], ['same', reference(-4, 0)],
  ]) };
  assert.deepEqual(FloorPlanModel.presentationFloors(plan).map(floor => floor.id),
    ['left', 'same', 'right', 'rear', 'empty', 'upper']);
  assert.deepEqual(floors, source);
});

test('storeys group split levels before sorting front to rear', () => {
  const floors = [
    { id: 'rear', storey: 'ground', z0: -0.34, rooms: [{ id: 'rear' }] },
    { id: 'front', storey: 'ground', z0: 0.3, rooms: [{ id: 'front' }] },
    { id: 'upper-rear', storey: 'upper', z0: 2.66, rooms: [{ id: 'upper-rear' }] },
    { id: 'upper-front', storey: 'upper', z0: 3, rooms: [{ id: 'upper-front' }] },
  ];
  const reference = y => ({ x0: () => 0, x1: () => 4, y0: () => y });
  const plan = { model: { floors }, roomReferences: new Map([
    ['rear', reference(8)], ['front', reference(0)],
    ['upper-rear', reference(8)], ['upper-front', reference(0)],
  ]) };
  assert.deepEqual(FloorPlanModel.presentationFloors(plan).map(floor => floor.id),
    ['front', 'rear', 'upper-front', 'upper-rear']);
  assert.equal(floors[0].z0, -0.34);
});
