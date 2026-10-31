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
