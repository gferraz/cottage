const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
require("../src/models/geometry");
require("../src/models/walls");
const flight = (extra = {}) => ({ ownerId: "future-stair", id: "run", floorId: "ground",
  classes: "stair-flight", x: 0, y: 0, w: 4, l: 1, z0: 0, z1: 4, h: 4,
  stairAxis: "horizontal", stairRise: "up", stairDirection: "forward", ...extra });
const floors = [{ id: "ground", z0: 0 }, { id: "upper", z0: 4 }];
const analyze = (parts, levels = floors, roofs) => FloorPlanStairHeadroom.analyze(parts, levels, roofs);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test("stair clearance reuses roof height thresholds and partitions the flight footprint", () => {
  const input = [flight()];
  const original = structuredClone(input);
  const [result] = analyze(input);
  assert.equal(analyze(input).length, 1);
  assert.equal(result.floorId, "ground");
  assert.equal(result.ownerId, "future-stair");
  assert.deepEqual(result.areas.map((area) => area.height), [1.3, 2.1, 2.85, 3.1]);
  result.bands.forEach((band, index) => close(band.area, [1.3, 0.8, 0.75, 0.25, 0.9][index]));
  close(result.bands.reduce((sum, band) => sum + band.area, 0), result.covered.area);
  assert.deepEqual(input, original);
});
test("reversed and descending definitions move the low region without changing areas", () => {
  const forward = analyze([flight()])[0];
  const reverse = analyze([flight({ stairDirection: "reverse" })])[0];
  const descending = analyze([flight({ stairRise: "down" })])[0];
  close(forward.bands[0].area, reverse.bands[0].area);
  close(reverse.bands[0].area, descending.bands[0].area);
  assert.ok(forward.bands[0].labelPosition[0] < 2);
  assert.ok(reverse.bands[0].labelPosition[0] > 2);
  const vertical = analyze([flight({ stairAxis: "vertical", w: 1, l: 4 })])[0];
  close(vertical.bands[0].area, forward.bands[0].area);
  assert.ok(vertical.bands[0].labelPosition[1] < 2);
});
test("explicit risers follow the underside already used by wall clipping and 3D", () => {
  const part = flight({ risers: 8 });
  const [result] = analyze([part]);
  const plane = FloorPlanWalls.stairUndersidePlane(part);
  close(-plane[0] * 4 - plane[3], 3.5);
  close(result.areas[0].area, 4 - 1.3 * 4 / 3.5);
});
test("level landings, multiple owners and floors use absolute underside elevations", () => {
  const landing = { ...flight(), classes: "stair-landing", z0: 2, z1: 2, h: 0 };
  const results = analyze([landing, flight({ ownerId: "second", x: 10 })],
    [{ id: "lower", z0: -2 }, { id: "ground", z0: 0 }, { id: "upper", z0: 4 }]);
  assert.equal(results.length, 4);
  const below = results.find((r) => r.ownerId === "future-stair" && r.floorId === "ground");
  close(below.bands[1].area, 4);
  const deep = results.find((r) => r.ownerId === "future-stair" && r.floorId === "lower");
  close(deep.bands[4].area, 4);
});
test("the lowest overlapping underside or roof limits headroom without double-counting", () => {
  const [result] = analyze([flight(), { ...flight(), id: "landing", classes: "stair-landing",
    z0: 2, z1: 2, h: 0 }]);
  close(result.areas[0].area, 2.7);
  close(result.areas[1].area, 0);
  const roofs = [{ polygons: [[[0, 0, 1], [4, 0, 1], [4, 1, 1], [0, 1, 1]]] }];
  const [underRoof] = analyze([flight()], floors, roofs);
  close(underRoof.areas[0].area, 0);
  close(underRoof.bands[0].area, 4);
});
test("invalid flat flights and rotations are not rendered as invented clearance", () => {
  assert.deepEqual(analyze([flight({ h: 0, z1: 0 }), flight({ rotation: 90 }), flight({ risers: 1 })]), []);
});
test("visibility requires Camada 0 and every source part hidden; analysis identity is preserved", () => {
  for (const cutoff of [null, "above-zero", 1, 2])
    assert.equal(FloorPlanStairHeadroomView.isVisible(cutoff, [1, 2]), false);
  assert.equal(FloorPlanStairHeadroomView.isVisible(0, [1, 2]), true);
  assert.equal(FloorPlanStairHeadroomView.isVisible(0, [0, 1]), false);
  assert.equal(FloorPlanStairHeadroomView.isVisible(0, []), false);
  const results = analyze([flight()]);
  const hidden = [];
  const plan = { layerCutoff: 0, stairHeadroomResults: results,
    stairConnectivity: FloorPlanStairConnectivity.analyze([flight()], floors),
    stairSourceLayers: new Map([["future-stair.run", 1]]), roomElements: [], stairElements: [],
    root: { querySelectorAll: () => [{ dataset: { stairHeadroomOwner: "future-stair" },
      classList: { toggle: (name, value) => hidden.push(value) } }] } };
  FloorPlanStairHeadroomView.updateVisibility(plan);
  plan.layerCutoff = null;
  FloorPlanStairHeadroomView.updateVisibility(plan);
  assert.deepEqual(hidden, [false, true]);
  assert.equal(plan.stairHeadroomResults, results);
});
test("stair and roof presentation share band drawing, colors and the five clearance labels", () => {
  require("../src/views/headroom");
  const previous = globalThis.document;
  const element = (tag) => ({ tag, attributes: {}, children: [], namespaceURI: "svg",
    setAttribute(name, value) { this.attributes[name] = value; },
    append(child) { this.children.push(child); } });
  globalThis.document = { createElementNS: (namespace, tag) => element(tag) };
  try {
    const svg = element("svg");
    FloorPlanHeadroomView.appendBands({ formatMeters: String }, svg, analyze([flight()])[0],
      { colors: ["low", "medium", "high", "blue"], label: "Sob a escada", allLabels: true });
    assert.deepEqual(svg.children.filter((child) => child.tag === "text").map((child) => child.textContent),
      ["1,3−", "1,3+", "2,1+", "2,85+", "3,1+"]);
    assert.deepEqual(svg.children.filter((child) => child.tag === "path").map((child) => child.attributes.fill),
      ["rgba(210, 110, 25, 0.24)", "low", "medium", "high", "blue"]);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
