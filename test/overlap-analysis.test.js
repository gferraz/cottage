const { test } = require("node:test");
const assert = require("node:assert/strict");
globalThis.window = globalThis;
require("../src/models/overlap-analysis.js");
const analysis = FloorPlanOverlapAnalysis;
const room = (id, x = 0, extra = {}) => ({ id, floorId: "ground",
  parts: [{ x, y: 0, w: 2, l: 2 }], ...extra });

test("layers follow room and part dependencies and include furniture in the graph", () => {
  const result = analysis.analyze({ rooms: [
    room("base"),
    room("compound", 4, { parts: [
      { id: "low", x: 4, y: 0, w: 1, l: 1 },
      { id: "high", x: 5, y: 0, w: 1, l: 1, overlayTargets: ["base"] },
    ] }),
    room("top", 8, { overlayTargets: ["compound"] }),
  ], items: [{ id: "desk", overlayTargets: ["top"] }] });
  assert.deepEqual(result.roomLayers, [0, 1, 2]);
  assert.equal(result.layers.get("compound.low"), 0);
  assert.equal(result.layers.get("compound.high"), 1);
  assert.equal(result.layers.get("desk"), 3);
  assert.equal(result.maxLayer, 3);
  assert.deepEqual(result.errors, []);
});

test("overlays assign a layer but do not authorize an overlapping footprint", () => {
  const result = analysis.analyze({ rooms: [room("a"), room("b", 1, { overlayTargets: ["a"] })] });
  assert.deepEqual(result.roomLayers, [0, 1]);
  assert.deepEqual([...result.collidingRooms], [0, 1]);
  assert.deepEqual(result.errors, [{ category: "collision", id: "a / b",
    message: "Sobreposição entre a e b" }]);
});

test("an overlap allowed by either object or a specific part preserves normal appearance", () => {
  for (const firstAllowed of [true, false]) {
    const rooms = [room("a", 0, { parts: [{ id: "part", x: 0, y: 0, w: 2, l: 2,
      ...(firstAllowed ? { overlapTargets: ["b"] } : {}) }] }),
    room("b", 1, firstAllowed ? {} : { overlapTargets: ["a.part"] })];
    const result = analysis.analyze({ rooms });
    assert.equal(result.collidingRooms.size, 0);
    assert.deepEqual(result.errors, []);
  }
});

test("part overlap permissions override inherited room permissions", () => {
  const result = analysis.analyze({ rooms: [
    room("a", 0, { overlapTargets: ["b"], parts: [
      { id: "part", x: 0, y: 0, w: 2, l: 2, overlapTargets: [] },
    ] }), room("b", 1),
  ] });
  assert.equal(result.errors[0].category, "collision");
});

test("multiple intersecting parts report one error per room pair", () => {
  const rooms = [room("a", 0, { parts: [
    { id: "one", x: 0, y: 0, w: 2, l: 1 },
    { id: "two", x: 0, y: 1, w: 2, l: 1 },
  ] }), room("b", 1)];
  const result = analysis.analyze({ rooms });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].id, "a / b");
  assert.deepEqual([...result.collidingRooms], [0, 1]);
});

test("different floors, touching edges and sub-tolerance intersections do not collide", () => {
  for (const other of [room("b", 0, { floorId: "upper" }), room("b", 2), room("b", 2 - 1e-10)]) {
    const result = analysis.analyze({ rooms: [room("a"), other] });
    assert.deepEqual(result.errors, []);
  }
  assert.equal(analysis.analyze({ rooms: [room("a"), room("b", 2 - 1e-7)] }).errors.length, 1);
});

test("unknown targets and dependency cycles retain their diagnostic categories", () => {
  const missing = analysis.analyze({ rooms: [room("a", 0, { overlayTargets: ["missing"] })] });
  assert.deepEqual(missing.errors, [{ category: "overlap", id: "a",
    message: "Referência de sobreposição inexistente: missing" }]);
  const cyclic = analysis.analyze({ rooms: [
    room("a", 0, { overlayTargets: ["b"] }), room("b", 4, { overlayTargets: ["a"] }),
  ] });
  assert.deepEqual(cyclic.errors, [{ category: "overlap", id: "a",
    message: "Ciclo de camadas detectado envolvendo a" }]);
  assert.deepEqual(cyclic.roomLayers, [2, 1]);
});

test("anonymous rooms are still marked and use their labels in collision diagnostics", () => {
  const result = analysis.analyze({ rooms: [room(undefined, 0, { label: "Sem ID" }), room("b", 1)] });
  assert.equal(result.layers.has(undefined), false);
  assert.deepEqual(result.roomLayers, [0, 0]);
  assert.equal(result.errors[0].id, "Sem ID / b");
  assert.deepEqual([...result.collidingRooms], [0, 1]);
});

test("analysis accepts deeply frozen data and repeated calls have independent results", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const input = freeze({ rooms: [room("a"), room("b", 1)] });
  const original = structuredClone(input);
  const first = analysis.analyze(input);
  first.layers.set("a", 99);
  first.errors.length = 0;
  const second = analysis.analyze(input);
  assert.equal(second.layers.get("a"), 0);
  assert.equal(second.errors.length, 1);
  assert.deepEqual(input, original);
  const empty = analysis.analyze({});
  assert.deepEqual(empty.roomLayers, []);
  assert.equal(empty.maxLayer, 0);
});
