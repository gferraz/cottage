const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
require("../src/models/walls.js");
require("../src/models/headroom.js");
require("../src/exports/dxf.js");

const geometry = FloorPlanRoofGeometry;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${actual} != ${expected}`);
const base = FloorPlanGeometryBox.fromValues({ x: -4, y: 2, w: 4, l: 6, z0: 3, h: 0 });
const plan = { references: new Map([["base", base]]), resolve: Number,
  currentConfig: { floors: [{ id: "upper", z0: 3, ceiling_height: 2.5 }] } };
const definition = (orientation) => ({ type: "gable", orientation, base: "base", pitch: 45,
  eaves: { left: 0.5, right: 1 }, rake: [0.2, 0.4], z0: 5.5 });

for (const orientation of ["longitudinal", "transverse"]) {
  test(`${orientation} gable shares planes and ridge while distinguishing wall and intersection footprints`, () => {
    const roof = definition(orientation);
    const original = structuredClone(roof);
    const full = geometry.gableGeometry(plan, roof);
    const contact = geometry.gableGeometry(plan, roof, { includeEaves: false });
    const longitudinal = orientation === "longitudinal";
    close(full.rise, longitudinal ? 2 : 3);
    close(full.peakZ, longitudinal ? 7.5 : 8.5);
    close(full.minZ, 4.5);
    close(full.roofWidth, longitudinal ? 5.5 : 4.6);
    close(full.roofLength, longitudinal ? 6.6 : 7.5);
    close(contact.roofWidth, longitudinal ? 4 : 4.6);
    close(contact.roofLength, longitudinal ? 6.6 : 6);
    assert.deepEqual(full.slopes, contact.slopes);
    assert.deepEqual(full.intersectionBounds, [
      [-1, 0, 0, longitudinal ? full.x0 : base.x0()],
      [1, 0, 0, -(longitudinal ? full.x1 : base.x1())],
      [0, -1, 0, longitudinal ? base.y0() : full.y0],
      [0, 1, 0, -(longitudinal ? base.y1() : full.y1)],
    ]);
    for (const [index, polygon] of full.polygons.entries()) {
      const [a, b, c, d] = full.slopes[index];
      polygon.forEach(([x, y, z]) => close(a * x + b * y + c * z + d, 0));
    }
    const [limit] = FloorPlanWalls.roofLimits({ ...plan, allRoofs: [roof] });
    assert.deepEqual(limit, { peakZ: contact.peakZ, bounds: contact.bounds, slopes: contact.slopes });
    const metrics = FloorPlanExport.roofMetrics(plan, roof);
    for (const key of ["x0", "x1", "y0", "y1", "rise", "ridgeLength", "ridgeX0", "ridgeX1", "ridgeY0", "ridgeY1"]) {
      close(metrics[key], full[key]);
    }
    assert.deepEqual(roof, original);
  });
}

test("roof geometry and headroom run without loading a roof renderer", () => {
  assert.equal(globalThis.FloorPlanRoofs, undefined);
  const roof = definition("longitudinal");
  const surfaces = geometry.intersectingSurfaces(plan, [roof]);
  const result = FloorPlanHeadroom.calculate([{ x: -4, y: 2, w: 4, l: 6 }], surfaces, 3, [], [2.5]);
  close(result[0].area, 24);
  assert.ok(geometry.solidSurface(surfaces[0].polygons, 0.12).faces.length > 2);
});

test("render geometry and exports preserve their distinct inherited elevation policies", () => {
  const { z0, ...roof } = definition("longitudinal");
  close(geometry.gableGeometry(plan, roof).z0, 3);
  close(FloorPlanExport.roofMetrics(plan, roof).baseElevation, 3);
  const zeroBase = FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 4, l: 6 });
  const ground = { ...plan, references: new Map([["base", zeroBase]]),
    currentConfig: { ceiling_height: 2.5 } };
  close(geometry.gableGeometry(ground, roof).z0, 2.5);
  close(FloorPlanExport.roofMetrics(ground, roof).baseElevation, 0);
});

test("eave slope changes patches without changing wall-contact planes or nominal ridge", () => {
  const roof = definition("longitudinal");
  const flared = { ...roof, eaves: { ...roof.eaves, pitch: 0 } };
  const nominal = geometry.gableGeometry(plan, flared);
  const surfaces = geometry.intersectingSurfaces(plan, [flared]);
  close(nominal.peakZ, 7.5);
  surfaces[0].polygons.flat().forEach(([x, , z]) => {
    close(z, 5.5 + Math.min(Math.max(0, x + 4), Math.max(0, -x)));
  });
  assert.deepEqual(FloorPlanWalls.roofLimits({ ...plan, allRoofs: [roof] }),
    FloorPlanWalls.roofLimits({ ...plan, allRoofs: [flared] }));
});
