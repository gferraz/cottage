const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("./helpers/load-modules");
for (const name of ["models/terrain", "config/catalog", "config/coordinates", "models/geometry",
  "models/geometry-domain", "models/walls", "config/parser", "models/model", "models/validation",
  "models/openings", "models/references", "views/elements", "views/3d/slabs", "models/headroom",
  "exports/html", "models/metrics", "views/terrain", "main"]) require(`../src/${name}.js`);

test("front plan excludes rear room walls while retaining walls spanning overlapping stories", () => {
  const config = FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "../cottage-ferraz-cesar-2-level-floors.json5"), "utf8"));
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(config);
  const upper = plan.model.floors.find(floor => floor.id === "upper-rear");
  assert.ok(upper.openings.every(opening => opening.to === "ground-rear"));
  assert.equal(FloorPlanMetrics.floorsOverlap(plan, "ground", "ground-rear"), false);
  assert.equal(FloorPlanMetrics.floorsOverlap(plan, "ground", "upper"), true);
  const selected = plan.model.floors.find(floor => floor.id === "ground");
  const visible = [];
  Object.assign(plan, {
    currentFloorId: selected.id, currentFloorHeight: selected.z0,
    roomElements: [], showAllFloors: false,
    add(options) { visible.push(options.id); return null; },
  });
  plan.renderWallsForFloor(selected);
  for (const wall of plan.walls.values()) {
    if (wall.sourceRoomIds.every(id => plan.roomFloorConfigs.get(id)?.id === "ground-rear"))
      assert.ok(!visible.includes(wall.id), wall.id);
  }
  assert.ok(visible.length > 0);
  plan.showAllFloors = true;
  visible.length = 0;
  plan.renderWallsForFloor(plan.model.floors.find(floor => floor.id === "ground-rear"));
  assert.ok(visible.includes("powder-left"));
});

test("split ground levels connect through two corridor risers and retain usable rear openings", () => {
  const source = fs.readFileSync(path.join(__dirname, "../cottage-ferraz-cesar-2-level-floors.json5"), "utf8");
  for (const rise of [0.17, 0.18]) {
    const config = FloorPlanParser.parse(source);
    config.floors.find(floor => floor.id === "ground-rear").z0 = -2 * rise;
    const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
    const prepared = plan.prepareProject(config);
    assert.deepEqual(prepared.errors, []);
    assert.deepEqual([...prepared.floorErrors.values()].flat(), []);
    assert.equal(plan.allSlabs.length, 4);
    for (const id of ["master", "closet", "master-bath", "vestibule"]) {
      const walls = plan.wallRenderParts.filter(wall => wall.sourceRoomIds?.includes(id));
      assert.ok(walls.length > 0, id);
      assert.ok(walls.every(wall => wall.z0 === 0.3 && Number.isFinite(wall.z1) && wall.z1 > wall.z0), id);
    }
    for (const id of ["porch", "dining", "master", "closet", "master-bath", "vestibule"])
      assert.equal(plan.getRoomGeometry(id).z0(), 0.3, id);
    for (const id of ["garage", "kitchen", "powder", "laundry", "rear-corridor"])
      assert.equal(plan.getRoomGeometry(id).z0(), -2 * rise, id);
    for (const id of ["unused-rear", "bedroom-south", "bathroom-west", "bathroom-front", "upper-corridor", "stair-arrival"])
      assert.equal(plan.getRoomGeometry(id).z0(), 3, id);
    for (const id of ["bedroom-north", "bedroom-east", "playroom"])
      assert.equal(plan.getRoomGeometry(id).z0(), 3, id);
    assert.equal(plan.allSlabs.find(slab => slab.floorId === "upper-rear").z, 3);
    for (const id of ["upper-corridor-steps", "upper-arrival-steps"])
      assert.equal(plan.stairDefinitions.has(id), false);
    assert.equal(plan.getRoomGeometry("stairs").normalizedParts.find(part => part.id === "upper-flight").z1, 3);
    assert.equal(plan.getRoomGeometry("playroom").y1(), plan.getRoomGeometry("stair-arrival").y0());
    const rearCorridor = plan.getRoomGeometry("upper-corridor");
    assert.equal(rearCorridor.z0(), 3);
    assert.equal(plan.roomDefinitions.has("upper-corridor-front"), false);
    const roof = plan.allRoofs.find(roof => roof.id === "rear-transverse-roof");
    assert.equal(plan.resolve(roof.z0), 3);
    assert.equal(rearCorridor.y1(), plan.getRoomGeometry("stairs").y0());
    assert.equal(rearCorridor.y0(), plan.getRoomGeometry("bedroom-north").y1());
    const steps = plan.getRoomGeometry("level-stairs");
    const corridor = plan.getRoomGeometry("rear-corridor");
    assert.equal(steps.y0(), plan.getRoomGeometry("dining").y1());
    assert.equal(steps.y1(), corridor.y0());
    assert.equal(steps.x0(), corridor.x0());
    assert.equal(steps.x1(), corridor.x1());
    assert.ok(Math.abs(steps.h() - (0.3 + 2 * rise)) < 1e-9);
    assert.equal(FloorPlanGeometry.stairSteps(steps.normalizedParts[0]).risers, 2);
    const node = plan.stairConnectivity.nodes.find(node => node.ownerId === "level-stairs");
    assert.deepEqual(node.ends.map(end => end.floorIds), [["ground-rear"], ["ground"]]);
    const garageDoors = plan.allOpenings.filter(opening => opening.roomId === "garage");
    assert.equal(garageDoors.length, 2);
    assert.ok(garageDoors.every(opening => opening.z0 === -2 * rise));
    for (const id of ["powder", "kitchen"]) {
      const door = plan.allOpenings.find(opening => opening.roomId === id);
      assert.equal(door.z0, -2 * rise);
      assert.equal(door.void.z0, -2 * rise);
      assert.equal(door.element.z0, -2 * rise);
      const definition = plan.model.floors.find(floor => floor.id === "ground-rear").rooms.find(room => room.id === id);
      const opening = FloorPlanOpenings.collect(definition, { roomId: id })[0];
      const context = FloorPlanGeometry.inContext(plan, { floorZ: 0, floorId: "ground" });
      assert.equal(context.normalizeOpening(opening).z0, -2 * rise);
    }
    assert.ok(plan.allItems.filter(item => item.floorId === "ground-rear").every(item => item.z0 === -2 * rise));
  }
});

test("building placement keeps the full footprint behind the front boundary after splitting levels", () => {
  const config = FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "../cottage-ferraz-cesar-2-level-floors.json5"), "utf8"));
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(config);
  const values = new Map();
  plan.root = { style: { setProperty: (key, value) => values.set(key, value) } };
  plan.terrainReference = { frontStart: { x: 0, y: 0 } };
  const previous = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "0" });
  try {
    FloorPlanTerrain.applyBuildingPlacement(plan, plan.currentConfig.building);
  } finally {
    if (previous) globalThis.getComputedStyle = previous;
    else delete globalThis.getComputedStyle;
  }
  const bounds = plan.buildingReferenceBounds();
  const offsetY = values.get("--building-offset-y");
  assert.equal(bounds.y0, 0);
  assert.equal(bounds.y0 + offsetY, 3);
  assert.ok(plan.allRooms.every(room => plan.getRoomGeometry(room.id).y0() + offsetY >= 3));
  plan.model.floors.reverse();
  assert.deepEqual(plan.buildingReferenceBounds(), bounds);
});

test("rear floor does not project the porch stairs by elevation alone", () => {
  const config = FloorPlanParser.parse(fs.readFileSync(path.join(__dirname, "../cottage-ferraz-cesar-2-level-floors.json5"), "utf8"));
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(config);
  const visible = [];
  plan.addRoom = room => visible.push(room.id);
  for (const id of ["ground-rear", "ground"]) {
    const floor = plan.model.floors.find(floor => floor.id === id);
    plan.currentFloorId = id;
    plan.currentFloorHeight = floor.z0;
    visible.length = 0;
    plan.addSpanningStairs(plan.model, floor);
    assert.ok(!visible.includes("front-stairs"), id);
    if (id === "ground") assert.ok(visible.includes("level-stairs"));
  }
});

test("automatic wall tops follow only slabs above each wall portion", () => {
  const floors = [
    { z0: 0, rooms: [] },
    { z0: 2.66, rooms: [{ id: "rear" }] },
    { z0: 3, rooms: [{ id: "front" }] },
  ];
  const parts = { rear: [{ x: 2, y: 0, w: 2, l: 1 }], front: [{ x: 0, y: 0, w: 2, l: 1 }] };
  const plan = { getRoomGeometry: id => ({ geometryParts: parts[id] }) };
  const tops = ordered => {
    const limits = FloorPlanWalls.overheadSlabLimits(plan, ordered, 0);
    return [0.5, 2.5, 4.5].map(x => {
      const solids = FloorPlanWalls.wallSolids(FloorPlanWalls.boxFaces(x, 0.2, 0, x + 0.1, 0.3, 3), [], false, limits);
      return Math.max(...solids.flat(2).map(point => point[2]));
    });
  };
  for (const ordered of [floors, [...floors].reverse()])
    tops(ordered).forEach((top, index) => assert.ok(Math.abs(top - [2.85, 2.51, 3][index]) < 1e-9));
});

test('the main staircase projects onto either upper sector and only once when both are visible', () => {
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(FloorPlanParser.parse(fs.readFileSync('cottage-ferraz-cesar-2-level-floors.json5', 'utf8')));
  const upper = plan.model.floors.filter(floor => floor.storey === 'upper');
  const projected = [];
  plan.addRoom = room => projected.push(room);
  plan.visibleStairOwnerIds = new Set();
  for (const floor of upper) {
    plan.projectedStairIds = new Set();
    plan.currentFloorHeight = floor.z0;
    plan.addSpanningStairs(plan.currentConfig, floor);
    assert.equal(projected.at(-1).id, 'stairs');
    assert.equal(projected.at(-1).derived, true);
  }
  projected.length = 0;
  plan.projectedStairIds = new Set();
  for (const floor of upper) {
    plan.currentFloorHeight = floor.z0;
    plan.addSpanningStairs(plan.currentConfig, floor);
  }
  assert.equal(projected.filter(room => room.id === 'stairs').length, 1);
  projected.length = 0;
  plan.visibleStairOwnerIds.add('stairs');
  plan.projectedStairIds.clear();
  plan.addSpanningStairs(plan.currentConfig, upper[0]);
  assert.equal(projected.length, 0);
});
