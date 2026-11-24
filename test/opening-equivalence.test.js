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

test('independent windows preserve identity and geometry when moved out of rooms', (t) => {
  t.mock.method(FloorPlanWalls, 'resolveRoomSide', () => ({ id: 'parede-sala' }));
  const room = { id: 'sala', pos: [0, 0], size: [6, 4], walls: ['top', 'right', 'bottom', 'left'] };
  const window = { id: 'janela-sala', from: 'sala.top', w: 1.5, dx: 2 };
  const source = value => FloorPlanParser.parse(JSON.stringify({ z0: 0, ceiling_height: 3, ...value }), { filename: 'plan.json5' });
  const independent = prepare(source({ rooms: [room], windows: [window] }));
  const local = prepare(source({ rooms: [{ ...room, windows: [{ ...window, from: 'top' }] }] }));
  assert.deepEqual(independent.entries, local.entries);
  const normalized = independent.plan.normalizeOpening({ ...window, type: 'window' });
  assert.equal(normalized.id, 'janela-sala');
  assert.equal(normalized.element.type, 'window');
  independent.plan.currentFloorHeight = 3;
  const relative = independent.plan.normalizeOpening({ ...window, type: 'window',
    dx: 'sala.w / 2 - 1', dz: '0.5 + 0.4', z0: 9 });
  assert.deepEqual([relative.x, relative.y, relative.z0, relative.position], [2, 0, 3.9, 2]);
  const vertical = independent.plan.normalizeOpening({ ...window, from: 'sala.left', type: 'window', dx: 1, dy: 0, dz: 0 });
  assert.deepEqual([vertical.x, vertical.y, vertical.z0], [0, 1, 3]);
  assert.throws(() => independent.plan.normalizeOpening({ ...window, type: 'window', dx: 6 }), /outside wall/);
  assert.throws(() => independent.plan.normalizeOpening({ ...window, type: 'window', dz: NaN }), /z0 must be finite/);

  assert.equal(independent.plan.normalizeOpening({ from: 'sala.top', type: 'window' }).id, 'sala-exterior-0');
});

test('transom true derives a fixed window from the resolved door on every floor', () => {
  const { plan } = prepare(FloorPlanParser.parse(JSON.stringify({ floors: [
    { id: 'ground', z0: 0, ceiling_height: 3, rooms: [
      { id: 'room', pos: [0, 0], size: [4, 4], walls: 'solid', doors: [
        { id: 'entry', wall: 'front', w: 0.8, h: 2.1, dx: 0.3, transom: true },
        { id: 'plain', wall: 'left', transom: false },
      ] },
    ] },
    { id: 'upper', z0: 3, ceiling_height: 3, rooms: [
      { id: 'bedroom', pos: [0, 0], size: [4, 4], walls: 'solid', doors: [
        { id: 'upper-entry', wall: 'right', w: 1.2, h: 2, transom: true },
      ] },
    ] },
  ] }), { filename: 'plan.json5' }));
  FloorPlanReferences.prepareGlobalLists(plan, plan.currentConfig);
  for (const id of ['entry', 'upper-entry']) {
    const door = plan.allOpenings.find(d => d.id === id);
    const transom = plan.allWindows.find(w => w.parentDoorId === id);
    assert.ok(transom);
    for (const key of ['x', 'y', 'w', 'wallId', 'floorId', 'position']) assert.equal(transom[key], door[key]);
    assert.equal(transom.z0, door.z1);
    assert.equal(transom.h, door.w / 2);
    assert.equal(transom.windowType, 'fixed');
    assert.deepEqual(transom.glazing, { columns: 1, rows: 1 });
    assert.equal(door.h, id === 'entry' ? 2.1 : 2);
  }
  assert.equal(plan.allWindows.length, 2);
  assert.throws(() => plan.normalizeOpening({ type: 'door', from: 'room.top', transom: {} }), /transom/);
});
