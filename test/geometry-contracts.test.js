require("./helpers/load-modules");
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
require("../src/models/overlap-analysis.js");

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
  assert.deepEqual([room.z0(), room.z1(), room.h(), room.bounds().zc()], [2, 5, 3, 3.5]);
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

test("canonical room parts retain ownership, elevation and orientation without changing the XY compatibility projection", () => {
  const source = fixture();
  Object.assign(source.floors[0].rooms[1].parts[0], {
    rotation: 90, classes: "stair-flight", risers: 7,
  });
  const original = structuredClone(source);
  const plan = prepare(source);
  const room = plan.getRoomGeometry("compound");
  const low = room.normalizedParts[0];
  assert.deepEqual([low.id, low.ownerId, low.floorId, low.z0, low.z1, low.rotation,
    low.classes, low.risers], ["low", "compound", "ground", 2, 3, 90, "stair-flight", 7]);
  assert.deepEqual(room.geometryParts, [
    { x: 0, y: 5, w: 2, l: 1 }, { x: 2, y: 5, w: 1, l: 2 },
  ]);
  const lazy = plan.roomReferences.get("compound");
  assert.equal(lazy.normalizedParts, room.normalizedParts);
  assert.equal(lazy.nominalGeometry, room.nominalGeometry);
  assert.deepEqual(source, original);
});

test("cached room consumers reuse resolved parts without another normalization pass", () => {
  const plan = prepare(fixture());
  const expected = plan.getRoomGeometry("compound");
  plan.normalizeParts = () => assert.fail("cached parts must not be normalized again");
  plan.normalizeGeometry = () => assert.fail("cached geometry must not be normalized again");
  const reference = plan.roomReferences.get("compound");
  assert.equal(plan.getRoomGeometry("compound"), expected);
  assert.equal(reference.normalizedParts, expected.normalizedParts);
  close(reference.z1(), 5);
  close(reference.partReferences.get("low").z1(), 3);
});

test("simple rooms retain their declared height and get a complete floor-scoped part", () => {
  const plan = prepare(fixture());
  const room = plan.getRoomGeometry("room");
  assert.deepEqual([room.z0(), room.z1(), room.h()], [2, 2, 0]);
  assert.equal(room.partReferences.size, 0);
  assert.equal(room.normalizedParts.length, 1);
  const [part] = room.normalizedParts;
  assert.deepEqual([part.id, part.ownerId, part.floorId, part.z0, part.z1, part.h],
    ["room", "room", "ground", 2, 2, 0]);
  close(room.geometry().area(), 12);
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

test("resolution contexts nest without writing the caller's legacy policy fields or part stack", () => {
  const plan = prepare(fixture());
  const cache = new Map([["sentinel", {}]]);
  const stack = Object.freeze([]);
  for (const [key, value] of Object.entries({ currentFloorHeight: 17,
    itemReferenceContext: undefined, itemRoomBoundsCache: cache, partReferenceStack: stack })) {
    Object.defineProperty(plan, key, { configurable: true, get: () => value,
      set: () => assert.fail(`caller field changed: ${key}`) });
  }
  plan.roomGeometryCache.clear();
  close(plan.getRoomGeometry("compound").z1(), 5);
  const item = plan.resolveItemType({ pos: ["room.x0", 0], size: [1, 1] });
  close(plan.normalizeGeometryAtFloor(item, { z0: 6 }).x, 0.06);
  close(plan.normalizeGeometryAtFloor(item, { z0: 6 }).z0, 6);
  assert.throws(() => plan.normalizeGeometryAtFloor({ pos: ["missing.x0", 0], size: [1, 1] },
    { z0: 8 }), /Unknown room reference/);
  assert.equal(plan.partReferenceStack, stack);
  assert.equal(plan.itemRoomBoundsCache, cache);
  assert.equal(Object.hasOwn(plan, "resolutionContext"), false);
});

test("nested resolution facades keep a flat owner and inherit only explicit context values", () => {
  const plan = prepare(fixture());
  const local = new Map();
  const floor = FloorPlanGeometry.inContext(plan, { floorZ: 9, floorId: "upper" });
  const item = FloorPlanGeometry.inContext(floor, { itemReferences: true });
  const parts = FloorPlanGeometry.inContext(item, { partScopes: [local] });
  assert.equal(Object.getPrototypeOf(parts), plan);
  assert.equal(parts.resolutionOwner, plan);
  assert.equal(parts.resolutionContext.floorZ, 9);
  assert.equal(parts.resolutionContext.floorId, "upper");
  assert.equal(parts.resolutionContext.itemReferences, true);
  assert.equal(parts.resolutionContext.partScopes[0], local);
  assert.equal(floor.resolutionContext.itemReferences, false);
  assert.equal(Object.isFrozen(parts.resolutionContext), true);
});

test("a lazy reference sees its explicit floor context across nested successful and failed calculations", () => {
  const plan = prepare(fixture());
  plan.currentFloorHeight = 17;
  plan.references.set("probe", { x0() {
    const outer = FloorPlanGeometry.context(plan);
    close(outer.floorZ, 6);
    assert.equal(plan.currentFloorHeight, 17);
    close(plan.normalizeGeometryAtFloor({ pos: [0, 0], size: [1, 1] }, { z0: 9 }).z0, 9);
    assert.throws(() => plan.normalizeGeometryAtFloor({ pos: ["missing.x0", 0], size: [1, 1] },
      { z0: 10 }), /Unknown room reference/);
    assert.equal(FloorPlanGeometry.context(plan), outer);
    return outer.floorZ;
  } });
  const geometry = plan.normalizeGeometryAtFloor({ pos: ["probe.x0", 0], size: [1, 1] }, { z0: 6 });
  assert.deepEqual([geometry.x, geometry.z0], [6, 6]);
  assert.equal(plan.currentFloorHeight, 17);
  assert.equal(Object.hasOwn(plan, "resolutionContext"), false);
});

test("legacy lazy references retain forward local part scope without mutating the parent stack", () => {
  const plan = prepare(fixture());
  plan.references.set("offset", { x0: () => plan.resolve("later.x1") + 1 });
  const parts = plan.normalizeParts([
    { id: "first", pos: ["offset.x0", 0], size: [1, 1] },
    { id: "later", pos: [2, 0], size: [3, 1] },
  ]);
  close(parts[0].x, 6);
  assert.equal(plan.partReferenceStack.length, 0);
  assert.throws(() => plan.resolve("later.x0"), /Unknown room reference/);
  assert.equal(Object.hasOwn(plan, "resolutionContext"), false);
});

test("the synchronous legacy bridge restores an existing context descriptor even on getter failure", () => {
  const plan = prepare(fixture());
  const original = FloorPlanGeometry.context(plan);
  Object.defineProperty(plan, "resolutionContext", { value: original, configurable: true, enumerable: true });
  const descriptor = Object.getOwnPropertyDescriptor(plan, "resolutionContext");
  plan.references.set("broken", Object.defineProperty({}, "x0", {
    get() { throw new Error("broken reference getter"); },
  }));
  assert.throws(() => plan.normalizeGeometryAtFloor({ pos: ["broken.x0", 0], size: [1, 1] },
    { z0: 9 }), /broken reference getter/);
  assert.deepEqual(Object.getOwnPropertyDescriptor(plan, "resolutionContext"), descriptor);
});

test("global list preparation cannot leak a floor context when item collection throws", () => {
  const plan = prepare(fixture());
  plan.currentFloorHeight = 17;
  const broken = Object.defineProperty({ id: "upper", z0: 9 }, "items", {
    get() { throw new Error("broken item collection"); },
  });
  assert.throws(() => plan.prepareGlobalLists({ floors: [
    { id: "ground", z0: 2, items: [] }, broken,
  ] }), /broken item collection/);
  assert.equal(plan.currentFloorHeight, 17);
  assert.equal(Object.hasOwn(plan, "resolutionContext"), false);
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

test("both cottage projects can analyze every floor from domain parts without rendering", () => {
  for (const file of ["cottage-ferraz-cesar.json5", "cottage-ferraz-cesar-garage-transverse.json5"]) {
    const plan = prepare(FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")));
    assert.deepEqual(plan.errors, []);
    for (const floor of plan.currentConfig.floors) {
      const rooms = floor.rooms.map((definition) => ({
        id: definition.id, floorId: floor.id,
        overlapTargets: plan.normalizeOverlapTargets(definition.overlaps),
        overlayTargets: plan.normalizeOverlapTargets(definition.overlays),
        parts: plan.getRoomGeometry(definition.id).normalizedParts.map((part) => ({
          ...part,
          overlapTargets: plan.normalizeOverlapTargets(part.overlaps ?? definition.overlaps),
          overlayTargets: plan.normalizeOverlapTargets(part.overlays ?? definition.overlays),
        })),
      }));
      const result = FloorPlanOverlapAnalysis.analyze({ rooms });
      assert.deepEqual(result.errors, [], `${file}: ${floor.id}`);
      const stairIndex = rooms.findIndex((room) => room.id === "stairs");
      if (stairIndex >= 0) assert.equal(result.roomLayers[stairIndex], 1);
    }
  }
});

test("headroom results are prepared for every floor regardless of selected floor or visibility", () => {
  const config = fixture();
  config.comfort_zones = false;
  config.floors.push({ id: "upper", z0: 6, rooms: [
    { id: "upstairs", pos: [0, 0], size: [4, 3], walls: [] },
  ] });
  config.roofs = [{ id: "roof", type: "gable", orientation: "longitudinal",
    base: "room", pitch: 45, z0: 9 }];
  const plan = prepare(config);
  plan.prepareGlobalLists(plan.currentConfig);
  plan.currentFloorId = "ground";
  const hidden = FloorPlanHeadroom.prepare(plan);
  assert.equal(hidden.size, 3);
  assert.ok(hidden.get("upstairs").areas.filter((entry) => entry.height <= 3)
    .every((entry) => entry.area === 12));
  assert.ok(hidden.get("upstairs").areas.find((entry) => entry.height === 3.1).area < 12);
  assert.equal(FloorPlanHeadroom.enabled(plan, "upstairs"), false);
  plan.currentFloorId = "upper";
  plan.currentConfig.comfort_zones = true;
  const visible = FloorPlanHeadroom.prepare(plan);
  assert.deepEqual(visible, hidden);
  assert.equal(FloorPlanHeadroom.enabled(plan, "upstairs"), true);
});

test("global communications are prepared without drawing and remain independent of selected floor", () => {
  for (const [file, groundCount, upperCount] of [
    ["cottage-ferraz-cesar.json5", 13, 5],
    ["cottage-ferraz-cesar-garage-transverse.json5", 14, 8],
  ]) {
    const plan = prepare(FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")));
    plan.prepareGlobalLists(plan.currentConfig);
    plan.currentFloorId = "ground";
    const first = FloorPlanCommunications.prepare(plan);
    assert.equal(first.filter((entry) => entry.floorId === "ground").length, groundCount);
    assert.equal(first.filter((entry) => entry.floorId === "upper").length, upperCount);
    for (const entry of first) {
      close(entry.segments.reduce((sum, segment) => sum + segment.length, 0), entry.length);
      assert.ok(entry.segments.every((segment) => segment.from[2] === entry.z0 && segment.to[2] === entry.z0));
    }
    plan.currentFloorId = "upper";
    assert.deepEqual(FloorPlanCommunications.prepare(plan), first);
  }
});
