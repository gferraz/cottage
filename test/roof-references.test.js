const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/models/geometry.js');
require('../src/models/geometry-domain.js');
require('../src/models/validation.js');
require('../src/models/references.js');
require('../src/views/roofs.js');

const createPlan = () => ({
  references: new Map(), errors: [], partReferenceStack: [], currentFloorHeight: 0,
  resolve: FloorPlanGeometry.resolve,
  resolveExpression: FloorPlanGeometry.resolveExpression,
  normalizeGeometry(data) { return FloorPlanGeometryDomain.normalizeGeometry(this, data); },
  normalizeGeometryAtFloor(data) { return this.normalizeGeometry(data); },
});

test('roof references resolve later roofs before dependent headroom zones', () => {
  const plan = createPlan();
  FloorPlanReferences.registerRoofReferences(plan, { roofs: [
    { id: 'office-roof', rectangle: [0, 0, 3.8, 'transverse-roof.y0 + 0.8'] },
    { id: 'transverse-roof', rectangle: [0, 4.5, 9.6, 11.1] },
  ] });
  assert.deepEqual(plan.errors, []);
  const zone = plan.normalizeGeometry({ rectangle: [
    'office-roof.x0 + 1.619569', 'office-roof.y0',
    'office-roof.x1 - 1.619569', 'office-roof.y1',
  ] });
  assert.ok(Math.abs(zone.w - 0.560862) < 1e-8);
  assert.equal(zone.l, 5.3);
});

test('cyclic and missing roof references terminate with errors', () => {
  const plan = createPlan();
  FloorPlanReferences.registerRoofReferences(plan, { roofs: [
    { id: 'a', base: 'b' }, { id: 'b', base: 'a' }, { id: 'c', base: 'missing' },
  ] });
  assert.deepEqual(plan.errors.map(error => error.id), ['a', 'b', 'c']);
  assert.equal(plan.references.size, 0);
});
