const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

globalThis.window = globalThis;
for (const name of ["models/terrain", "config/catalog", "config/coordinates",
  "models/geometry-box", "models/geometry", "models/geometry-domain", "models/walls",
  "config/parser", "models/model", "models/validation", "views/roofs",
  "models/openings", "models/references", "views/elements", "models/headroom", "main"]) {
  require(`../src/${name}.js`);
}

// Use the real domain facade without constructing the browser interface.
function prepare(config) {
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(),
    partReferenceStack: [], currentFloorHeight: 0, catalog: FloorPlanCatalog,
    itemTypes: FloorPlanCatalog.items, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
}

const close = (actual, expected) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8,
  `${actual} != ${expected}`,
);
const fixture = () => ({ floors: [{ id: "ground", z0: 2, ceiling_height: 3, rooms: [
  { id: "room", pos: [0, 0], size: [4, 3], walls: ["left"] },
  { id: "compound", walls: [], parts: [
    { id: "low", pos: [0, 5, 2], size: [2, 1, 1] },
    { id: "high", pos: [2, 5, 5], size: [1, 2, 0] },
  ] },
] }] });

test("compound references preserve each part elevation and distinguish envelope from occupied area", () => {
  const plan = prepare(fixture());
  assert.deepEqual(plan.errors, []);
  const room = plan.getRoomGeometry("compound");
  close(room.bounds().w(), 3);
  close(room.bounds().l(), 2);
  close(room.area(), 4);
  assert.throws(() => room.geometry(), /compound object/);
  const low = room.partReferences.get("low");
  const high = room.partReferences.get("high");
  assert.deepEqual([low.z0(), low.z1(), low.h()], [2, 3, 1]);
  assert.deepEqual([high.z0(), high.z1(), high.h()], [5, 5, 0]);
  close(plan.resolve("compound.high.z0"), 5);
  close(plan.resolve("low.z1"), 3);
  assert.equal(plan.currentFloorHeight, 0);
});

test("rotation preserves nominal coordinates and dimensions instead of expanding their rectangle", () => {
  const plan = prepare(fixture());
  const source = { pos: [1, 2, 4], size: [2, 1, 0.5], rotation: -90 };
  const original = structuredClone(source);
  const geometry = plan.normalizeGeometry(source);
  assert.deepEqual([geometry.x, geometry.y, geometry.w, geometry.l,
    geometry.z0, geometry.z1, geometry.rotation], [1, 2, 2, 1, 4, 4.5, 270]);
  assert.deepEqual(source, original);
});

test("floor-scoped normalization restores its caller elevation after success and failure", () => {
  const plan = prepare(fixture());
  plan.currentFloorHeight = 17;
  const floor = { z0: 6 };
  close(plan.normalizeGeometryAtFloor({ pos: [0, 0], size: [1, 1] }, floor).z0, 6);
  assert.equal(plan.currentFloorHeight, 17);
  assert.throws(() => plan.normalizeGeometryAtFloor({ pos: [0, 0], size: [1, 1],
    rotation: "missing.x0" }, floor), /Unknown room reference/);
  assert.equal(plan.currentFloorHeight, 17);
  close(plan.normalizeGeometry({ pos: [0, 0], size: [1, 1] }).z0, 17);
});

test("failed item resolution restores reference policy and cache before subsequent nominal reads", () => {
  const plan = prepare(fixture());
  const cache = new Map([["sentinel", {}]]);
  plan.itemRoomBoundsCache = cache;
  const definition = plan.resolveItemType({ pos: ["room.x0", "missing.y0"], size: [1, 1] });
  assert.throws(() => plan.normalizeGeometry(definition), /Unknown room reference/);
  assert.equal(plan.itemReferenceContext, undefined);
  assert.equal(plan.itemRoomBoundsCache, cache);
  close(plan.resolve("room.x0"), 0);
  const item = plan.normalizeGeometry(plan.resolveItemType({
    pos: ["room.x0", 0], size: [1, 1],
  }));
  close(item.x, 0.06);
  close(plan.resolve("room.x0"), 0);
});

test("compound resolution failure cleans recursion state and permits a corrected retry", () => {
  const plan = prepare(fixture());
  const definition = plan.roomDefinitions.get("compound");
  plan.roomGeometryCache.delete("compound");
  definition.parts[0].pos[0] = "missing.x0";
  plan.currentFloorHeight = 17;
  assert.throws(() => plan.getRoomGeometry("compound"), /Unknown room reference/);
  assert.equal(plan.currentFloorHeight, 17);
  assert.equal(plan.roomGeometryStack.size, 0);
  assert.equal(plan.partReferenceStack.length, 0);
  assert.equal(plan.roomGeometryCache.has("compound"), false);
  definition.parts[0].pos[0] = 0;
  close(plan.getRoomGeometry("compound").area(), 4);
  assert.equal(plan.currentFloorHeight, 17);
});

test("roof thickness grows vertically above the reference underside without reducing headroom", () => {
  const polygon = [[0, 0, 1], [4, 0, 3], [4, 2, 3], [0, 2, 1]];
  const original = structuredClone(polygon);
  const surfaces = [{ polygons: [polygon] }];
  const before = FloorPlanHeadroom.calculate([{ x: 0, y: 0, w: 4, l: 2 }], surfaces, 0, [], [2]);
  const { faces } = FloorPlanRoofs.solidSurface(surfaces[0].polygons, 0.4);
  assert.deepEqual(faces[0], polygon.map(([x, y, z]) => [x, y, z + 0.4]));
  assert.deepEqual(faces[1], [...polygon].reverse());
  assert.deepEqual(polygon, original);
  const after = FloorPlanHeadroom.calculate([{ x: 0, y: 0, w: 4, l: 2 }], surfaces, 0, [], [2]);
  close(before[0].area, 4);
  close(after[0].area, 4);
});

test("current cottage stair keeps its intermediate elevation, tread counts and landing connections", () => {
  const source = FloorPlanParser.parse(fs.readFileSync(
    path.join(__dirname, "../cottage-ferraz-cesar.json5"), "utf8",
  ));
  const original = structuredClone(source);
  const plan = prepare(source);
  assert.deepEqual(plan.errors, []);
  const floor = plan.currentConfig.floors.find((entry) => entry.id === "ground");
  plan.currentFloorHeight = Number(floor.z0);
  const parts = plan.normalizeParts(plan.roomDefinitions.get("stairs").parts);
  const byId = new Map(parts.map((part) => [part.id, part]));
  const lower = byId.get("lower-flight");
  const upper = byId.get("upper-flight");
  const lowerLanding = byId.get("lower-landing");
  const upperLanding = byId.get("upper-landing");
  const groundZ = plan.resolve("ground.z0");
  const upperZ = plan.resolve("upper.z0");
  const intermediate = groundZ + (upperZ - groundZ) * 11 / 18;
  assert.equal(parts.length, 4);
  close(lower.z0, groundZ);
  close(lower.z1, intermediate);
  close(upper.z0, intermediate);
  close(upper.z1, upperZ);
  for (const landing of [lowerLanding, upperLanding]) {
    close(landing.z0, intermediate);
    close(landing.h, 0);
  }
  close(lower.x + lower.w, lowerLanding.x);
  close(upper.x + upper.w, upperLanding.x);
  close(upperLanding.y + upperLanding.l, lowerLanding.y);
  for (const [flight, treads] of [[lower, 10], [upper, 6]]) {
    const steps = FloorPlanGeometry.stairSteps(flight);
    assert.equal(steps.treads, treads);
    close(steps.rise, (upperZ - groundZ) / 18);
    assert.equal(flight.stairAxis, "horizontal");
  }
  assert.deepEqual(source, original);
});
