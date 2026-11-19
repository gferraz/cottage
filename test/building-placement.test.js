require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
for (const name of ['config/catalog', 'config/coordinates', 'config/parser', 'models/terrain',
  'models/geometry', 'models/geometry-domain', 'models/model', 'models/validation', 'models/metrics',
  'models/walls', 'views/roofs', 'models/openings', 'models/references', 'main']) require(`../src/${name}.js`);
const prepare = (config) => {
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
};
test('cottage placement remains tied to the full house footprint across split floors and exterior stair changes', () => {
  const config = FloorPlanParser.parse(fs.readFileSync(path.resolve(__dirname, '../cottage-ferraz-cesar-2-level-floors.json5'), 'utf8'));
  const bounds = FloorPlanMetrics.buildingReferenceBounds(prepare(config));
  assert.equal(bounds.x0, 0);
  assert.equal(bounds.y0, 0);
  assert.equal(bounds.x1, 14);
  assert.ok(Math.abs(bounds.y1 - 18.2) < 1e-8);
  const changed = structuredClone(config);
  changed.floors.reverse();
  const stair = changed.floors.flatMap(floor => floor.stairs ?? []).find(stair => stair.id === 'front-stairs');
  stair.from = [-30, -10, -.6];
  stair.to = [-20, 0, 0];
  assert.deepEqual(FloorPlanMetrics.buildingReferenceBounds(prepare(changed)), bounds);
  assert.deepEqual(config.building.position, { x: 4, y: 3 });
});
test('unknown explicit placement references fail clearly', () => {
  assert.throws(() => FloorPlanMetrics.buildingReferenceBounds({ model: { config: { building: { reference: 'missing' } } }, references: new Map() }), /Unknown building placement reference: missing/);
});
