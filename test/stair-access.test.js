const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
const flight = (extra = {}) => ({ ownerId: "future-stair", id: "run", floorId: "low",
  classes: "stair-flight", x: 10, y: 20, w: 3, l: 1, z0: 2, z1: 5, h: 3,
  stairAxis: "horizontal", stairRise: "up", stairDirection: "forward", ...extra });
const floors = [{ id: "low", z0: 2 }, { id: "high", z0: 5 }];
const generate = (parts, options) => FloorPlanStairAccess.generate(
  FloorPlanStairConnectivity.analyze(parts, floors), options);
const bounds = (zone) => {
  const points = zone.required.flat();
  return [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)),
    Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y))];
};
test("accesses of future stairs follow endpoints, width, absolute floors and configurable depth", () => {
  const result = generate([flight()]);
  assert.deepEqual(result.map((zone) => zone.floorId), ["low", "high"]);
  assert.deepEqual(bounds(result[0]), [8.8, 20, 10, 21]);
  assert.deepEqual(bounds(result[1]), [13, 20, 14.2, 21]);
  assert.ok(result.every((zone) => zone.available === null));
  const vertical = generate([flight({ stairAxis: "vertical", stairDirection: "reverse" })], { depth: 2 });
  assert.deepEqual(bounds(vertical[0]), [10, 21, 13, 23]);
  assert.deepEqual(bounds(vertical[1]), [10, 18, 13, 20]);
  for (const depth of [0, -1, Infinity, "1.2"])
    assert.throws(() => generate([flight()], { depth }), /positivo/);
});
test("multiple stair owners remain distinct and internal connections do not create access zones", () => {
  const result = generate([flight({ z1: 3, h: 1 }),
    flight({ id: "next", x: 13, z0: 3, h: 2 }), flight({ ownerId: "second", x: 30 })]);
  assert.equal(result.length, 4);
  assert.equal(new Set(result.map((zone) => zone.id)).size, 4);
});
test("accesses track rendered stair visibility while clearance tracks hidden stairs", () => {
  const hidden = [];
  const classes = (values) => ({ contains: (name) => values.includes(name) });
  const zone = { dataset: { stairAccessOwner: "future-stair" },
    classList: { toggle: (name, value) => hidden.push(value) } };
  const room = { dataset: { id: "future-stair" }, classList: classes([]),
    geometryParts: [{ element: { classList: classes([]) } }] };
  const results = generate([flight()]);
  const plan = { derivedZones: results, root: { querySelectorAll: () => [zone] },
    roomElements: [room], stairElements: [] };
  FloorPlanStairAccessView.updateVisibility(plan);
  assert.equal(FloorPlanStairHeadroomView.isVisible(null, [1]), false);
  room.classList = classes(["layer-hidden"]);
  FloorPlanStairAccessView.updateVisibility(plan);
  assert.equal(FloorPlanStairHeadroomView.isVisible(0, [1]), true);
  room.classList = classes([]);
  room.geometryParts[0].element.classList = classes(["layer-hidden"]);
  FloorPlanStairAccessView.updateVisibility(plan);
  plan.roomElements = [];
  FloorPlanStairAccessView.updateVisibility(plan);
  assert.deepEqual(hidden, [false, true, true, true]);
  assert.equal(plan.derivedZones, results);
});
