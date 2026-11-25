const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./helpers/load-modules");
for (const name of ["models/terrain", "config/catalog", "config/coordinates", "models/geometry",
  "models/geometry-domain", "models/walls", "config/parser", "models/model", "models/validation",
  "models/openings", "models/references", "views/elements", "views/3d/slabs", "models/headroom",
  "exports/html", "main"]) require(`../src/${name}.js`);

const source = () => ({ floors: [
  { id: "ground", z0: 0, ceiling_height: 3, rooms: [
    { id: "room", pos: [0, 0], size: [4, 4], walls: [] },
  ] },
  { id: "upper", z0: 3, ceiling_height: 3, rooms: [
    { id: "upstairs", pos: [0, 0], size: [4, 4], walls: [] },
  ] },
], roofs: [{ id: "roof", type: "gable", orientation: "longitudinal", base: "room", pitch: 45, z0: 6 }] });
const newPlan = () => Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });

test("project preparation resolves model data and analyses without constructing a document or view", () => {
  const plan = newPlan();
  const config = source();
  const original = structuredClone(config);
  const prepared = plan.prepareProject(config);
  assert.equal(typeof document, "undefined");
  assert.equal(plan.preparedProject, prepared);
  assert.equal(prepared.model, plan.model);
  assert.deepEqual(prepared.errors, []);
  assert.equal(prepared.references.get("room"), plan.roomReferences.get("room"));
  assert.equal(plan.headroomResults.size, 2);
  assert.equal(plan.allSlabs.length, 2);
  assert.deepEqual(config, original);
});

test("switching floor requests only a view and preserves prepared data and analysis identity", () => {
  const plan = newPlan();
  const prepared = plan.prepareProject(source());
  const headroom = plan.headroomResults, communications = plan.communicationResults;
  const calls = [];
  plan.currentFloorId = "ground";
  plan.prepareProject = () => assert.fail("view changes must not prepare the project again");
  plan.load = () => assert.fail("view changes must not reload the project");
  plan.renderView = (options) => {
    calls.push(options);
    plan.currentFloorId = plan.currentConfig.floors[options.activeFloor].id;
    return plan;
  };
  assert.equal(plan.selectFloor("upper"), plan);
  plan.selectFloor("__all_floors__");
  plan.selectFloor("missing");
  assert.deepEqual(calls, [{ activeFloor: 1, showAllFloors: false }, { activeFloor: 1, showAllFloors: true }]);
  assert.equal(plan.preparedProject, prepared);
  assert.equal(plan.headroomResults, headroom);
  assert.equal(plan.communicationResults, communications);
});

test("restoring domain references discards transient replacements without rebuilding caches", () => {
  const plan = newPlan();
  const prepared = plan.prepareProject(source());
  const references = plan.references, rooms = plan.rooms, cache = plan.roomGeometryCache;
  const geometry = plan.getRoomGeometry("room");
  plan.references.set("room", { transient: true });
  plan.references.set("view-only", {});
  plan.rooms.set("room", { transient: true });
  FloorPlanProject.restoreReferences(plan);
  assert.equal(plan.references, references);
  assert.equal(plan.rooms, rooms);
  assert.equal(plan.roomGeometryCache, cache);
  assert.equal(plan.getRoomGeometry("room"), geometry);
  assert.equal(plan.references.get("room"), prepared.references.get("room"));
  assert.equal(plan.rooms.get("room"), prepared.rooms.get("room"));
  assert.equal(plan.references.has("view-only"), false);
});

test("cached floor diagnostics are reused without duplicating active-render errors", () => {
  const plan = newPlan();
  const config = source();
  config.floors[1].items = [{ id: "bad", pos: ["missing.x0", 0], size: [1, 1] }];
  const prepared = plan.prepareProject(config);
  const [ground, upper] = plan.model.floors;
  assert.equal(prepared.floorErrors.get(upper).length, 1);
  assert.equal(FloorPlanProject.viewErrors(prepared, ground, false)[0].category, "item");
  assert.deepEqual(FloorPlanProject.viewErrors(prepared, upper, false), []);
  assert.deepEqual(FloorPlanProject.viewErrors(prepared, upper, true), []);
  plan.errors.push({ category: "presentation", message: "transient" });
  assert.equal(FloorPlanProject.viewErrors(prepared, ground, false).length, 1);
});

test("a new project revision invalidates prepared geometry and analyses explicitly", () => {
  const plan = newPlan();
  const first = plan.prepareProject(source());
  const headroom = plan.headroomResults;
  const changed = source();
  changed.floors[0].rooms[0].size[0] = 5;
  const second = plan.prepareProject(changed);
  assert.notEqual(second, first);
  assert.notEqual(plan.headroomResults, headroom);
  assert.equal(plan.getRoomGeometry("room").w(), 5);
});

test("both cottage studies prepare all domain data and floor validation without a view", () => {
  for (const file of ["archive/cottage-ferraz-cesar.json5", "archive/cottage-ferraz-cesar-garage-transverse.json5"]) {
    const plan = newPlan();
    const prepared = plan.prepareProject(FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")));
    assert.deepEqual(prepared.errors, [], file);
    assert.deepEqual([...prepared.floorErrors.values()].flat(), [], file);
    assert.equal(plan.headroomResults.size, plan.roomDefinitions.size);
    assert.equal(plan.allSlabs.length, 2);
    assert.equal(plan.stairConnectivity.nodes.filter((node) => node.ownerId === "stairs").length, 4);
    assert.equal(plan.stairConnectivity.edges.length, 3);
    assert.equal(plan.stairConnectivity.nodes.filter((node) => node.ownerId === "stairs")
      .flatMap((node) => node.ends).filter((end) => end.floorIds.length).length, 2);
    assert.equal(plan.derivedZones.filter((zone) => zone.ownerId === "stairs").length, 2);
    assert.ok(plan.derivedZones.every((zone) => zone.available === null));
    const underStairs = plan.stairHeadroomResults.filter((result) => result.ownerId === "stairs");
    assert.deepEqual(underStairs.map((result) => result.floorId), ["ground"]);
    assert.ok(underStairs[0].covered.area > 0);
    assert.deepEqual(underStairs[0].bands.map(band => band.height), [0, 1.3, 2.1, 2.3, 2.85, 3.1]);
  }
});

function capturePlan() {
  const calls = [];
  const plan = {
    currentConfig: { floors: [{ id: "ground" }, { id: "upper" }] },
    currentFloorId: "upper", showAllFloors: true, multiFloorMode: true, layerCutoff: "above-zero",
    load: () => assert.fail("export must reuse the prepared project"),
    renderView(options) {
      calls.push(options);
      this.currentFloorId = this.currentConfig.floors[options.activeFloor].id;
      this.showAllFloors = options.showAllFloors;
      this.layerCutoff = null;
    },
    updateLayerVisibility() { calls.push("layers"); },
    renderMultiFloorUnderlay() { calls.push("underlay"); },
  };
  return { plan, calls };
}

test("export captures individual floors and restores the original all-floors view and filters", () => {
  const { plan, calls } = capturePlan();
  const snapshots = FloorPlanHtmlExport.captureFloorViews(plan, (floor) => {
    assert.equal(plan.showAllFloors, false);
    assert.equal(plan.multiFloorMode, false);
    assert.equal(plan.layerCutoff, "above-zero");
    return floor.id;
  });
  assert.deepEqual(snapshots, ["ground", "upper"]);
  assert.equal(plan.currentFloorId, "upper");
  assert.equal(plan.showAllFloors, true);
  assert.equal(plan.multiFloorMode, true);
  assert.equal(plan.layerCutoff, "above-zero");
  assert.deepEqual(calls.slice(-3), [{ activeFloor: 1, showAllFloors: true }, "layers", "underlay"]);
});

test("export restores view state even when snapshot capture fails", () => {
  const { plan } = capturePlan();
  assert.throws(() => FloorPlanHtmlExport.captureFloorViews(plan, () => {
    throw new Error("snapshot failed");
  }), /snapshot failed/);
  assert.equal(plan.currentFloorId, "upper");
  assert.equal(plan.showAllFloors, true);
  assert.equal(plan.multiFloorMode, true);
  assert.equal(plan.layerCutoff, "above-zero");
});

test("floor checkboxes preserve arbitrary selections and allow clearing all floors", () => {
  const plan = newPlan();
  plan.currentConfig = { floors: [{ id: 'ground' }, { id: 'upper' }, { id: 'attic' }] };
  plan.showAllFloors = true;
  plan.renderView = options => {
    plan.selectedFloorIds = options.selectedFloorIds;
    plan.showAllFloors = options.showAllFloors;
    return plan;
  };
  plan.toggleFloor('upper', false);
  assert.deepEqual([...plan.selectedFloorIds], ['ground', 'attic']);
  assert.deepEqual(plan.visibleFloors().map(floor => floor.id), ['ground', 'attic']);
  plan.toggleFloor('attic', false);
  plan.toggleFloor('ground', false);
  assert.deepEqual([...plan.selectedFloorIds], []);
  plan.toggleFloor('__all_floors__', true);
  assert.equal(plan.selectedFloorIds.size, 3);
  assert.equal(plan.showRoofs, true);
  plan.toggleFloor('__all_floors__', false);
  assert.equal(plan.selectedFloorIds.size, 0);
  assert.equal(plan.showRoofs, false);
});

test("export restores an independent floor selection", () => {
  const { plan, calls } = capturePlan();
  plan.selectedFloorIds = new Set(["ground"]);
  FloorPlanHtmlExport.captureFloorViews(plan, floor => floor.id);
  assert.deepEqual([...calls.at(-3).selectedFloorIds], ["ground"]);
});

test('slab-owned compound openings resolve expressions and remove overhead obstruction only in their union', () => {
  const config = source();
  config.floors[1].slabs = [{ id: 'upper-slab', openings: [{ id: 'well', parts: [
    { rectangle: ['upstairs.x0', 'upstairs.y0', 'upstairs.x0 + 1', 'upstairs.y0 + 3'] },
    { rectangle: ['upstairs.x0', 'upstairs.y0 + 2', 'upstairs.x0 + 3', 'upstairs.y0 + 3'] },
  ] }] }];
  config.floors[1].label = 'Superior';
  const plan = newPlan();
  plan.prepareProject(config);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.warnings, []);
  const slab = plan.allSlabs.find(slab => slab.floorId === 'upper');
  assert.equal(slab.label, 'Superior');
  assert.equal(slab.parts.reduce((sum, part) => sum + part.w * part.l, 0), 11);
  assert.equal(plan.allSlabs.find(slab => slab.floorId === 'ground').parts.reduce((sum, part) => sum + part.w * part.l, 0), 16);
});

test('cartesian slab openings follow their referenced rooms through axis reflection', () => {
  const config = source();
  config.coordinate_system = 'cartesian';
  config.floors[1].slabs = [{ id: 'upper-slab', openings: [{ id: 'well', parts: [
    { rectangle: ['upstairs.x0', 'upstairs.y0', 'upstairs.x0 + 1', 'upstairs.y0 + 3'] },
    { rectangle: ['upstairs.x0', 'upstairs.y0 + 2', 'upstairs.x0 + 3', 'upstairs.y0 + 3'] },
  ] }] }];
  const plan = newPlan();
  plan.prepareProject(config);
  assert.deepEqual(plan.errors, []);
  const slab = plan.allSlabs.find(slab => slab.floorId === 'upper');
  assert.equal(slab.parts.reduce((sum, part) => sum + part.w * part.l, 0), 11);
  assert.ok(slab.parts.every(part => part.x >= -4 && part.x + part.w <= 0));
  // The same reflection must apply to a single rectangle without parts.
  config.floors[1].slabs[0].openings[0] = { rectangle: ['upstairs.x0', 'upstairs.y0', 'upstairs.x0 + 1', 'upstairs.y0 + 3'] };
  plan.prepareProject(config);
  assert.equal(plan.allSlabs.find(slab => slab.floorId === 'upper').parts.reduce((sum, part) => sum + part.w * part.l, 0), 13);
});
