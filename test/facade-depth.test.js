const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/facades.js');

for (const edge of ['min', 'max']) {
  test(`facade at ${edge} depth paints nearby faces last and preserves openings on their wall`, () => {
    const sign = edge === 'min' ? 1 : -1;
    const faces = [
      { id: 'wall', depth: sign * 2 },
      { id: 'rear-roof', depth: sign * 8 },
      { id: 'window', depth: sign * 2 },
      { id: 'porch-shed', depth: sign },
      { id: 'rear-room-label', depth: sign * 6 },
    ];
    const original = [...faces];
    assert.deepEqual(FloorPlanFacades.depthOrderedFaces(faces, edge).map(face => face.id),
      ['rear-roof', 'rear-room-label', 'wall', 'window', 'porch-shed']);
    assert.deepEqual(faces, original);
  });
}

for (const edge of ['min', 'max']) {
  test(`facade at ${edge} masks rear contours and labels only with closer opaque faces`, () => {
    const sign = edge === 'min' ? 1 : -1;
    const rear = { depth: sign * 8, occluder: {} };
    const front = { depth: sign * 2, occluder: {} };
    const window = { depth: sign * 2 };
    const label = { depth: sign * 6 };
    const samePlane = { depth: sign * 8, occluder: {} };
    const faces = [rear, front, window, label, samePlane];
    assert.deepEqual(FloorPlanFacades.occludingFaces(rear, faces, edge), [front]);
    assert.deepEqual(FloorPlanFacades.occludingFaces(label, faces, edge), [front]);
    assert.deepEqual(FloorPlanFacades.occludingFaces(window, faces, edge), []);
    assert.deepEqual(FloorPlanFacades.occludingFaces(front, faces, edge), []);
  });
}
