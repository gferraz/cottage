const { test } = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../src/models/communications.js");
const communications = FloorPlanCommunications;
const room = (id, x, y = 0, extra = {}) => ({
  id, label: id.toUpperCase(), floor: { id: "upper", z0: 3 }, z0: 3,
  boundaries: {
    left: { coordinate: x, start: y, end: y + 4, state: "open" },
    right: { coordinate: x + 4, start: y, end: y + 4, state: "open" },
    top: { coordinate: y, start: x, end: x + 4, state: "open" },
    bottom: { coordinate: y + 4, start: x, end: x + 4, state: "open" },
  },
  ...extra,
});
const wall = (points, extra = {}) => ({ points, z0: 3, z1: 5,
  thickness: 0.12, scopeFloorId: "upper", ...extra });

test("vertical and horizontal communications carry exact XYZ segments and owning sides", () => {
  for (const vertical of [true, false]) {
    const [result] = communications.analyze([room("a", 0), room("b", vertical ? 4 : 0, vertical ? 0 : 4)]);
    assert.equal(result.orientation, vertical ? "vertical" : "horizontal");
    assert.equal(result.floorId, "upper");
    assert.equal(result.z0, 3);
    assert.equal(result.coordinate, 4);
    assert.equal(result.firstSide, vertical ? "right" : "bottom");
    assert.equal(result.secondSide, vertical ? "left" : "top");
    assert.deepEqual(result.segments, [{ from: vertical ? [4, 0, 3] : [0, 4, 3], to: [4, 4, 3], length: 4 }]);
  }
});

test("separate gaps retain their locations instead of becoming a single opening of the summed width", () => {
  const rooms = [room("a", 0), room("b", 4)];
  const [split] = communications.analyze(rooms, [wall([[4, 1], [4, 3]])]);
  const [continuous] = communications.analyze(rooms, [wall([[4, 2], [4, 4]])]);
  assert.equal(split.length, 2);
  assert.equal(continuous.length, 2);
  assert.deepEqual(split.segments, [
    { from: [4, 0, 3], to: [4, 1, 3], length: 1 },
    { from: [4, 3, 3], to: [4, 4, 3], length: 1 },
  ]);
  assert.equal(continuous.segments.length, 1);
  assert.equal(continuous.segments[0].length, 2);
});

test("reversed, duplicated and overlapping wall paths leave the same disjoint gaps", () => {
  const rooms = [room("a", 0), room("b", 4)];
  const walls = [wall([[4, 1], [4, 2]]), wall([[4, 3], [4, 1.5]]), wall([[4, 2], [4, 1]])];
  const [first] = communications.analyze(rooms, walls);
  const [second] = communications.analyze([...rooms].reverse(), [...walls].reverse());
  assert.deepEqual(first.segments, second.segments);
  assert.equal(first.length, first.segments.reduce((sum, segment) => sum + segment.length, 0));
  assert.equal(second.firstSide, "left");
});

test("wall scope, elevation and thickness determine whether a shared boundary is blocked", () => {
  const rooms = [room("a", 0), room("b", 4)];
  for (const candidate of [
    wall([[4, 0], [4, 4]], { scopeFloorId: "ground" }),
    wall([[4, 0], [4, 4]], { z0: 4 }),
    wall([[4, 0], [4, 4]], { z0: 0, z1: 3 }),
    wall([[4.1, 0], [4.1, 4]]),
    wall([[4, 0], [5, 4]]),
  ]) assert.equal(communications.analyze(rooms, [candidate])[0].length, 4);
  assert.deepEqual(communications.analyze(rooms, [wall([[4.05, 0], [4.05, 4]])]), []);
});

test("different known floors and solid sides do not create natural communications", () => {
  assert.deepEqual(communications.analyze([room("a", 0), room("b", 4, 0,
    { floor: { id: "ground", z0: 0 } })]), []);
  const blocked = room("b", 4);
  blocked.boundaries.left.state = "solid";
  assert.deepEqual(communications.analyze([room("a", 0), blocked]), []);
  blocked.boundaries.left.state = "virtual";
  assert.equal(communications.analyze([room("a", 0), blocked])[0].length, 4);
});

test("unscoped legacy rooms use the first room elevation without inventing a floor ID", () => {
  const [result] = communications.analyze([room("a", 0, 0, { floor: null, z0: 2 }),
    room("b", 4, 0, { floor: null, z0: 2 })]);
  assert.equal(result.floorId, null);
  assert.deepEqual(result.segments[0].from, [4, 0, 2]);
});

test("frozen inputs remain unchanged and repeated results do not share endpoint arrays", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const rooms = freeze([room("a", 0), room("b", 4)]);
  const walls = freeze([wall([[4, 1], [4, 2]])]);
  const original = structuredClone({ rooms, walls });
  const first = communications.analyze(rooms, walls);
  first[0].segments[0].from[0] = 99;
  assert.equal(communications.analyze(rooms, walls)[0].segments[0].from[0], 4);
  assert.deepEqual({ rooms, walls }, original);
  assert.deepEqual(communications.analyze([]), []);
});
