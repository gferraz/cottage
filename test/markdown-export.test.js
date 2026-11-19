const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/load-modules");
require("../src/models/model.js");
require("../src/models/metrics.js");
require("../src/models/openings.js");
require("../src/exports/text.js");

test("Markdown includes current project and headroom data in presentation floor order", () => {
  const upper = { id: "upper", label: "Superior", storey: "upper", z0: 3, rooms: [] };
  const ground = { id: "ground", label: "Térreo", storey: "ground", z0: 0, rooms: [] };
  const reference = { area: () => 12, x0: () => 0, y0: () => 0, w: () => 3, l: () => 4 };
  const rear = { id: "rear", label: "Fundos", storey: "ground", z0: 0.5, rooms: [] };
  const asciiFilters = [];
  const loads = [];
  const plan = {
    currentConfig: { title: "Casa", description: "Projeto atual", style: "Campo" },
    model: { floors: [upper, ground, rear] }, currentFloorId: "upper", multiFloorMode: true,
    allRooms: [{ id: "room", label: "Sala", floorId: "ground", reference }],
    roomElements: [], roomDefinitions: new Map(), roomReferences: new Map(),
    allRoofs: [], allStairs: [], independentWalls: new Map(), communicationResults: [],
    netRoomAreas: new Map([["room", 10]]),
    headroomResults: new Map([["room", { heightRange: { min: 1.5, max: 3 }, areas: [{ height: 2.1, area: 8 }] }]]),
    terrainArea: 100, errors: [], warnings: [{ message: "Campo antigo", path: "rooms[0]" }],
    load(config) { loads.push(config.activeFloor); }, renderMultiFloorUnderlay() {},
    formatMeters: (value) => String(value),
    markdownText: (value) => FloorPlanTextExport.markdownText(null, value),
  };
  const originalRendered = FloorPlanOpenings.rendered;
  const originalAscii = FloorPlanTextExport.asciiLayout;
  const originalExport = globalThis.FloorPlanExport;
  let output;
  try {
    FloorPlanOpenings.rendered = () => [];
    FloorPlanTextExport.asciiLayout = (_plan, options) => {
      asciiFilters.push(options.floorIds);
      return "planta";
    };
    globalThis.FloorPlanExport = { downloadText: (text) => { output = text; } };
    FloorPlanTextExport.downloadMarkdown(plan);
    assert.match(output, /Projeto atual/);
    assert.match(output, /Área usada:\*\* 10 m²/);
    assert.match(output, /Altura mín\. → máx\. \(m\)/);
    assert.match(output, /\| 12 \| 10 \| 1.5 → 3 \| 8 \|/);
    assert.match(output, /Avisos de depreciação/);
    assert.ok(output.indexOf("## 05.1 — Térreo") < output.indexOf("## 05.3 — Superior"));
    assert.deepEqual(asciiFilters, [["ground", "rear"], ["upper"]]);
    assert.deepEqual(loads, []);
    assert.equal(plan.multiFloorMode, true);
  } finally {
    FloorPlanOpenings.rendered = originalRendered;
    FloorPlanTextExport.asciiLayout = originalAscii;
    globalThis.FloorPlanExport = originalExport;
  }
});


test("ASCII combines split levels of one storey and excludes other storeys", () => {
  const room = (id, floorId, x) => ({ id, floorId, reference: {
    dataset: { id, label: id },
    x0: () => x, x1: () => x + 4, y0: () => 0, y1: () => 3,
    wallState: () => "solid",
  } });
  const plan = {
    currentConfig: { floors: [{ id: "front" }, { id: "rear" }, { id: "upper" }] },
    currentFloorId: "upper",
    allRooms: [room("FRENTE", "front", 0), room("FUNDOS", "rear", 4), room("SUPERIOR", "upper", 100)],
    allOpenings: [], allWindows: [], openings: [], windows: [],
    independentWalls: new Map(),
  };
  const output = FloorPlanTextExport.asciiLayout(plan, { floorIds: ["front", "rear"] });
  // ASCII uses two character columns per cell.
  assert.match(output, /F R E N T E/);
  assert.match(output, /F U N D O S/);
  assert.doesNotMatch(output, /S U P E R I O R/);
  assert.ok(Math.max(...output.split("\n").map((line) => line.length)) < 70);
  assert.equal(FloorPlanTextExport.asciiLayout(plan, { floorIds: ["empty"] }), "(nenhum cômodo carregado)");
});
