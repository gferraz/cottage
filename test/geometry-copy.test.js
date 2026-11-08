const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/models/geometry.js');
require('../src/models/geometry-domain.js');
require('../src/models/references.js');
const domain = globalThis.FloorPlanGeometryDomain;
const planFor = (box) => ({
  references: new Map([['source', box]]), partReferenceStack: [], currentFloorHeight: 0,
  resolve: globalThis.FloorPlanGeometry.resolve,
  resolveExpression: globalThis.FloorPlanGeometry.resolveExpression,
  normalizeGeometry(data) { return domain.normalizeGeometry(this, data); },
});

test('copy reuses live rectangular bounds and vertical extent without inheriting appearance', () => {
  let width = 4;
  const source = { x0: () => 1, y0: () => 2, w: () => width, l: () => 5, z0: () => 3, h: () => 2 };
  const plan = planFor(source);
  const data = { id: 'copy', copy: 'source', color: 'blue', label: 'Copy' };
  const geometry = domain.normalizeGeometry(plan, data);
  assert.deepEqual([geometry.x, geometry.y, geometry.w, geometry.l, geometry.z0, geometry.z1], [1, 2, 4, 5, 3, 5]);
  assert.equal(geometry.color, 'blue');
  assert.equal(geometry.id, 'copy');
  assert.equal(data.x, undefined);
  width = 6;
  assert.equal(domain.normalizeGeometry(plan, data).w, 6);
});

test('copy resolves forward local part references and rejects cycles', () => {
  const plan = planFor({});
  const parts = globalThis.FloorPlanReferences.normalizeParts(plan, [
    { id: 'a-copy', copy: 'z-source' },
    { id: 'z-source', from: [1, 2, 3], to: [5, 7, 6] },
  ]);
  assert.deepEqual([parts[0].x, parts[0].y, parts[0].w, parts[0].h], [1, 2, 4, 3]);
  assert.throws(() => globalThis.FloorPlanReferences.normalizeParts(plan, [
    { id: 'a', copy: 'b' }, { id: 'b', copy: 'a' },
  ]), /circular/);
});

test('copy rejects missing references, invalid bounds and conflicting geometry', () => {
  const box = globalThis.FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 5, z0: 0, h: 3 });
  const plan = planFor(box);
  for (const copy of ['', null, 123, 'missing']) assert.throws(() => domain.normalizeGeometry(plan, { copy }));
  for (const key of ['pos', 'size', 'rectangle', 'inset', 'outset', 'from', 'to', 'x', 'y', 'w', 'l', 'z0', 'h', 'parts']) {
    assert.throws(() => domain.normalizeGeometry(plan, { copy: 'source', [key]: [] }), /Copy não pode/);
  }
  assert.throws(() => domain.normalizeGeometry(planFor({ ...box, w: () => NaN }), { copy: 'source' }), /válida/);
});

test('catalog size defaults do not conflict with an explicit copy', () => {
  const plan = planFor(globalThis.FloorPlanGeometryBox.fromValues({ x: 1, y: 2, w: 4, l: 5, z0: 0, h: 1 }));
  plan.itemTypes = { table: { size: [2, 1, 0.75], classes: 'table' } };
  const result = domain.normalizeGeometry(plan, { type: 'table', copy: 'source' });
  assert.equal(result.w, 4);
  assert.equal(result.h, 1);
  assert.equal(result.classes, 'table');
});
