#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const [, , input = "cottage-ferraz-cesar.json", output = "cottage-ferraz-cesar.dxf"] = process.argv;
const root = path.resolve(__dirname, "..");
const source = ["floor-plan-model.js", "floor-plan-validation.js", "floor-plan.js", "floor-plan-export.js"]
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");
const context = { console, window: {}, document: {}, Blob: class {}, URL: {} };
vm.createContext(context);
vm.runInContext(`${source}\nthis.__DXF = { FloorPlan, FloorPlanModel, FloorPlanValidation, FloorPlanExport };`, context);

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), input), "utf8"));
const { FloorPlan, FloorPlanModel, FloorPlanExport } = context.__DXF;
const plan = Object.create(FloorPlan.prototype);
Object.assign(plan, {
  config,
  model: FloorPlanModel.fromConfig(config),
  currentConfig: config,
  currentFloorHeight: 0,
  references: new Map(),
  rooms: new Map(),
  roomDefinitions: new Map(),
  roomGeometryCache: new Map(),
  roomGeometryStack: new Set(),
  partReferenceStack: [],
  errors: [],
  invalidRoomIds: new Set()
});
plan.prepareRoomReferences(config);
const dxf = FloorPlanExport.toDxf(plan);
const outputPath = path.resolve(process.cwd(), output);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, dxf, "utf8");
console.log(`Generated ${outputPath}`);
console.log(`DXF entities: ${(dxf.match(/^0\n/gm) || []).length - 3}`);
