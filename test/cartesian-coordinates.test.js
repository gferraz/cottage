const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/geometry-box', 'models/geometry', 'models/geometry-domain',
  'models/walls', 'config/parser', 'models/model', 'models/validation', 'views/roofs',
  'models/openings', 'models/references', 'views/elements', 'main']) require(`../src/${name}.js`);

function prepare(file) {
  const model = FloorPlanModel.fromConfig(FloorPlanParser.parse(fs.readFileSync(file, 'utf8')));
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items,
    walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
}
const close = (a, b, label) => assert.ok(a === b || Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);

test('Cartesian snapshot preserves local geometry, openings, stairs and roofs when loaded', () => {
  const original = prepare('cottage-ferraz-cesar.json5');
  const converted = prepare('cottage-ferraz-cesar-cartesiana.json');
  assert.deepEqual(converted.errors.map(e => e.message), original.errors.map(e => e.message));
  assert.deepEqual(converted.currentConfig.terrain, original.currentConfig.terrain);
  assert.deepEqual(converted.currentConfig.building, original.currentConfig.building);
  assert.deepEqual(converted.model.viewport, original.model.viewport);
  for (const [id, ref] of original.references) {
    const other = converted.references.get(id);
    assert.ok(other, id);
    if (original.invalidRoomIds.has(id)) continue;
    for (const axis of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1']) {
      if (typeof ref[axis] === 'function' && typeof other[axis] === 'function') close(ref[axis](), other[axis](), `${id}.${axis}`);
    }
  }
  original.currentConfig.floors.forEach((floor, i) => {
    original.currentFloorHeight = converted.currentFloorHeight = floor.z0;
    const next = converted.currentConfig.floors[i];
    floor.rooms.forEach((room, j) => {
      if (room.parts) room.parts.forEach((part, k) => {
        const a = original.normalizeGeometryAtFloor(part, floor);
        const b = converted.normalizeGeometryAtFloor(next.rooms[j].parts[k], next);
        for (const key of ['stairAxis', 'stairDirection', 'stairRise']) assert.equal(b[key], a[key]);
      });
      room.openings?.forEach((o, k) => {
        const a = original.normalizeOpening({ ...o, from: `${room.id}.${o.from}` });
        const migrated = next.rooms[j].openings[k];
        const b = converted.normalizeOpening({ ...migrated, from: `${room.id}.${migrated.from}` });
        for (const key of ['x', 'y', 'z0', 'w', 'h']) close(a[key], b[key], `${room.id} opening ${k} ${key}`);
        assert.equal(a.wall, b.wall);
      });
    });
    floor.items?.forEach((item, j) => {
      const a = original.normalizeGeometryAtFloor(original.resolveItemType(item), floor);
      const b = converted.normalizeGeometryAtFloor(next.items[j], next);
      for (const key of ['x', 'y', 'w', 'l', 'rotation']) close(a[key], b[key], `${item.id ?? j}.${key}`);
    });
  });
  original.currentConfig.roofs.forEach((r, i) => {
    assert.deepEqual(converted.currentConfig.roofs[i].eaves, r.eaves);
    assert.deepEqual(converted.currentConfig.roofs[i].rake, r.rake);
  });
});

test('Cartesian input is independent and has increasing X from house left to right', () => {
  const input = JSON.parse(fs.readFileSync('cottage-ferraz-cesar-cartesiana.json', 'utf8'));
  const saved = structuredClone(input);
  FloorPlanModel.fromConfig(input);
  assert.deepEqual(input, saved);
  const left = input.zones.find(z => z.id === 'house-left');
  const right = input.zones.find(z => z.id === 'house-right');
  assert.ok(left.pos[0] < right.pos[0]);
  assert.equal(input.coordinate_system, 'cartesian');
});
