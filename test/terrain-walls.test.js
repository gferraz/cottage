const { test } = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../src/models/terrain.js");
require("../src/models/walls.js");
const walls = FloorPlanWalls;
const volume = (solids) => solids.reduce((total, solid) => total + Math.abs(solid.reduce((sum, face) => {
  const a = face[0];
  for (let i = 1; i < face.length - 1; i++) {
    const b = face[i], c = face[i + 1];
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return sum;
}, 0)) / 6, 0);
const reference = (axis) => ({ frontStart: { x: 10, y: 20 }, grading: FloorPlanTerrainGeometry.profile({ profile: [
  { [axis]: 0, z: -0.45 }, { [axis]: 2, z: -0.45 }, { [axis]: 4, z: -0.9 },
] }) });

test("terrain-based walls follow plateaus and slopes in both axes after building translation", () => {
  for (const axis of ["x", "y"]) {
    const bounds = axis === "x" ? [0, 0, -6, 4, 0.12, 0] : [0, 0, -6, 0.12, 4, 0];
    const site = reference(axis);
    const solids = walls.terrainSolids(walls.boxFaces(...bounds), site, { x: 10, y: 20 });
    assert.equal(solids.length, 2);
    assert.ok(Math.abs(volume(solids) - (2 * 0.45 + 2 * (0.45 + 0.9) / 2) * 0.12) < 1e-8);
    for (const [x, y, z] of solids.flat(2)) {
      assert.ok(z <= 1e-9);
      assert.ok(z >= FloorPlanTerrainGeometry.elevationAt(site, x + 10, y + 20) - 1e-9);
    }
  }
});

test("terrain at or above the wall top leaves no visible wall", () => {
  const site = { frontY: 0, rearY: 4, frontZ: 0.1, rearZ: 0.1 };
  assert.deepEqual(walls.terrainSolids(walls.boxFaces(0, 0, -6, 4, 0.12, 0), site), []);
});

test("terrain clipping retains clamped ends and legacy cadastral slopes", () => {
  const site = { frontY: 1, rearY: 3, frontZ: -1, rearZ: -3 };
  const solids = walls.terrainSolids(walls.boxFaces(0, 0, -6, 0.12, 4, 0), site);
  assert.equal(solids.length, 3);
  assert.ok(Math.abs(volume(solids) - 0.12 * (1 + 4 + 3)) < 1e-8);
});

test("facade base includes intermediate terrain breaks rather than a straight endpoint ramp", () => {
  const polygons = walls.wallElevation({ from: [0, 0], to: [0, 4], thickness: 0.12,
    baseStart: -6, baseEnd: -6, top: 0, terrainReference: reference("y"), terrainOffset: { x: 10, y: 20 } }, [], true);
  assert.ok(polygons.flat().some(([y, z]) => Math.abs(y - 2) < 1e-8 && Math.abs(z + 0.45) < 1e-8));
  assert.ok(polygons.flat().some(([y, z]) => Math.abs(y - 4) < 1e-8 && Math.abs(z + 0.9) < 1e-8));
});

for (const name of ['config/catalog', 'config/coordinates', 'config/parser', 'models/geometry-box',
  'models/geometry', 'models/geometry-domain', 'models/model', 'models/validation', 'models/metrics',
  'views/roofs', 'models/openings', 'models/references', 'main']) require(`../src/${name}.js`);

test("project plinth closes the ground outline at floor level and follows the current terrain", () => {
  const fs = require("node:fs");
  const config = FloorPlanParser.parse(fs.readFileSync(require("node:path").resolve(__dirname, "../cottage-ferraz-cesar.json5"), "utf8"));
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  assert.deepEqual(plan.errors.filter((error) => error.id === "perimeter-plinth"), []);
  const wall = plan.independentWalls.get("perimeter-plinth");
  assert.ok(wall);
  assert.equal(wall.base, "terrain");
  assert.equal(wall.topZ, 0);
  assert.equal(wall.thickness, 0.12);
  assert.equal(wall.scopeFloorId, "ground");
  assert.deepEqual(wall.path.points[0], wall.path.points.at(-1));
  assert.equal(wall.geometryParts.length, 10);
  assert.ok(wall.geometryParts.every((part) => part.base === "terrain"));
  const bounds = FloorPlanMetrics.buildingReferenceBounds(plan);
  const offset = { x: model.config.building.position.x - bounds.x0, y: model.config.building.position.y - bounds.y0 };
  const site = { frontStart: { x: 0, y: 0 }, grading: FloorPlanTerrainGeometry.profile(model.config.terrain.grading) };
  const [from, to] = wall.path.points;
  assert.equal(-FloorPlanTerrainGeometry.elevationAt(site, from[0] + offset.x, from[1] + offset.y), 0.45);
  assert.equal(-FloorPlanTerrainGeometry.elevationAt(site, to[0] + offset.x, to[1] + offset.y), 0.45);
  const rearY = Math.max(...wall.path.points.map((point) => point[1])) + offset.y;
  assert.ok(Math.abs(FloorPlanTerrainGeometry.elevationAt(site, offset.x, rearY) + 0.9) < 1e-8);
});
