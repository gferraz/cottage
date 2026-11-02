const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/models/geometry.js');
require('../src/models/geometry-domain.js');
require('../src/models/references.js');
const createPlan = () => ({
  partReferenceStack: [], references: new Map(), currentFloorHeight: 0,
  resolve: globalThis.FloorPlanGeometry.resolve,
  resolveExpression: globalThis.FloorPlanGeometry.resolveExpression,
  normalizeGeometry(data) { return globalThis.FloorPlanGeometryDomain.normalizeGeometry(this, data); },
});

test('compound parts resolve forward references while preserving requested output order', () => {
  const parts = [
    { id: 'upper-flight', from: [0, 0, 3], to: [2, 1, 1.67] },
    { id: 'upper-landing', from: ['upper-flight.x1', 0, 'upper-flight.z0'], to: ['x0 + 1', 1, 'z0'] },
    { id: 'lower-landing', from: ['upper-landing.x0', 1, 'upper-landing.z0'], to: ['x0 + 1', 2, 'z0'] },
    { id: 'flight-down', from: ['lower-landing.x0', 1, 'lower-landing.z0'], to: [0, 2, 0] },
  ];
  const original = globalThis.FloorPlanReferences.normalizeParts(createPlan(), parts);
  const sorted = [...parts].sort((a,b) => a.id.localeCompare(b.id));
  const plan = createPlan();
  const result = globalThis.FloorPlanReferences.normalizeParts(plan, sorted);
  assert.deepEqual(result.map(part => part.id), sorted.map(part => part.id));
  const dimensions = values => Object.fromEntries(values.map(part => [part.id,
    [part.x, part.y, part.w, part.l, part.z0, part.z1],
  ]));
  assert.deepEqual(dimensions(result), dimensions(original));
  assert.equal(plan.partReferenceStack.length, 0);
});

test('compound part cycles produce a useful error and clean the reference stack', () => {
  const plan = createPlan();
  assert.throws(() => globalThis.FloorPlanReferences.normalizeParts(plan, [
    { id: 'a', from: ['b.x0', 0], to: [2, 2] },
    { id: 'b', from: ['a.x0', 0], to: [3, 3] },
  ]), /Referência circular entre partes/);
  assert.equal(plan.partReferenceStack.length, 0);
});

require('../src/views/lists.js');
test('natural connections do not depend on the room array order', () => {
  const room = (id, x, y) => ({ dataset: { id }, x, y, wallState: () => 'open' });
  const rooms = [room('left', 0, 0), room('right', 2, 0), room('below', 0, 2)];
  const plan = { wallSegment(room, side) {
    const horizontal = side === 'top' || side === 'bottom';
    return {
      coordinate: horizontal ? room.y + (side === 'bottom' ? 2 : 0) : room.x + (side === 'right' ? 2 : 0),
      start: horizontal ? room.x : room.y,
      end: (horizontal ? room.x : room.y) + 2,
    };
  } };
  const canonical = values => values.map(value => [
    [value.firstId, value.secondId].sort().join(':'), value.orientation, value.length,
  ]).sort();
  const first = globalThis.FloorPlanLists.findNaturalCommunications(plan, rooms);
  assert.equal(first.length, 2);
  assert.deepEqual(canonical(first), canonical(globalThis.FloorPlanLists.findNaturalCommunications(plan, [...rooms].reverse())));
  rooms[0].wallState = side => side === 'right' ? 'solid' : 'open';
  assert.equal(globalThis.FloorPlanLists.findNaturalCommunications(plan, rooms).length, 1);
  assert.equal(globalThis.FloorPlanLists.findNaturalCommunications(plan, [...rooms].reverse()).length, 1);
});
