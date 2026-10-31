const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry-box.js');
require('../src/views/roofs.js');
const roofs = globalThis.FloorPlanRoofs;
const base = globalThis.FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 4, z0: 0, h: 3 });
const fixture = (definitions) => ({ allRoofs: definitions, currentConfig: { wall_max_height: 3 },
  references: new Map([['base', base]]), resolve: Number });
const definition = (id, orientation = 'longitudinal', extra = {}) => ({ id, orientation, type: 'gable', base: 'base', pitch: 45, ...extra });
const area = (entries) => entries.flatMap(entry => entry.polygons).reduce((sum, polygon) => sum + Math.abs(polygon.reduce((total, [x, y], i) => {
  const next = polygon[(i + 1) % polygon.length];
  return total + x * next[1] - next[0] * y;
}, 0)) / 2, 0);

test('crossed gables end on their intersection lines without double coverage', () => {
  const plan = fixture([definition('long'), definition('cross', 'transverse')]);
  const entries = roofs.intersectingSurfaces(plan);
  assert.ok(Math.abs(area(entries) - 16) < 1e-8);
  for (const { roof, polygons } of entries) for (const polygon of polygons) {
    const center = [0, 1, 2].map(axis => polygon.reduce((sum, point) => sum + point[axis], 0) / polygon.length);
    const otherHeight = roof.orientation === 'longitudinal' ? 5 - Math.abs(center[1] - 2) : 5 - Math.abs(center[0] - 2);
    assert.ok(center[2] >= otherHeight - 1e-8);
  }
  const edges = roofs.surfaceEdges(entries.flatMap(entry => entry.polygons));
  assert.ok(edges.length > 0);
});
test('coplanar overlapping roofs are drawn once deterministically', () => {
  const entries = roofs.intersectingSurfaces(fixture([definition('first'), definition('second')]));
  assert.ok(Math.abs(area(entries) - 16) < 1e-8);
  assert.equal(entries[1].polygons.length, 0);
});
test('higher roof hides lower roof while separated roofs remain intact', () => {
  const entries = roofs.intersectingSurfaces(fixture([definition('low'), definition('high', 'longitudinal', { z0: 6 })]));
  assert.equal(entries[0].polygons.length, 0);
  assert.ok(Math.abs(area(entries) - 16) < 1e-8);
  assert.equal(roofs.intersectingSurfaces(fixture([definition('single')]))[0].polygons.length, 2);
});
test('outline keeps ridge and intersection creases but omits coplanar seams', () => {
  const entries = roofs.intersectingSurfaces(fixture([definition('single')]));
  const edges = roofs.surfaceEdges(entries[0].polygons);
  let ridge = false;
  for (let i = 0; i < edges.length; i += 2) {
    if (edges[i][0] === 2 && edges[i + 1][0] === 2 && edges[i][2] === 5 && edges[i + 1][2] === 5) ridge = true;
  }
  assert.ok(ridge);
});

test('disjoint roof footprints are not truncated and preserve their overhangs', () => {
  const plan = fixture([definition('first', 'longitudinal', { eave: [0.5, 1], rake: [0.2, 0.4] }),
    definition('far', 'transverse', { base: 'far-base' })]);
  plan.references.set('far-base', globalThis.FloorPlanGeometryBox.fromValues({ x: 20, y: 20, w: 4, l: 4, z0: 0, h: 3 }));
  const entries = roofs.intersectingSurfaces(plan);
  assert.ok(Math.abs(area([entries[0]]) - 5.5 * 4.6) < 1e-8);
  assert.ok(Math.abs(area([entries[1]]) - 16) < 1e-8);
});
