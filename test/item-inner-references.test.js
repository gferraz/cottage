const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
for (const name of ['models/terrain', 'config/catalog', 'config/coordinates', 'models/geometry-box',
  'models/geometry', 'models/geometry-domain', 'models/walls', 'config/parser', 'models/model',
  'models/validation', 'views/roofs', 'models/openings', 'models/references', 'views/elements', 'main']) {
  require(`../src/${name}.js`);
}

function prepare(config) {
  const model = FloorPlanModel.fromConfig(config);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items,
    walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const fixture = () => ({
  floors: [{ id: 'ground', z0: 0, ceiling_height: 3, rooms: [
    { id: 'room', pos: [0, 0], size: [5, 4], walls: ['left', 'top'] },
    { id: 'neighbour', pos: [5, 0], size: [2, 4], walls: ['left'] },
    { id: 'dependent', pos: ['room.x1', 8], size: [1, 1], walls: [] },
  ], items: [] }],
  zones: [{ id: 'zone', rectangle: ['room.x0', 'room.y0', 'room.x1', 'room.y1'] }],
  guides: [{ id: 'guide', pos: ['room.x0', 'room.y0'], l: 'room.l' }],
});
const item = (plan, definition) => plan.normalizeGeometry(plan.resolveItemType(definition));

test('only item formulas use inner edges, dimensions and centers; shared solid walls count once', () => {
  const plan = prepare(fixture());
  const g = item(plan, { pos: ['room.x0', 'room.y0'], size: ['room.w', 'room.l'] });
  close(g.x, 0.06); close(g.y, 0.06); close(g.w, 4.88); close(g.l, 3.94);
  const centered = item(plan, { pos: ['room.xc', 'room.yc'], size: [1, 1] });
  close(centered.x, 2.5); close(centered.y, 2.03);
  close(plan.resolve('room.x0'), 0);
  close(plan.resolve('room.w'), 5);
  close(plan.getRoomGeometry('dependent').x0(), 5);
  close(plan.normalizeGeometry({ pos: ['room.x0', 'room.y0'], size: [1, 1] }).x, 0);
});

test('guides, zones and roof references retain their original geometry, including nested room formulas', () => {
  const plan = prepare(fixture());
  plan.references.set('roof', { x0: () => 8, y0: () => 9 });
  for (const id of ['guide', 'zone']) {
    const g = item(plan, { pos: [`${id}.x0`, `${id}.y0`], size: [1, 1] });
    close(g.x, 0); close(g.y, 0);
  }
  const roof = item(plan, { pos: ['roof.x0', 'roof.y0'], size: [1, 1] });
  close(roof.x, 8); close(roof.y, 9);
});

test('independent walls use their own thickness, scope and height; virtual walls do not inset', () => {
  const config = fixture();
  config.floors[0].rooms[0].walls = { left: 'virtual' };
  config.walls = [{ id: 'bottom-wall', scope: 'ground', from: [0, 4], to: [5, 4],
    base: { level: 0 }, top: { level: 3 }, thickness: 0.3 }];
  config.floors.push({ id: 'upper', z0: 3, ceiling_height: 3, rooms: [
    { id: 'upstairs', pos: [0, 0], size: [5, 4], walls: [] },
  ] });
  const plan = prepare(config);
  const g = item(plan, { rectangle: ['room.x0', 'room.y0', 'room.x1', 'room.y1'] });
  close(g.x, 0); close(g.y, 0); close(g.w, 4.94); close(g.l, 3.85);
  const upper = item(plan, { pos: ['upstairs.x0', 'upstairs.y1'], size: [1, 1] });
  close(upper.x, 0); close(upper.y, 4);
});

test('copy, inset and outset use the same inner room geometry as coordinate formulas', () => {
  const plan = prepare(fixture());
  const copied = item(plan, { copy: 'room' });
  close(copied.x, 0.06); close(copied.w, 4.88);
  const inset = item(plan, { inset: ['room', 0.4, 0.2] });
  close(inset.x, 0.46); close(inset.y, 0.26); close(inset.w, 4.08);
  const outset = item(plan, { outset: ['room', 0.1, 0.1] });
  close(outset.x, -0.04); close(outset.y, -0.04);
});

test('lazy forward item references keep item semantics without shrinking a referenced item again', () => {
  const config = fixture();
  config.floors[0].items = [
    { id: 'first', pos: ['second.x1', 'zone.y0'], size: [1, 1] },
    { id: 'second', pos: ['room.x0', 'room.y0'], size: [1, 1] },
  ];
  const plan = prepare(config);
  const g = item(plan, plan.currentConfig.floors[0].items[0]);
  close(g.x, 1.06); close(g.y, 0);
  assert.throws(() => item(plan, { pos: ['missing.x0', 0], size: [1, 1] }), /Unknown/);
  close(plan.resolve('room.x0'), 0);
  assert.equal(plan.itemReferenceContext, undefined);
});

test('current Cartesian cottage keeps all five headboards at the configured inner clearance', () => {
  const config = FloorPlanParser.parse(fs.readFileSync('cottage-ferraz-cesar.json5', 'utf8'));
  config.parameters.bed_knee_wall_clearance = 0.4;
  const plan = prepare(config);
  const floor = plan.currentConfig.floors.find((f) => f.id === 'upper');
  const beds = floor.items.filter((i) => i.id?.startsWith('bed-'));
  assert.equal(beds.length, 5);
  for (const bed of beds) {
    const g = plan.normalizeGeometryAtFloor(plan.resolveItemType(bed), floor);
    const roomId = `bedroom-${bed.id.includes('east') ? 'east' : bed.id.includes('north') ? 'north' : 'west'}`;
    const bounds = FloorPlanWalls.itemRoomBounds(plan, roomId);
    const x = g.x + (g.w - g.l) / 2;
    close(Math.min(x - bounds.x0(), bounds.x1() - x - g.l), 0.4);
  }
});


test('accessory dimension formulas also use inner references and preserve the outer context', () => {
  const plan = prepare(fixture());
  const bed = plan.resolveItemType({ type: 'twin-bed', pos: [0, 0], nightstand: { w: 'room.w / 10' } });
  close(bed.nightstand.w, 0.488);
  assert.equal(plan.itemReferenceContext, undefined);
});

test('independent wall heights may depend on an item without recursing through inner bounds', () => {
  const config = fixture();
  config.floors[0].items = [{ id: 'cabinet', pos: ['room.x0', 'room.y0'], size: [1, 1, 2] }];
  config.walls = [{ id: 'low-wall', from: [0, 4], to: [5, 4], thickness: 0.2,
    base: { level: 0 }, top: { level: 'cabinet.z1' } }];
  const plan = prepare(config);
  close(plan.resolve('cabinet.z1'), 2);
  close(item(plan, { pos: ['room.x0', 'room.y1'], size: [1, 1] }).y, 3.9);
});
