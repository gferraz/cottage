const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
for (const module of ['models/geometry-box', 'views/roofs', 'models/walls', 'models/model', 'exports/dxf', 'models/validation']) require(`../src/${module}.js`);
const roofs = FloorPlanRoofs;
const base = FloorPlanGeometryBox.fromValues({ x: 1, y: 2, w: 4, l: 2, z0: 0, h: 3 });
const fixture = (definitions = []) => ({ allRoofs: definitions, currentConfig: { ceiling_height: 3 },
  references: new Map([['base', base]]), resolve: Number });
const definition = (extra = {}) => ({ id: 'porch-roof', type: 'shed', base: 'base', orientation: 'transverse',
  slope: 'top', pitch: 45, z0: 3, eave: 0, rake: 0, ...extra });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const at = (g, x, y) => { const [a, b, c, d] = g.slopes[0]; return -(a * x + b * y + d) / c; };
const area = (entries) => entries.flatMap((entry) => entry.polygons).reduce((sum, p) => sum + Math.abs(p.reduce((v, a, i) => {
  const b = p[(i + 1) % p.length]; return v + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2, 0);

test('shed has one plane with the low edge at z0 for all four slope directions', () => {
  for (const [orientation, slope, low, high, rise] of [
    ['longitudinal', 'left', [1, 2], [5, 2], 4],
    ['longitudinal', 'right', [5, 2], [1, 2], 4],
    ['transverse', 'top', [1, 2], [1, 4], 2],
    ['transverse', 'bottom', [1, 4], [1, 2], 2],
  ]) {
    const roof = definition({ orientation, slope });
    const g = roofs.shedGeometry(fixture(), roof);
    assert.equal(g.slopes.length, 1);
    close(at(g, ...low), 3); close(at(g, ...high), 3 + rise);
    close(g.rise, rise); close(g.surfaceArea, 8 * Math.SQRT2);
    const surfaces = roofs.intersectingSurfaces(fixture([roof]));
    assert.equal(surfaces[0].polygons.length, 1);
    close(area(surfaces), 8);
    assert.equal(roofs.surfaceEdges(surfaces[0].polygons).length, 8);
  }
});

test('asymmetric overhangs extend the same slope while wall clipping ignores eaves', () => {
  const roof = definition({ eave: [0.5, 0.2], rake: [0.3, 0.4] });
  const g = roofs.shedGeometry(fixture(), roof);
  close(g.y0, 1.5); close(g.y1, 4.2); close(g.x0, 0.7); close(g.x1, 5.4);
  close(g.minZ, 2.5); close(g.peakZ, 5.2);
  close(g.surfaceArea, 4.7 * 2.7 * Math.SQRT2);
  const [limit] = FloorPlanWalls.roofLimits(fixture([roof]));
  close(limit.bounds[2][3], 2); close(-limit.bounds[3][3], 4);
  close(limit.peakZ, 5);
  assert.deepEqual(limit.slopes, g.slopes);
  const section = FloorPlanWalls.roofSection([[0, 0], [1, 0], [1, 8], [0, 8]], [3, 2], [3, 4], [limit], true);
  assert.ok(section.length);
  for (const polygon of section) for (const [t, z] of polygon) assert.ok(z <= at(g, 3, 2 + 2 * t) + 1e-8);
});

test('shed and gable intersections keep only the upper envelope and remove coplanar duplicates', () => {
  const shed = definition();
  const gable = { ...shed, id: 'main', type: 'gable', orientation: 'longitudinal' };
  const plan = fixture([shed, gable]);
  const surfaces = roofs.intersectingSurfaces(plan);
  close(area(surfaces), 8);
  const g = roofs.shedGeometry(plan, shed);
  for (const entry of surfaces) for (const p of entry.polygons) {
    const [x, y, z] = [0, 1, 2].map((i) => p.reduce((sum, v) => sum + v[i], 0) / p.length);
    assert.ok(z >= at(g, x, y) - 1e-8);
    assert.ok(z >= 5 - Math.abs(x - 3) - 1e-8);
  }
  close(area(roofs.intersectingSurfaces(fixture([shed, { ...shed, id: 'duplicate' }]))), 8);
});

test('shed rejects incompatible directions, bad dimensions, slopes and overhangs', () => {
  for (const extra of [{ slope: 'left' }, { slope: 'invalid' }, { orientation: 'invalid' },
    { pitch: 0 }, { pitch: 90 }, { pitch: -5 }, { z0: 'invalid' }, { eave: -1 }, { rake: [0, NaN] }]) {
    assert.throws(() => roofs.shedGeometry(fixture(), definition(extra)));
  }
  assert.equal(roofs.shedGeometry(fixture(), definition({ slope: undefined })).slope, 'bottom');
});

test('shed metrics and defaults retain its full-span rise and valid surface direction', () => {
  const roof = definition();
  const metrics = FloorPlanExport.roofMetrics(fixture(), roof);
  close(metrics.rise, 2); close(metrics.baseElevation, 3); close(metrics.surfaceArea, 8 * Math.SQRT2);
  assert.equal(FloorPlanExport.roofMetrics(fixture(), { ...roof, slope: 'left' }), null);
  assert.equal(FloorPlanValidation.roofOpeningSurfaceError(roof, 'top'), null);
  assert.match(FloorPlanValidation.roofOpeningSurfaceError(roof, 'bottom'), /não existe/);
  const normalized = FloorPlanModel.fromConfig({ config: { roofs: { type: 'shed', slope: 'top' } }, roofs: [{ base: 'base' }] }).config;
  assert.equal(normalized.roofs[0].slope, 'top');
});

test('DXF exports four inclined shed edges with vertex elevations and no ridge entity', () => {
  const roof = definition({ eave: [0.5, 0] });
  const plan = fixture([roof]);
  plan.currentConfig.roofs = [roof];
  const dxf = FloorPlanExport.toDxf(plan);
  const tokens = dxf.trim().split('\n');
  const entities = [];
  let entity;
  for (let i = 0; i < tokens.length; i += 2) {
    const code = tokens[i], value = tokens[i + 1];
    if (code === '0') { entity = { type: value }; entities.push(entity); }
    else if (entity) entity[code] = value;
  }
  const edges = entities.filter((entry) => entry.type === 'LINE' && entry['8'] === 'ROOFS');
  assert.equal(edges.length, 4);
  assert.equal(entities.filter((entry) => entry.type === 'LINE' && entry['8'] === 'ROOF_RIDGES').length, 0);
  for (const edge of edges) {
    const geometry = roofs.shedGeometry(plan, roof);
    close(Number(edge['30']), at(geometry, Number(edge['10']), Number(edge['20'])));
    close(Number(edge['31']), at(geometry, Number(edge['11']), Number(edge['21'])));
  }
});

test('a lower canopy can preserve its full footprint beneath higher roof overhangs', () => {
  const canopy = definition({ clip_intersections: false });
  const higher = { ...definition(), id: 'upper-roof', type: 'gable', orientation: 'longitudinal', z0: 6 };
  const entries = roofs.intersectingSurfaces(fixture([canopy, higher]));
  const canopyEntry = entries.find((entry) => entry.roof.id === canopy.id);
  close(area([canopyEntry]), 8);
  assert.equal(canopyEntry.polygons.length, 1);
  const automatic = roofs.intersectingSurfaces(fixture([{ ...canopy, clip_intersections: true }, higher]));
  close(area([automatic[0]]), 0);
  close(area([entries[1]]), 8);
});
