const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/walls.js');
const walls = globalThis.FloorPlanWalls;
test('opening finds a shared wall declared only by the neighboring room', () => {
  const sharedWall = {
    id: 'hall-left', axis: 'y', thickness: 0.12, z0: 0, z1: 3,
    from: [3, 2.5, 0], to: [3, 4, 0],
    sourceSides: [{ roomId: 'hall', side: 'left' }],
  };
  const plan = {
    walls: new Map([[sharedWall.id, sharedWall]]), independentWalls: new Map(),
    rooms: new Map([['office', { x0: () => -0.8, x1: () => 3, y0: () => 0, y1: () => 4 }]]),
  };
  const opening = { id: 'office-door', x: 3, y: 2.85, w: 0.8, z0: 0, h: 2.1 };
  assert.equal(walls.resolveRoomSide(plan, 'office', 'right', opening), sharedWall);
  for (const change of [{ y: 0 }, { x: 2 }, { z0: 2 }, { w: 2 }]) {
    assert.throws(() => walls.resolveRoomSide(plan, 'office', 'right', { ...opening, ...change }), /Nenhuma parede/);
  }
  plan.walls.set('duplicate', { ...sharedWall, id: 'duplicate' });
  assert.throws(() => walls.resolveRoomSide(plan, 'office', 'right', opening), /Mais de uma parede/);
});
const box = () => walls.boxFaces(0, 0, 0, 10, 1, 8);
const roof = {
  bounds: [[-1, 0, 0, 2], [1, 0, 0, -8], [0, -1, 0, -1], [0, 1, 0, -2]],
  slopes: [[-1, 0, 1, -1], [1, 0, 1, -11]],
};
const volume = (solids) => solids.reduce((sum, faces) => sum + Math.abs(faces.reduce((value, face) => {
  const a = face[0];
  for (let i = 1; i < face.length - 1; i++) {
    const b = face[i], c = face[i + 1];
    value += a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0]);
  }
  return value;
}, 0))/6, 0);

test('partial roof preserves uncovered wall and follows both slopes', () => {
  const solids = walls.roofSolids(box(), [roof]);
  assert.ok(Math.abs(volume(solids) - 59) < 1e-8);
  solids.flat(2).forEach(([x, , z]) => {
    if (x > 2 + 1e-8 && x < 8 - 1e-8) assert.ok(z <= Math.min(x + 1, 11 - x) + 1e-8);
  });
});
test('overlapping roofs apply the highest ceiling', () => {
  const lower = { ...roof, slopes: [[0, 0, 1, -2]] };
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [roof, lower])) - 59) < 1e-8);
});
test('roof outside wall and coplanar boundary leave its volume intact', () => {
  const outside = { ...roof, bounds: [[1, 0, 0, 0]] };
  assert.equal(volume(walls.roofSolids(box(), [outside])), 80);
  assert.equal(volume(walls.roofSolids(box(), [])), 80);
});
test('roof below the base removes covered volume without inverted faces', () => {
  const below = { ...roof, slopes: [[0, 0, 1, 1]] };
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [below])) - 32) < 1e-8);
});

test('transverse roof clips across wall thickness and closes the cut', () => {
  const transverse = {
    bounds: [[-1, 0, 0, -1], [1, 0, 0, -11], [0, -1, 0, 0], [0, 1, 0, -1]],
    slopes: [[0, -1, 1, -2], [0, 1, 1, -3]],
  };
  const solids = walls.roofSolids(box(), [transverse]);
  assert.ok(Math.abs(volume(solids) - 22.5) < 1e-8);
  solids.flat(2).forEach(([, y, z]) => assert.ok(z <= Math.min(y + 2, 3 - y) + 1e-8));
});

test('diagonal wall solids are clipped in world coordinates', () => {
  const diagonal = box().map((face) => face.map(([x, y, z]) => [x - y, x + y, z]));
  const limit = {
    bounds: [[-1, 0, 0, -20], [1, 0, 0, -20], [0, -1, 0, -20], [0, 1, 0, -20]],
    slopes: [[0, 0, 1, -3]],
  };
  assert.ok(Math.abs(volume(walls.roofSolids(diagonal, [limit])) - 60) < 1e-8);
});

const sectionArea = (polygons) => polygons.reduce((sum, polygon) => sum + Math.abs(polygon.reduce((area, [x, z], i) => {
  const next = polygon[(i + 1) % polygon.length];
  return area + x * next[1] - next[0] * z;
}, 0)) / 2, 0);

test('elevation retains uncovered ends and follows the ridge inside the wall span', () => {
  const polygons = walls.roofSection([[0, 0], [1, 0], [1, 8], [0, 8]], [0, 0], [10, 0], [roof]);
  assert.ok(Math.abs(sectionArea(polygons) - 5.9) < 1e-8);
  assert.ok(polygons.flat().some(([t, z]) => Math.abs(t - 0.5) < 1e-8 && Math.abs(z - 6) < 1e-8));
});
test('elevation uses the highest roof and leaves walls at other depths intact', () => {
  const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
  const lower = { ...roof, slopes: [[0, 0, 1, -2]] };
  assert.ok(Math.abs(sectionArea(walls.roofSection(polygon, [0, 0], [10, 0], [roof, lower])) - 5.9) < 1e-8);
  assert.equal(sectionArea(walls.roofSection(polygon, [0, 4], [10, 4], [roof])), 8);
});
test('elevation clips diagonal walls with sloping bases and removes covered walls above roof', () => {
  const limit = { bounds: [], slopes: [[0, 0, 1, -3]] };
  const polygons = walls.roofSection([[0, 0], [1, 1], [1, 8], [0, 8]], [0, 0], [10, 10], [limit]);
  assert.ok(Math.abs(sectionArea(polygons) - 2.5) < 1e-8);
  assert.deepEqual(walls.roofSection([[0, 4], [1, 4], [1, 8], [0, 8]], [0, 0], [10, 0], [limit]), []);
});
test('wall exactly on the roof footprint boundary is still clipped once', () => {
  const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
  const boundedRoof = { ...roof, bounds: [[-1, 0, 0, 2], [1, 0, 0, -8], [0, -1, 0, 0], [0, 1, 0, -1]] };
  assert.ok(Math.abs(sectionArea(walls.roofSection(polygon, [0, 0], [10, 0], [boundedRoof])) - 5.9) < 1e-8);
});

test('roof top omits uncovered portions in solids and elevations', () => {
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [roof], true)) - 27) < 1e-8);
  const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
  assert.ok(Math.abs(sectionArea(walls.roofSection(polygon, [0, 0], [10, 0], [roof], true)) - 2.7) < 1e-8);
  assert.deepEqual(walls.roofSolids(box(), [], true), []);
  assert.deepEqual(walls.roofSection(polygon, [0, 4], [10, 4], [roof], true), []);
});

test('roof coverage is the union of footprints, with the highest overlapping slope', () => {
  const second = { bounds: [[-1, 0, 0, 6], [1, 0, 0, -10]], slopes: [[0, 0, 1, -2]] };
  const result = walls.roofSolids(box(), [roof, second], true);
  assert.ok(Math.abs(volume(result) - 31) < 1e-8);
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [second, roof], true)) - 31) < 1e-8);
});

require('../src/models/geometry-box.js');
require('../src/models/geometry.js');
require('../src/models/validation.js');
require('../src/views/roofs.js');
const normalizeRoofWall = (withRoof = true, points = [[0, 0], [4, 0]], geometry = { path: { points } }, resolve = Number, defaults = undefined) => {
  const base = globalThis.FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 4, z0: 0, h: 3 });
  const config = {
    config: { walls: defaults },
    floors: [{ id: 'ground', z0: 0, wall_max_height: 3, rooms: [] }],
    roofs: withRoof ? [{ id: 'roof', base: 'base', type: 'gable', orientation: 'longitudinal', pitch: 45 }] : [],
    walls: [{ id: 'front-wall', base: { level: 0 }, top: 'roof', ...geometry }],
  };
  const plan = { currentConfig: config, references: new Map([['base', base]]),
    catalog: {}, roomDefinitions: new Map(), errors: [], allRoofs: [{ id: 'stale' }],
    resolve };
  walls.normalizeRoomWalls(plan, config);
  return plan;
};

test('independent walls inherit config.walls and keep explicit overrides', () => {
  const defaults = { base: { level: 1 }, top: { level: 4 }, thickness: 0.2, color: 'blue' };
  const plan = normalizeRoofWall(true, undefined, {
    from: [0, 0], to: [4, 0], base: undefined, top: undefined,
  }, Number, defaults);
  assert.deepEqual(plan.errors, []);
  const wall = plan.independentWalls.get('front-wall');
  assert.equal(wall.baseZ, 1);
  assert.equal(wall.topZ, 4);
  assert.equal(wall.thickness, 0.2);
  assert.equal(wall.color, 'blue');
  const override = normalizeRoofWall(true, undefined, {
    from: [0, 0], to: [4, 0], thickness: 0.12, color: 'red',
  }, Number, defaults).independentWalls.get('front-wall');
  assert.equal(override.baseZ, 0);
  assert.equal(override.top, 'roof');
  assert.equal(override.thickness, 0.12);
  assert.equal(override.color, 'red');
  assert.deepEqual(defaults, { base: { level: 1 }, top: { level: 4 }, thickness: 0.2, color: 'blue' });
});

test('normalization resolves roof top from current config before global lists exist', () => {
  const plan = normalizeRoofWall();
  assert.deepEqual(plan.errors, []);
  const wall = plan.independentWalls.get('front-wall');
  assert.equal(wall.top, 'roof');
  assert.ok(Math.abs(wall.topZ - 5) < 1e-8);
  assert.equal(wall.geometryParts[0].roofOnly, true);
});
test('roof top reports absent roofs and paths without coverage', () => {
  assert.match(normalizeRoofWall(false).errors[0].message, /telhado válido/);
  assert.match(normalizeRoofWall(true, [[10, 10], [12, 10]]).errors[0].message, /não encontra nenhum telhado/);
});

test('wall endpoints resolve into the same roof-limited geometry as path points', () => {
  const plan = normalizeRoofWall(true, undefined, { from: ['0', '0'], to: ['4', '0'] });
  assert.deepEqual(plan.errors, []);
  const wall = plan.independentWalls.get('front-wall');
  const original = normalizeRoofWall().independentWalls.get('front-wall');
  assert.deepEqual(wall.path.points, original.path.points);
  assert.deepEqual(wall.geometryParts, original.geometryParts);
  assert.equal(wall.top, 'roof');
});

test('wall endpoints reject incomplete, invalid or conflicting geometry', () => {
  for (const geometry of [
    { from: [0, 0] },
    { to: [4, 0] },
    { from: [0, 0, 0], to: [4, 0] },
    { from: [0, 0], to: ['invalid', 0] },
    { from: [0, 0], to: [4, 0], path: { points: [[0, 0], [2, 0]] } },
  ]) {
    const plan = normalizeRoofWall(true, undefined, geometry);
    assert.equal(plan.independentWalls.size, 0);
    assert.equal(plan.errors.length, 1);
    assert.match(plan.errors[0].message, /from\/to/);
  }
});

test('wall to expressions use the resolved from coordinates as their local origin', () => {
  const resolver = {
    ...globalThis.FloorPlanGeometry,
    partReferenceStack: [],
    references: new Map([
      ['office', { x0: () => 0, y0: () => 0 }],
      ['knee-top', { y0: () => 3 }],
      ['upper', { z0: () => 3 }],
    ]),
  };
  const geometry = {
    id: 'knee-wall-office-left', base: { level: 'upper.z0' }, top: 'roof',
    thickness: 0.12, color: 'blue',
    from: ['office.x0 + 0.8', 'office.y0'], to: ['x0', 'knee-top.y0'],
  };
  const plan = normalizeRoofWall(true, undefined, geometry, resolver.resolve.bind(resolver));
  assert.deepEqual(plan.errors, []);
  const wall = plan.independentWalls.get(geometry.id);
  assert.deepEqual(wall.path.points, [[0.8, 0], [0.8, 3]]);
  assert.equal(wall.baseZ, 3);
  assert.equal(wall.color, 'blue');

  const offset = normalizeRoofWall(true, undefined, {
    ...geometry, to: ['x0 + 1', 'y0 + 2'],
  }, resolver.resolve.bind(resolver));
  assert.deepEqual(offset.errors, []);
  assert.deepEqual(offset.independentWalls.get(geometry.id).path.points, [[0.8, 0], [1.8, 2]]);
});

test('wall path aliases use the previous resolved point for each segment', () => {
  const resolver = {
    ...globalThis.FloorPlanGeometry,
    partReferenceStack: [],
    references: new Map([
      ['right', { x0: () => 4, y0: () => 2, x1: () => 8 }],
    ]),
  };
  const geometry = {
    id: 'knee-wall-right',
    path: { points: [
      ['right.x0', 'right.y0'],
      ['x0', 'y0 + 3'],
      ['right.x1', 'y0'],
      ['x0 - 1', { from: 'y0', delta: 2 }],
    ] },
  };
  const plan = normalizeRoofWall(true, undefined, geometry, resolver.resolve.bind(resolver));
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.independentWalls.get(geometry.id).path.points,
    [[4, 2], [4, 5], [8, 5], [7, 7]]);

  const invalid = normalizeRoofWall(true, undefined, {
    ...geometry, path: { points: [['x0', 2], [4, 5]] },
  }, resolver.resolve.bind(resolver));
  assert.equal(invalid.independentWalls.size, 0);
  assert.match(invalid.errors[0].message, /Invalid geometric reference: x0/);
});

test('elevation projects the full wall thickness at an overlapping roof boundary', () => {
  const low = { bounds: [[-1, 0, 0, -1], [1, 0, 0, -5], [0, -1, 0, 0], [0, 1, 0, -4]], slopes: [[0, 0, 1, -3]] };
  const high = { bounds: [[-1, 0, 0, -1], [1, 0, 0, -5], [0, -1, 0, -1], [0, 1, 0, -4]], slopes: [[0, 0, 1, -6]] };
  const wall = { from: [0, 0], to: [4, 0], thickness: 0.12, baseStart: 0, baseEnd: 0, top: 8, roofOnly: true };
  const polygons = walls.wallElevation(wall, [low, high], false);
  assert.equal(Math.max(...polygons.flat().map(([, z]) => z)), 6);
  const center = walls.roofSection([[0, 0], [1, 0], [1, 8], [0, 8]], wall.from, wall.to, [low, high], true);
  assert.equal(Math.max(...center.flat().map(([, z]) => z)), 6);
});

test('elevation silhouettes retain diagonal walls and terrain base elevations', () => {
  const polygons = walls.wallElevation({ from: [0, 0], to: [4, 4], thickness: 0.12, baseStart: 0, baseEnd: 1, top: 6 }, [], true);
  assert.equal(polygons.length, 1);
  assert.equal(Math.max(...polygons[0].map(([, z]) => z)), 6);
  assert.equal(Math.min(...polygons[0].map(([, z]) => z)), 0);
  assert.ok(polygons[0].some(([, z]) => z === 1));
});

test('wall limits ignore asymmetric eaves in both roof orientations, preserving rake', () => {
  const base = globalThis.FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 4, z0: 0, h: 3 });
  for (const orientation of ['longitudinal', 'transverse']) {
    const roof = { id: 'roof', base: 'base', type: 'gable', orientation, pitch: 45, eave: [2, 3], rake: [0.5, 1] };
    const plan = { allRoofs: [roof], currentConfig: { wall_max_height: 3 }, references: new Map([['base', base]]) };
    const limits = walls.roofLimits(plan);
    const original = walls.roofLimits({ ...plan, allRoofs: [{ ...roof, eave: 0 }] });
    assert.deepEqual(limits, original);
    const outside = orientation === 'longitudinal'
      ? walls.boxFaces(-1, 1, 0, -0.5, 2, 8)
      : walls.boxFaces(1, -1, 0, 2, -0.5, 8);
    assert.deepEqual(walls.roofSolids(outside, limits), [outside]);
    assert.deepEqual(walls.roofSolids(outside, limits, true), []);
    const from = orientation === 'longitudinal' ? [-1, 1] : [1, -1];
    const to = orientation === 'longitudinal' ? [-0.5, 1] : [2, -1];
    const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
    assert.deepEqual(walls.roofSection(polygon, from, to, limits), [polygon]);
    assert.deepEqual(walls.roofSection(polygon, from, to, limits, true), []);
    assert.deepEqual(limits[0].bounds, orientation === 'longitudinal'
      ? [[-1, 0, 0, 0], [1, 0, 0, -4], [0, -1, 0, -0.5], [0, 1, 0, -5]]
      : [[-1, 0, 0, -0.5], [1, 0, 0, -5], [0, -1, 0, 0], [0, 1, 0, -4]]);
  }
});

test('highest roof switches at crossing slopes and respects the configured wall top', () => {
  const rising = { bounds: [], slopes: [[-1, 0, 1, -2]] };
  const falling = { bounds: [], slopes: [[1, 0, 1, -12]] };
  const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
  for (const roofs of [[rising, falling], [falling, rising]]) {
    assert.ok(Math.abs(volume(walls.roofSolids(box(), roofs)) - 79) < 1e-8);
    assert.ok(Math.abs(sectionArea(walls.roofSection(polygon, [0, 0], [10, 0], roofs)) - 7.9) < 1e-8);
    const silhouette = walls.wallElevation({ from: [0, 0], to: [10, 0], thickness: 0.12,
      baseStart: 0, baseEnd: 0, top: 8, roofOnly: true }, roofs, false);
    assert.ok(silhouette.flat().some(([x, z]) => Math.abs(x - 5) < 1e-8 && Math.abs(z - 7) < 1e-8));
    assert.ok(silhouette.flat().every(([, z]) => z <= 8 + 1e-8));
  }
});

test('wall outline suppresses subdivisions above and below a window while retaining jambs', () => {
  const solids = [
    walls.boxFaces(0, 0, 0, 1, 0.12, 3),
    walls.boxFaces(1, 0, 0, 2, 0.12, 1),
    walls.boxFaces(1, 0, 2, 2, 0.12, 3),
    walls.boxFaces(2, 0, 0, 3, 0.12, 3),
  ];
  const points = walls.outlineSegments(solids);
  const verticals = [];
  for (let i = 0; i < points.length; i += 2) {
    const a = points[i], b = points[i + 1];
    if (Math.abs(a[0] - b[0]) < 1e-8 && Math.abs(a[1] - b[1]) < 1e-8 &&
      (a[0] === 1 || a[0] === 2) && Math.abs(a[2] - b[2]) > 1e-8) verticals.push([a, b]);
  }
  assert.equal(verticals.length, 4);
  verticals.flat().forEach(([, , z]) => assert.ok(z >= 1 && z <= 2));
  assert.ok(points.some(([x, y, z]) => x === 0 && y === 0 && z === 3));
});

test('wall outline removes seams between adjoining coplanar boxes', () => {
  const points = walls.outlineSegments([
    walls.boxFaces(0, 0, 0, 1, 0.12, 3), walls.boxFaces(1, 0, 0, 3, 0.12, 3),
  ]);
  for (let i = 0; i < points.length; i += 2) {
    assert.ok(!(points[i][0] === 1 && points[i + 1][0] === 1));
  }
  assert.ok(points.length > 0);
});

test('room-part elevation is clipped at its own position rather than the compound room edge', () => {
  const limit = { bounds: [[-1, 0, 0, 0], [1, 0, 0, -4], [0, -1, 0, 2], [0, 1, 0, -4]], slopes: [[0, 0, 1, -2]] };
  const part = { from: [0, 3], to: [4, 3], thickness: 0.12, baseStart: 0, baseEnd: 0, top: 6 };
  const clipped = walls.wallElevation(part, [limit], false);
  assert.equal(Math.max(...clipped.flat().map(([, z]) => z)), 2);
  const outerEdge = walls.wallElevation({ ...part, from: [0, 0], to: [4, 0] }, [limit], false);
  assert.equal(Math.max(...outerEdge.flat().map(([, z]) => z)), 6);
});

test('elevation outline removes shared vertical and sloping subdivision lines', () => {
  const rectangle = [[0, 0], [4, 0], [4, 3], [0, 3]];
  const split = [[[0, 0], [2, 0], [2, 3], [0, 3]], [[2, 0], [4, 0], [4, 3], [2, 3]]];
  const diagonal = [[[0, 0], [4, 0], [0, 3]], [[4, 0], [4, 3], [0, 3]]];
  for (const polygons of [split, diagonal, [rectangle, [[1, 1], [3, 1], [3, 2], [1, 2]]]]) {
    const edges = walls.elevationOutline(polygons);
    assert.ok(edges.length > 0);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      assert.ok((a[0] === b[0] && [0, 4].includes(a[0])) || (a[1] === b[1] && [0, 3].includes(a[1])));
    }
  }
});
test('elevation outline preserves the roof profile and concave exterior boundaries', () => {
  const polygons = [[[0, 0], [2, 0], [2, 2], [1, 3], [0, 2]], [[2, 0], [4, 0], [4, 1], [2, 1]]];
  const edges = walls.elevationOutline(polygons);
  assert.ok(edges.some(([x, z]) => x === 1 && z === 3));
  let forbidden = false;
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i], b = edges[i + 1];
    if (a[0] === 2 && b[0] === 2 && Math.max(a[1], b[1]) <= 1) forbidden = true;
  }
  assert.equal(forbidden, false);
});

test('elevation keeps hull corners when repeated cut coordinates differ by floating point noise', () => {
  const roof = { bounds: [], slopes: [[-1.234897156535051, 0, 1, -3.9879177252280407], [1.234897156535051, 0, 1, -6.704691469605153]] };
  const partition = { bounds: [[-1, 0, 0, 1.4], [0, -1, 0, 2]], slopes: [[0, 0, 1, -8]] };
  const polygons = walls.wallElevation({ from: [-0.8, 0], to: [3, 0], thickness: 0.12,
    baseStart: 0, baseEnd: 0, top: 8, roofOnly: true }, [partition, roof], false);
  assert.ok(polygons[0].some(([x, z]) => Math.abs(x - 1.4) < 1e-8 && Math.abs(z - 4.97583545) < 1e-8));
  for (let i = 0; i < polygons[0].length; i += 1) {
    const a = polygons[0][i], b = polygons[0][(i + 1) % polygons[0].length];
    assert.ok(!(a[0] > 1 && b[0] > 1 && a[1] === 0 && b[1] > 4 && Math.abs(a[0] - b[0]) > 1e-8));
  }
});

const normalizeScopedWall = (scope) => {
  const config = {
    floors: [
      { id: 'ground', z0: 0, ceiling_height: 3, rooms: [] },
      { id: 'upper', z0: 3, ceiling_height: 3, rooms: [{ id: 'unused-north' }] },
    ],
    walls: [{ id: 'scoped-wall', scope, base: { level: 0 }, top: { level: 5 },
      from: [0, 0], to: [2, 2] }],
  };
  const plan = { catalog: {}, roomDefinitions: new Map(), references: new Map(), errors: [], resolve: Number };
  walls.normalizeRoomWalls(plan, config);
  return plan;
};

test('wall scope resolves room and floor ownership without changing its geometry', () => {
  for (const scope of ['upper', 'unused-north']) {
    const plan = normalizeScopedWall(scope);
    assert.deepEqual(plan.errors, []);
    const wall = plan.independentWalls.get('scoped-wall');
    assert.equal(wall.scopeFloorId, 'upper');
    assert.equal(wall.scopeType, scope === 'upper' ? 'floor' : 'room');
    assert.equal(wall.scopeRoomId, scope === 'unused-north' ? scope : undefined);
    assert.equal(wall.baseZ, 0);
    assert.equal(wall.topZ, 5);
    assert.deepEqual(wall.path.points, [[0, 0], [2, 2]]);
    assert.ok(wall.geometryParts.every(part => part.scopeFloorId === 'upper'));
  }
  const unscoped = normalizeScopedWall(undefined).independentWalls.get('scoped-wall');
  assert.equal(unscoped.scopeFloorId, undefined);
});

test('invalid wall scopes report errors and are excluded', () => {
  for (const scope of ['', 12, null, 'missing-room']) {
    const plan = normalizeScopedWall(scope);
    assert.equal(plan.independentWalls.size, 0);
    assert.equal(plan.errors.length, 1);
    assert.match(plan.errors[0].message, /scope|Escopo inexistente/);
  }
});

test('floor plan hides walls belonging to another scope while keeping unscoped walls', () => {
  const plan = normalizeScopedWall('unused-north');
  const elements = [];
  plan.add = () => { const element = { style: {}, dataset: {} }; elements.push(element); return element; };
  plan.currentFloorId = 'ground';
  walls.renderIndependentWalls(plan);
  assert.equal(elements.length, 0);
  plan.currentFloorId = 'upper';
  walls.renderIndependentWalls(plan);
  assert.equal(elements.length, 1);
});

test('adjacent front-wall segments have no vertical seam below the gable ridge', () => {
  const polygons = [
    [[0, 0], [4, 0], [4, 9], [0, 4]],
    [[4, 0], [8, 0], [8, 4], [4, 9]],
  ];
  const edges = walls.elevationOutline(polygons);
  assert.equal(edges.length, 12);
  for (let i = 0; i < edges.length; i += 2) {
    assert.ok(!(Math.abs(edges[i][0] - 4) < 1e-8 && Math.abs(edges[i + 1][0] - 4) < 1e-8),
      'internal join below ridge must not be outlined');
  }
});
