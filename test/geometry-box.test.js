const { test } = require("node:test");
const assert = require("node:assert/strict");

require("./helpers/load-modules");

const { FloorPlanGeometryBox } = globalThis;

test("nominal envelope spans separated parts and elevations without filling their occupied area", () => {
  const parts = [
    { x: -3, y: 2, w: 1, l: 2, z0: -1, z1: 0, h: 1, rotation: 45 },
    { x: 2, y: 5, w: 2, l: 1, z0: 3, z1: 3, h: 0 },
  ];
  const original = structuredClone(parts);
  assert.deepEqual(FloorPlanGeometryBox.envelope(parts), {
    x: -3, y: 2, w: 7, l: 4, z0: -1, z1: 3, h: 4,
  });
  assert.deepEqual(parts, original);
  assert.throws(() => FloorPlanGeometryBox.envelope([]), /pelo menos uma parte/);
});

test("geometry reference resolves lazily and retains compound exactness restrictions", () => {
  let geometry;
  const reference = FloorPlanGeometryBox.fromGeometry(() => geometry, { compound: true, label: "parts" });
  geometry = { x: 1, y: 2, w: 3, l: 4, z0: 5, z1: 7, h: 2 };
  assert.deepEqual([reference.xc(), reference.yc(), reference.zc(), reference.area()], [2.5, 4, 6, 12]);
  geometry = { ...geometry, z1: 9, h: 4 };
  assert.equal(reference.bounds().h(), 4);
  assert.throws(() => reference.geometry(), /compound object/);
});

test("fromValues builds a box with the full accessor contract", () => {
  const box = FloorPlanGeometryBox.fromValues({
    x: 1,
    y: 2,
    w: 3,
    l: 4,
    z0: 5,
    h: 2,
  });

  assert.equal(box.x0(), 1);
  assert.equal(box.x1(), 4);
  assert.equal(box.xc(), 2.5);
  assert.equal(box.y0(), 2);
  assert.equal(box.y1(), 6);
  assert.equal(box.yc(), 4);
  assert.equal(box.z0(), 5);
  assert.equal(box.z1(), 7);
  assert.equal(box.zc(), 6);
  assert.equal(box.w(), 3);
  assert.equal(box.l(), 4);
  assert.equal(box.h(), 2);
  assert.equal(box.area(), 12);
});

test("fromValues defaults z0 and h to zero", () => {
  const box = FloorPlanGeometryBox.fromValues({ x: 0, y: 0, w: 2, l: 2 });
  assert.equal(box.z0(), 0);
  assert.equal(box.z1(), 0);
  assert.equal(box.h(), 0);
});

test("bounds and geometry return the box itself", () => {
  const box = FloorPlanGeometryBox.fromValues({
    x: 1,
    y: 1,
    w: 2,
    l: 2,
  });
  assert.equal(box.bounds(), box);
  assert.equal(box.geometry(), box);
});

test("attach adds accessors to a plain object with x/y/w/l", () => {
  const target = { x: 2, y: 3, w: 4, l: 5 };
  FloorPlanGeometryBox.attach(target, { label: "item" });

  assert.equal(target.x0(), 2);
  assert.equal(target.x1(), 6);
  assert.equal(target.y0(), 3);
  assert.equal(target.y1(), 8);
  assert.equal(target.bounds().x0(), 2);
  assert.equal(target.bounds().y0(), 3);
  assert.equal(target.bounds().w(), 4);
  assert.equal(target.bounds().l(), 5);
  assert.equal(target.bounds().z0(), 0);
  assert.equal(target.bounds().z1(), 0);
  assert.equal(target.bounds().h(), 0);
  assert.equal(target.geometry().area(), 20);
});

test("attach does not overwrite pre-existing accessor functions", () => {
  const existingX1 = () => 99;
  const target = {
    x: 2,
    y: 3,
    w: 4,
    l: 5,
    x1: existingX1,
  };
  FloorPlanGeometryBox.attach(target, { label: "room" });

  assert.equal(target.x0(), 2);
  assert.equal(target.x1, existingX1);
  assert.equal(target.x1(), 99);
});

test("attach falls back to zero for missing bounds values", () => {
  const target = { x0: () => 1, y0: () => 1 };
  FloorPlanGeometryBox.attach(target, { label: "partial" });

  const bounds = target.bounds();
  assert.equal(bounds.x0(), 1);
  assert.equal(bounds.y0(), 1);
  assert.equal(bounds.x1(), 1);
  assert.equal(bounds.y1(), 1);
  assert.equal(bounds.w(), 0);
  assert.equal(bounds.l(), 0);
  assert.equal(bounds.z0(), 0);
  assert.equal(bounds.z1(), 0);
  assert.equal(bounds.h(), 0);
});

test("compound attachment keeps bounds but rejects geometry", () => {
  const target = { x: 1, y: 1, w: 2, l: 2 };
  FloorPlanGeometryBox.attach(target, {
    compound: true,
    label: "compound-room",
  });

  assert.equal(target.bounds().w(), 2);
  assert.equal(target.bounds().l(), 2);
  assert.throws(() => target.geometry(), {
    message:
      'Rectangular-prism geometry does not apply to compound object "compound-room"; use bounds() or geometryParts',
  });
});

test("non-compound objects get a working geometry()", () => {
  const target = { x: 1, y: 1, w: 2, l: 3 };
  FloorPlanGeometryBox.attach(target, { label: "plain" });

  assert.equal(target.geometry().area(), 6);
});
