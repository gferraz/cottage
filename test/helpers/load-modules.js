const path = require("node:path");

// The source files are Classic browser scripts: they define globals via
// `window.FloorPlan* = ...` and reference each other as bare identifiers.
// In non-strict CommonJS a bare identifier resolves through `globalThis`,
// so aliasing `window` to the Node global object lets the files load
// unchanged in tests. No DOM modules are loaded here.
globalThis.window = globalThis;

const src = (module) =>
  require(path.resolve(__dirname, "../../src", `${module}.js`));

// Keep this list in the same relative order as floor-plan.html.
src("floor-plan-geometry-box");