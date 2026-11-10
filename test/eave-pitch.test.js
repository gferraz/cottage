const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/views/roofs.js');
const base = FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 6, h: 3 });
const plan = { references: new Map([['base', base]]), currentConfig: {}, resolve: Number };
for (const type of ['gable', 'shed']) for (const orientation of ['longitudinal', 'transverse']) {
  test(`${type} ${orientation} keeps support heights and changes only eave slopes`, () => {
    const roof = { type, orientation, base: 'base', pitch: 45, eaves: { left: 1, right: 2, pitch: 0 }, rake: 0.5, z0: 3 };
    const polygons = FloorPlanRoofs.intersectingSurfaces(plan, [roof])[0].polygons;
    const axis = orientation === 'longitudinal' ? 0 : 1;
    const end = axis === 0 ? 4 : 6;
    for (const p of polygons.flat()) {
      const t = Math.max(0, Math.min(end, p[axis]));
      const expected = type === 'gable' ? 3 + Math.min(t, end - t) : 3 + end - t;
      assert.ok(Math.abs(p[2] - expected) < 1e-8);
    }
    assert.ok(polygons.length >= 3);
    const copy = { ...roof, eaves: { ...roof.eaves, pitch: 45 } };
    const points = FloorPlanRoofs.intersectingSurfaces(plan, [copy])[0].polygons.flat();
    for (const p of points) {
      const expected = type === 'gable' ? 3 + end / 2 - Math.abs(p[axis] - end / 2) : 3 + end - p[axis];
      assert.ok(Math.abs(p[2] - expected) < 1e-8);
    }
  });
}
test('invalid eave angles fail explicitly', () => {
  for (const pitch of [-1, 90, 'invalid']) assert.throws(() => FloorPlanRoofs.eavePitch({ eaves: { pitch } }));
});
test('crossed flared roofs retain one result per roof without duplicate projected area', () => {
  const roofs = ['longitudinal', 'transverse'].map((orientation) => ({ type: 'gable', orientation, base: 'base', pitch: 45, eaves: { left: 1, right: 1, pitch: 20 }, z0: 3 }));
  const results = FloorPlanRoofs.intersectingSurfaces(plan, roofs);
  assert.equal(results.length, 2);
  const area = results.flatMap(r => r.polygons).reduce((sum, p) => sum + Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2, 0);
  assert.ok(Math.abs(area - 44) < 1e-8, String(area));
});
