const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
const area = FloorPlanRoomArea;
const target = () => ({ id: "room", floorId: "ground", parts: [
  { id: "left", x: 0, y: 0, w: 4, l: 4 },
] });

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
