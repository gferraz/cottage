const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
const flight = (overrides = {}) => ({ id: "flight", ownerId: "stairs", floorId: "ground",
  classes: "stair-flight", x: 0, y: 0, w: 3, l: 1.2, z0: 0, z1: 3,
  stairAxis: "horizontal", stairDirection: "forward", stairRise: "up", ...overrides });
const landing = (overrides = {}) => ({ id: "landing", ownerId: "stairs", floorId: "upper",
  classes: "stair-landing", x: 3, y: 0, w: 1.2, l: 1.2, z0: 3, z1: 3, ...overrides });
const floors = [{ id: "ground", z0: 0 }, { id: "upper", z0: 3 }];
const analyze = (parts) => FloorPlanStairConnectivity.analyze(parts, floors);

test("flight ends retain width, absolute elevation and destination floors without mutating input", () => {
  const parts = [flight(), landing()];
  const original = structuredClone(parts);
  const result = analyze(parts);
  assert.deepEqual(parts, original);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.nodes[0].ends.map((end) => end.floorIds), [["ground"], ["upper"]]);
  assert.deepEqual(result.nodes[0].ends[1].start, { x: 3, y: 0, z: 3 });
  assert.deepEqual(result.nodes[0].ends[1].end, { x: 3, y: 1.2, z: 3 });
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].aEnd, "upper");
});

test("axis, reversed direction and descending definitions determine lower and upper ends", () => {
  for (const stairAxis of ["horizontal", "vertical"]) for (const stairDirection of ["forward", "reverse"])
    for (const stairRise of ["up", "down"]) {
      const [low, high] = analyze([flight({ stairAxis, stairDirection, stairRise })]).nodes[0].ends;
      const axis = stairAxis === "horizontal" ? "x" : "y";
      assert.equal(high.start[axis] > low.start[axis],
        (stairDirection !== "reverse") === (stairRise !== "down"));
      assert.equal(low.z, 0);
      assert.equal(high.z, 3);
    }
});

test("lateral contact, corners and different elevations do not connect flight ends", () => {
  for (const part of [landing({ x: 0, y: 1.2 }), landing({ y: 1.2 }),
    landing({ z0: 2, z1: 2 }), landing({ x: 3.1 })])
    assert.equal(analyze([flight(), part]).edges.length, 0);
});

test("U stairs connect flights through adjacent level landings independently of input order", () => {
  const parts = [flight({ z1: 1.5 }), landing({ z0: 1.5, z1: 1.5 }),
    landing({ id: "turn", y: 1.2, z0: 1.5, z1: 1.5 }),
    flight({ id: "return", y: 1.2, z0: 1.5, stairDirection: "reverse" })];
  for (const order of [parts, [...parts].reverse()]) {
    const result = analyze(order);
    assert.equal(result.edges.length, 3);
    assert.equal(result.nodes.length, 4);
    assert.equal(result.nodes.filter((node) => node.kind === "flight")
      .flatMap((node) => node.ends).filter((end) => end.floorIds.length).length, 2);
  }
});

test("aligned consecutive flights connect only at opposite ends at equal elevation", () => {
  assert.equal(analyze([flight({ z1: 1.5 }),
    flight({ id: "next", x: 3, z0: 1.5 })]).edges.length, 1);
  assert.equal(analyze([flight(), flight({ id: "copy" })]).edges.length, 0);
});

test("unsupported rotated, flat and duplicate parts produce explicit diagnostics", () => {
  const result = analyze([flight(), flight(), flight({ id: "rotated", rotation: 90 }),
    flight({ id: "flat", z1: 0 })]);
  assert.equal(result.nodes.length, 1);
  assert.equal(result.diagnostics.length, 3);
  assert.equal(result.diagnostics[0].reason, "duplicate-part");
});

const zone = () => ({ ownerId: "stairs", ruleId: "lower-access", floorId: "ground",
  category: "circulation", required: [[{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }]] });
test("derived zones preserve required region separately from uncomputed availability", () => {
  const source = zone();
  const [result] = FloorPlanDerivedZones.collect([source]);
  assert.equal(result.available, null);
  assert.deepEqual(result.interferences, []);
  assert.deepEqual(result.required, source.required);
  result.required[0][0].x = 4;
  assert.equal(source.required[0][0].x, 0);
  assert.equal(FloorPlanDerivedZones.collect([zone()])[0].required[0][0].x, 0);
});
test("zone identity distinguishes rules and floors and rejects duplicates and invalid geometry", () => {
  assert.equal(FloorPlanDerivedZones.collect([zone(), { ...zone(), floorId: "upper" },
    { ...zone(), ruleId: "upper-access" }]).length, 3);
  assert.throws(() => FloorPlanDerivedZones.collect([zone(), zone()]), /duplicada/);
  assert.throws(() => FloorPlanDerivedZones.collect([{ ...zone(), required: [] }]), /válidos/);
  assert.throws(() => FloorPlanDerivedZones.collect([{ ...zone(), category: "other" }]), /válidos/);
  assert.throws(() => FloorPlanDerivedZones.collect([{ ...zone(), required: [
    [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
  ] }]), /válidos/);
});
