const { test } = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../src/models/terrain.js");
const terrain = FloorPlanTerrainGeometry;
const reference = (profile) => ({
  frontStart: { x: 10, y: 20 },
  grading: terrain.profile({ profile }),
});

test("longitudinal profile interpolates ramps, plateaus and clamped ends in terrain coordinates", () => {
  const input = [{ y: 0, z: 0 }, { y: 3, z: -0.45 }, { y: 18, z: -0.45 }, { y: 24, z: -1.5 }];
  const copy = structuredClone(input);
  const site = reference(input);
  for (const [y, expected] of [[-2, 0], [0, 0], [1.5, -0.225], [3, -0.45], [10, -0.45], [18, -0.45], [21, -0.975], [24, -1.5], [40, -1.5]]) {
    assert.ok(Math.abs(terrain.elevationAt(site, 500, y + 20) - expected) < 1e-9);
  }
  assert.deepEqual(terrain.breaks(site, "y"), [20, 23, 38, 44]);
  assert.deepEqual(terrain.breaks(site, "x"), []);
  assert.deepEqual(input, copy);
});

test("transverse profile varies only with local X and permits negative coordinates", () => {
  const site = reference([{ x: -2, z: -1 }, { x: 2, z: 1 }, { x: 8, z: 1 }]);
  assert.equal(terrain.elevationAt(site, 10, -100), 0);
  assert.equal(terrain.elevationAt(site, 10, 900), 0);
  assert.equal(terrain.elevationAt(site, 14, 20), 1);
  assert.deepEqual(terrain.breaks(site, "x"), [8, 12, 18]);
});

test("missing grading retains the cadastral front/rear interpolation", () => {
  assert.equal(terrain.profile(undefined), null);
  assert.equal(terrain.elevationAt(null, 0, 0), null);
  assert.equal(terrain.elevationAt({}, 0, 0), null);
  const site = { frontY: 2, rearY: 42, frontZ: 0, rearZ: -6 };
  assert.equal(terrain.elevationAt(site, 200, 22), -3);
  assert.equal(terrain.elevationAt(site, 200, -10), 0);
  assert.equal(terrain.elevationAt(site, 200, 60), -6);
});

test("invalid profiles fail explicitly instead of silently reverting to the cadastral slope", () => {
  for (const profile of [null, [], [{ y: 0, z: 0 }],
    [{ x: 0, z: 0 }, { y: 1, z: 0 }],
    [{ y: 0, z: 0 }, { y: 0, z: -1 }],
    [{ y: 1, z: 0 }, { y: 0, z: -1 }],
    [{ y: 0, z: 0 }, { y: "1", z: -1 }],
    [{ y: 0, z: 0 }, { y: 1, z: NaN }],
    [{ y: 0, z: 0 }, { y: Infinity, z: 0 }],
    [{ y: 0, z: 0 }, { x: 1, y: 1, z: 0 }],
    [{ y: 0, z: 0 }, { at: "terrain.rear", z: -6 }],
  ]) assert.throws(() => terrain.profile({ profile }), /terrain.grading.profile/);
  assert.throws(() => terrain.profile(null), /terrain.grading.profile/);
});

test("terrain mesh retains every interior break after building translation on either axis", () => {
  for (const axis of ["x", "y"]) {
    const site = reference([{ [axis]: 0, z: 0 }, { [axis]: 3, z: -0.45 }, { [axis]: 8, z: -0.45 }, { [axis]: 12, z: -2 }]);
    const offset = { x: 12, y: 22 };
    const { vertices, indices } = terrain.surface(site, { x0: -4, x1: 12, y0: -4, y1: 12 }, offset);
    const points = Array.from({ length: vertices.length / 3 }, (_, i) => vertices.slice(i * 3, i * 3 + 3));
    assert.deepEqual([...new Set(points.map((p) => p[axis === "x" ? 0 : 1]))], [-4, -2, 1, 6, 10, 12]);
    for (const [x, y, z] of points) assert.equal(z, terrain.elevationAt(site, x + offset.x, y + offset.y));
    assert.equal(indices.length, 30);
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map((index) => points[index]);
      assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
    }
  }
});

require("../src/models/model.js");
test("model loading validates grading without changing cadastral elevations", () => {
  const source = { terrain: { corners: { A: { z: 0 }, B: { z: -6 } },
    grading: { profile: [{ y: 0, z: -0.45 }, { y: 20, z: -1 }] } }, floors: [] };
  const original = structuredClone(source);
  assert.deepEqual(FloorPlanModel.fromConfig(source).config.terrain, original.terrain);
  assert.deepEqual(source, original);
  source.terrain.grading.profile[1].y = 0;
  assert.throws(() => FloorPlanModel.fromConfig(source), /terrain.grading.profile/);
});

test("optional IDs survive normalization without changing interpolation", () => {
  const points = [{ id: "tp-01", y: 0, z: 0 }, { id: "tp-02", y: 3, z: -0.45 }];
  const site = reference(points);
  assert.deepEqual(site.grading.points, points);
  assert.equal(terrain.elevationAt(site, 10, 21.5), -0.225);
  for (const id of ["", "  ", 123, null, "tp-01"]) {
    assert.throws(() => terrain.profile({ profile: [points[0], { ...points[1], id }] }), /IDs/);
  }
});

require("../src/config/parser.js");
test("cottage study profile has editable IDs and preserves the declared study levels", () => {
  const fs = require("node:fs");
  const config = FloorPlanParser.parse(fs.readFileSync(require("node:path").resolve(__dirname, "../cottage-ferraz-cesar.json5"), "utf8"));
  const profile = terrain.profile(config.terrain.grading);
  assert.equal(profile.axis, "y");
  assert.equal(profile.points.length, 6);
  assert.equal(new Set(profile.points.map((point) => point.id)).size, 6);
  assert.equal(terrain.interpolate(profile.points, "y", 3), -0.45);
  assert.equal(terrain.interpolate(profile.points, "y", 12), -0.45);
  assert.equal(terrain.interpolate(profile.points, "y", 23.8), -0.9);
  assert.equal(terrain.interpolate(profile.points, "y", 47.32), -6);
});
