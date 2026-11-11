const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
require("../src/models/terrain.js");
for (const name of ['config/catalog', 'config/coordinates', 'models/geometry-box', 'models/geometry', 'models/geometry-domain',
  'models/walls', 'config/parser', 'models/model', 'models/validation', 'views/roofs',
  'models/openings', 'models/references', 'views/elements', 'main']) require(`../src/${name}.js`);

function prepare(file, parameters = {}) {
  const input = FloorPlanParser.parse(fs.readFileSync(file, 'utf8'));
  if (input.parameters) Object.assign(input.parameters, parameters);
  const model = FloorPlanModel.fromConfig(input);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items,
    walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
}
const close = (a, b, label) => assert.ok(a === b || Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);

function assertEquivalent(original, converted) {
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
      assert.deepEqual(next.rooms[j].walls, room.walls, `${room.id} walls`);
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
        assert.equal(a.wallId, b.wallId);
      });
    });
    floor.items?.forEach((item, j) => {
      const a = original.normalizeGeometryAtFloor(original.resolveItemType(item), floor);
      const b = converted.normalizeGeometryAtFloor(next.items[j], next);
      for (const key of ['x', 'y', 'w', 'l', 'rotation']) close(a[key], b[key], `${item.id ?? j}.${key}`);
    });
    floor.openings?.forEach((opening, j) => {
      const a = original.normalizeGeometryAtFloor(opening, floor);
      const b = converted.normalizeGeometryAtFloor(next.openings[j], next);
      for (const key of ['x', 'y', 'w', 'l']) close(a[key], b[key], `floor opening ${key}`);
    });
  });
  original.currentConfig.roofs.forEach((r, i) => {
    assert.deepEqual(converted.currentConfig.roofs[i].eaves, r.eaves);
    assert.deepEqual(converted.currentConfig.roofs[i].rake, r.rake);
  });
  const points = (plan, wall) => {
    let origin;
    return (wall.path?.points ?? [wall.from, wall.to]).map(point => {
      const values = point.map(value => plan.resolve(value, origin));
      origin = { x0: values[0], y0: values[1] };
      return values;
    });
  };
  original.currentConfig.walls.forEach((wall, i) => {
    const a = points(original, wall), b = points(converted, converted.currentConfig.walls[i]);
    assert.equal(a.length, b.length);
    a.forEach((point, j) => point.forEach((value, k) => close(value, b[j][k], `${wall.id} point ${j}`)));
  });
}

test('Cartesian snapshot preserves local geometry, openings, stairs and roofs when loaded', () => {
  assertEquivalent(prepare('cottage-ferraz-cesar.json5'), prepare('cottage-ferraz-cesar-cartesiana.json'));
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


test('Parametric Cartesian file preserves the house and responds to parameter changes', () => {
  const file = 'cottage-ferraz-cesar-cartesiana-parametrica.json5';
  const source = FloorPlanParser.parse(fs.readFileSync('cottage-ferraz-cesar.json5', 'utf8'));
  const input = FloorPlanParser.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(input.parameters, source.parameters);
  const saved = structuredClone(input);
  FloorPlanModel.fromConfig(input);
  assert.deepEqual(input, saved);
  assert.equal(input.coordinate_system, 'cartesian');
  assert.equal(input.floors[0].items.find(item => item.id === 'master-bed').pos[0], 'master.xc - 0.8');
  assert.ok(input.floors[0].items.some(item => item.pos?.some(value => String(value).includes('params.wall_thickness'))));
  for (const parameters of [{}, { wall_thickness: 0.16, ground_height: 3.2, knee_setback: 0.9 },
    { headroom_2m_inset: 0.9, headroom_3m_inset: 1.8, office_headroom_2m_inset: 0.9, office_headroom_3m_inset: 1.8 }]) {
    assertEquivalent(prepare('cottage-ferraz-cesar.json5', parameters), prepare(file, parameters));
  }
});

test('Symbolic reflection preserves local origins, asymmetric insets and roof defaults', () => {
  const config = {
    config: { roofs: { eaves: { left: 'params.a', right: 'params.b', pitch: 30 }, rake: [0.1, 0.4] } },
    zones: [{ id: 'box', rectangle: [2, 1, 'x0 + 4', 'y0 + 6'] },
      { id: 'inside', inset: ['box', 'params.a', 0, 'params.b', 0] }],
    roofs: [{ id: 'a', base: 'box', orientation: 'longitudinal' },
      { id: 'b', base: 'box', orientation: 'transverse' }],
  };
  const result = FloorPlanCoordinates.reflectX(config);
  assert.deepEqual(result.zones[0].rectangle, [-6, 1, -2, 'y0 + 6']);
  assert.deepEqual(result.zones[1].inset, ['box', 'params.b', 0, 'params.a', 0]);
  assert.deepEqual(result.roofs[0].eaves, { left: 'params.b', right: 'params.a', pitch: 30 });
  assert.deepEqual(result.roofs[1].eaves, { left: 'params.a', right: 'params.b', pitch: 30 });
  assert.deepEqual(result.roofs[1].rake, [0.4, 0.1]);
  const roundtrip = FloorPlanCoordinates.reflectX(result);
  assert.deepEqual(roundtrip.zones, config.zones.map((zone, i) => i ? zone : { ...zone, rectangle: [2, 1, 6, 'y0 + 6'] }));
  assert.deepEqual(roundtrip.roofs[0].eaves, config.config.roofs.eaves);
});
