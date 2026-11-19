const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
const area = FloorPlanRoomArea;
const target = () => ({ id: "room", floorId: "ground", parts: [
  { id: "left", x: 0, y: 0, w: 4, l: 4 },
] });

test("unused rooms have zero net area while false and omitted keep the usual deductions", () => {
  const room = target();
  const deductions = [{ x: 0, y: 0, w: 1, l: 1 }];
  assert.equal(area.netArea(room, deductions), 15);
  assert.equal(area.netArea({ ...room, unused: false }, deductions), 15);
  assert.equal(area.netArea({ ...room, unused: true }, deductions), 0);
  assert.equal(room.parts.reduce((sum, part) => sum + part.w * part.l, 0), 16);
});

test("the room reference adapter carries unused into net area calculations", () => {
  require("../src/models/model.js");
  const room = { dataset: { id: "room", floorId: "ground" },
    geometryParts: target().parts, allowedOverlaps: [], unused: true };
  assert.equal(FloorPlanModel.calculateNetRoomArea(room, [room], []), 0);
  room.unused = false;
  assert.equal(FloorPlanModel.calculateNetRoomArea(room, [room], []), 16);
});

test("deductions match room and part IDs, respect overrides and exclude the target itself", () => {
  const room = target();
  room.overlapTargets = ["room"];
  const whole = { id: "whole", floorId: "ground", overlapTargets: ["room"], parts: [
    { x: 0, y: 0, w: 1, l: 1 },
    { x: 1, y: 0, w: 1, l: 1, overlapTargets: [] },
  ] };
  const partItem = { x: 2, y: 0, w: 1, l: 1, floorId: "ground", overlapTargets: ["room.left"] };
  const unrelated = { x: 0, y: 0, w: 4, l: 4, overlapTargets: ["other"] };
  assert.deepEqual(area.deductionsFor(room, [room, whole], [partItem, unrelated]), [whole.parts[0], partItem]);
});

test("floor filtering is explicit so headroom and the legacy net-area caller keep their policies", () => {
  const room = target();
  const upstairs = { id: "upper", floorId: "upper", overlapTargets: ["room"],
    parts: [{ x: 0, y: 0, w: 1, l: 1 }] };
  const upperItem = { floorId: "upper", overlapTargets: ["room"], x: 1, y: 0, w: 1, l: 1 };
  assert.equal(area.deductionsFor(room, [room, upstairs], [upperItem]).length, 2);
  assert.deepEqual(area.deductionsFor(room, [room, upstairs], [upperItem], { sameFloor: true }), []);
});

test("net area clips deductions at room edges and subtracts overlapping cutters only once", () => {
  const room = target();
  const deductions = [{ x: -1, y: -1, w: 3, l: 3 }, { x: 1, y: 0, w: 2, l: 2 },
    { x: 1, y: 0, w: 2, l: 2 }, { x: 20, y: 0, w: 1, l: 1 }];
  assert.equal(area.netArea(room, deductions), 10);
});

test("net area preserves the summed gross convention for overlapping room parts", () => {
  const room = target();
  room.parts.push({ x: 0, y: 0, w: 2, l: 2 });
  assert.equal(area.netArea(room, []), 20);
  assert.equal(area.netArea(room, [{ x: 0, y: 0, w: 1, l: 1 }]), 19);
});

test("area analysis works on frozen domain data without adding state to the inputs", () => {
  const room = target();
  const item = Object.freeze({ x: 0, y: 0, w: 1, l: 1,
    overlapTargets: Object.freeze(["room"]), floorId: "ground" });
  room.parts.forEach(Object.freeze);
  Object.freeze(room.parts);
  Object.freeze(room);
  const original = structuredClone(room);
  const deductions = area.deductionsFor(room, [room], [item]);
  assert.equal(area.netArea(room, deductions), 15);
  assert.deepEqual(room, original);
});

test("prepared net areas include stair deductions and unused rooms independently of rendered floors", () => {
  require("../src/models/metrics.js");
  const definitions = new Map([
    ["room", { overlaps: undefined }],
    ["unused", { unused: true }],
    ["stairs", { overlaps: ["room"] }],
  ]);
  const geometries = {
    room: [{ id: "main", x: 0, y: 0, w: 4, l: 4 }],
    unused: [{ x: 10, y: 0, w: 3, l: 3 }],
    stairs: [{ x: 0, y: 0, w: 2, l: 2 }],
  };
  const plan = {
    roomDefinitions: definitions, roomElements: [],
    getRoomGeometry: id => ({ normalizedParts: geometries[id] }),
    normalizeOverlapTargets: value => value ?? [],
    allItems: [{ x: 1, y: 1, w: 2, l: 2, overlaps: ["room"] }],
  };
  FloorPlanRoomArea.prepareNetAreas(plan);
  assert.equal(FloorPlanMetrics.netRoomArea(plan, "room", { area: () => 16 }), 9);
  assert.equal(FloorPlanMetrics.netRoomArea(plan, "unused", { area: () => 9 }), 0);
  assert.equal(FloorPlanMetrics.calculateNetRoomArea(plan, { dataset: { id: "room" } }), 9);
});
