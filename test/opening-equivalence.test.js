require("./helpers/load-modules");
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/openings', 'config/coordinates', 'models/terrain',
  'models/geometry-box', 'models/geometry', 'models/geometry-domain', 'models/walls', 'config/parser',
  'models/model', 'models/validation', 'views/roofs', 'models/references', 'views/elements', 'exports/text', 'main']) require(`../src/${name}.js`);

function prepare(config) {
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items,
  });
  plan.prepareRoomReferences(model.config);
  const entries = [];
  for (const floor of model.floors) {
    plan.currentFloorHeight = Number(floor.z0 ?? 0);
    for (const entry of FloorPlanOpenings.forFloor(plan, floor)) {
      if (plan.isVerticalOpening(entry)) {
        const geometry = plan.normalizeGeometryAtFloor(entry, floor);
        entries.push({ type: 'vertical', from: entry.from, to: entry.to,
          x: geometry.x, y: geometry.y, w: geometry.w, l: geometry.l });
      } else {
        const geometry = plan.normalizeOpening(entry);
        entries.push(Object.fromEntries(['type', 'from', 'to', 'x', 'y', 'w', 'h', 'z0', 'wallId', 'position']
          .map(key => [key, geometry[key]])));
        assert.equal(FloorPlanParser.location(geometry)?.file, 'plan.json5');
      }
    }
  }
  assert.deepEqual(plan.errors, []);
  return { plan, entries: entries.map(entry => JSON.stringify(entry)).sort() };
}

function legacy(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(legacy);
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, legacy(child)]));
  if (['doors', 'windows', 'openings'].some(key => Array.isArray(value[key]))) {
    result.openings = FloorPlanOpenings.collect(value);
    delete result.doors;
    delete result.windows;
  }
  return FloorPlanParser.copyLocation(value, result);
}

test('migrated plans retain wall cuts and vertical geometry across every floor', () => {
  for (const file of ['cottage-ferraz-cesar.json5', 'examples/parametros-e-aberturas.json5', 'examples/portas-janelas-vaos.json5']) {
    const source = FloorPlanParser.parse(fs.readFileSync(file, 'utf8'), { filename: 'plan.json5' });
    const current = prepare(source);
    assert.deepEqual(current.entries, prepare(legacy(source)).entries, file);
    assert.equal(current.plan.model.warnings.filter(w => /^opening-/.test(w.code)).length, 0, file);
  }
});

test('rendered features retain categories and markdown separates doors, windows and voids', () => {
  const features = ['door', 'window', 'opening'].map((type, index) => ({
    id: `${type}-id`, type, floorId: 'ground', roomId: 'room', to: 'exterior', wall: 'top', position: index, w: 1, z0: 0, h: 2,
  }));
  const plan = { allOpenings: [features[0], features[2]], allWindows: [features[1]],
    markdownText: String, formatMeters: String };
  assert.deepEqual(FloorPlanOpenings.rendered(plan, { type: 'door' }), [features[0]]);
  assert.deepEqual(FloorPlanOpenings.rendered(plan, { floor: { id: 'upper' } }), []);
  const lines = [];
  FloorPlanTextExport.appendOpeningTables(plan, lines, FloorPlanOpenings.rendered(plan), '###');
  const text = lines.join('\n');
  for (const label of ['Portas', 'Janelas', 'Vãos']) assert.ok(text.includes(`### ${label}`));
  assert.ok(text.indexOf('door-id') < text.indexOf('### Janelas'));
  assert.ok(text.indexOf('window-id') > text.indexOf('### Janelas'));
  assert.ok(text.indexOf('opening-id') > text.indexOf('### Vãos'));
});
