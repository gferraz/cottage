const { test } = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../src/models/geometry-operations.js");
const geometry = FloorPlanGeometryOperations;
const area = (parts) => parts.reduce((sum, part) => sum + part.w * part.l, 0);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${actual} != ${expected}`);

test("rectangle partition preserves a concave union without duplicate cells or input mutation", () => {
  const rectangles = [
    { x: -2, y: 0, w: 3, l: 1 },
    { x: 0, y: 0, w: 1, l: 3 },
    { x: -2, y: 0, w: 3, l: 1 },
  ];
  const original = structuredClone(rectangles);
  const parts = geometry.partitionRectangles(rectangles);
  close(area(parts), 5);
  for (let i = 0; i < parts.length; i += 1) {
    assert.ok(parts[i].w > 0 && parts[i].l > 0);
    for (const other of parts.slice(i + 1)) {
      assert.ok(Math.min(parts[i].x + parts[i].w, other.x + other.w) <= Math.max(parts[i].x, other.x)
        || Math.min(parts[i].y + parts[i].l, other.y + other.l) <= Math.max(parts[i].y, other.y));
    }
  }
  assert.deepEqual(rectangles, original);
  assert.deepEqual(geometry.partitionRectangles([...rectangles].reverse()), parts);
  assert.deepEqual(geometry.partitionRectangles([]), []);
});

test("polygon clipping interpolates elevation and retains the selected half-plane", () => {
  const polygon = [[0, 0, 1], [4, 0, 3], [4, 2, 3], [0, 2, 1]];
  const original = structuredClone(polygon);
  const clipped = geometry.clipPolygon(polygon, [1, 0, 0, -2]);
  close(geometry.area(clipped), 4);
  assert.ok(clipped.every(([x, , z]) => x <= 2 && Math.abs(z - (1 + x / 2)) < 1e-8));
  assert.equal(clipped.filter(([x]) => x === 2).length, 2);
  assert.deepEqual(geometry.clipPolygon(polygon, [-1, 0, 0, 5]), []);
  assert.deepEqual(polygon, original);
});

test("convex subtraction accepts either winding and union counts overlap once", () => {
  const outer = geometry.rectangle({ x: 0, y: 0, w: 4, l: 4 });
  const inner = geometry.rectangle({ x: 1, y: 1, w: 2, l: 2 });
  const sum = (polygons) => polygons.reduce((total, polygon) => total + geometry.area(polygon), 0);
  close(sum(geometry.subtract(outer, inner)), 12);
  close(sum(geometry.subtract(outer, [...inner].reverse())), 12);
  close(sum(geometry.union([outer, inner, outer])), 16);
  assert.deepEqual(geometry.subtract(inner, outer), []);
});

test("solid clipping closes an oblique cut and preserves volume and outward winding", () => {
  const faces = geometry.boxFaces(0, 0, 0, 2, 2, 2);
  const original = structuredClone(faces);
  const clipped = geometry.clipSolid(faces, [1, 0, 1, -2]);
  const signedVolume = clipped.reduce((sum, face) => {
    const a = face[0];
    for (let i = 1; i < face.length - 1; i += 1) {
      const b = face[i], c = face[i + 1];
      sum += a[0] * (b[1] * c[2] - b[2] * c[1])
        + a[1] * (b[2] * c[0] - b[0] * c[2])
        + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    return sum;
  }, 0) / 6;
  close(signedVolume, 4);
  assert.ok(clipped.flat().every(([x, , z]) => x + z <= 2 + 1e-8));
  const edges = new Map();
  for (const face of clipped) face.forEach((point, i) => {
    const key = [point.join(","), face[(i + 1) % face.length].join(",")].sort().join("|");
    edges.set(key, (edges.get(key) ?? 0) + 1);
  });
  assert.ok([...edges.values()].every((count) => count === 2));
  assert.deepEqual(faces, original);
  assert.deepEqual(geometry.clipSolid(faces, [0, 0, 1, 1]), []);
});
