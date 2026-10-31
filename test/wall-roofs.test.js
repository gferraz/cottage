const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/walls.js');
const walls = globalThis.FloorPlanWalls;
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
test('overlapping roofs apply the lowest ceiling', () => {
  const lower = { ...roof, slopes: [[0, 0, 1, -2]] };
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [roof, lower])) - 44) < 1e-8);
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
test('elevation uses the lowest roof and leaves walls at other depths intact', () => {
  const polygon = [[0, 0], [1, 0], [1, 8], [0, 8]];
  const lower = { ...roof, slopes: [[0, 0, 1, -2]] };
  assert.ok(Math.abs(sectionArea(walls.roofSection(polygon, [0, 0], [10, 0], [roof, lower])) - 4.4) < 1e-8);
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

test('roof coverage is the union of footprints, with the lowest overlapping slope', () => {
  const second = { bounds: [[-1, 0, 0, 6], [1, 0, 0, -10]], slopes: [[0, 0, 1, -2]] };
  const result = walls.roofSolids(box(), [roof, second], true);
  assert.ok(Math.abs(volume(result) - 27) < 1e-8);
  assert.ok(Math.abs(volume(walls.roofSolids(box(), [second, roof], true)) - 27) < 1e-8);
});

require('../src/models/geometry-box.js');
require('../src/models/validation.js');
require('../src/views/roofs.js');
const normalizeRoofWall = (withRoof = true, points = [[0, 0], [4, 0]]) => {
  const base = globalThis.FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 4, z0: 0, h: 3 });
  const config = {
    floors: [{ id: 'ground', z0: 0, wall_max_height: 3, rooms: [] }],
    roofs: withRoof ? [{ id: 'roof', base: 'base', type: 'gable', orientation: 'longitudinal', pitch: 45 }] : [],
    walls: [{ id: 'front-wall', base: { level: 0 }, top: 'roof', path: { points } }],
  };
  const plan = { currentConfig: config, references: new Map([['base', base]]),
    catalog: {}, roomDefinitions: new Map(), errors: [], allRoofs: [{ id: 'stale' }],
    resolve: Number };
  walls.normalizeRoomWalls(plan, config);
  return plan;
};

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

test('elevation projects the full wall thickness at an overlapping roof boundary', () => {
  const low = { bounds: [[-1, 0, 0, -1], [1, 0, 0, -5], [0, -1, 0, 0], [0, 1, 0, -4]], slopes: [[0, 0, 1, -3]] };
  const high = { bounds: [[-1, 0, 0, -1], [1, 0, 0, -5], [0, -1, 0, -1], [0, 1, 0, -4]], slopes: [[0, 0, 1, -6]] };
  const wall = { from: [0, 0], to: [4, 0], thickness: 0.12, baseStart: 0, baseEnd: 0, top: 8, roofOnly: true };
  const polygons = walls.wallElevation(wall, [low, high], false);
  assert.equal(Math.max(...polygons.flat().map(([, z]) => z)), 6);
  const center = walls.roofSection([[0, 0], [1, 0], [1, 8], [0, 8]], wall.from, wall.to, [low, high], true);
  assert.equal(Math.max(...center.flat().map(([, z]) => z)), 3);
});

test('elevation silhouettes retain diagonal walls and terrain base elevations', () => {
  const polygons = walls.wallElevation({ from: [0, 0], to: [4, 4], thickness: 0.12, baseStart: 0, baseEnd: 1, top: 6 }, [], true);
  assert.equal(polygons.length, 1);
  assert.equal(Math.max(...polygons[0].map(([, z]) => z)), 6);
  assert.equal(Math.min(...polygons[0].map(([, z]) => z)), 0);
  assert.ok(polygons[0].some(([, z]) => z === 1));
});
