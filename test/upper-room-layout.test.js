const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/geometry-box', 'models/geometry', 'models/geometry-domain',
  'models/walls', 'config/parser', 'models/model', 'models/validation', 'views/roofs',
  'models/openings', 'models/references', 'views/elements', 'main']) require(`../src/${name}.js`);

function prepare() {
  const model = FloorPlanModel.fromConfig(FloorPlanParser.parse(fs.readFileSync('archive/cottage-ferraz-cesar-front-gables.json5', 'utf8')));
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  plan.rooms = new Map([...plan.roomDefinitions.keys()].map((id) => [id, plan.getRoomGeometry(id)]));
  plan.currentFloorHeight = 3;
  return plan;
}

test('west bedroom and bathroom rear windows resolve to an exterior wall below the roof', () => {
  const plan = prepare();
  const roofs = FloorPlanWalls.roofLimits(plan, plan.currentConfig);
  for (const id of ['bedroom-west', 'bathroom']) {
    const definition = plan.roomDefinitions.get(id).openings.find((opening) => opening.type === 'window');
    assert.ok(definition);
    const opening = plan.normalizeOpening({ ...definition, from: `${id}.${definition.from}` });
    assert.equal(FloorPlanWalls.resolveRoomSide(plan, id, definition.from, opening).id, 'upper-rear-wall');
    for (let i = 0; i <= 100; i++) {
      const x = opening.x + opening.w * i / 100, y = opening.y;
      const covering = roofs.filter((roof) => roof.bounds.every(([a, b, , d]) => a * x + b * y + d <= 1e-8));
      const height = Math.max(...covering.map((roof) => Math.min(...roof.slopes.map(([a, b, c, d]) => -(a * x + b * y + d) / c))));
      assert.ok(opening.z0 + opening.h < height, `${id}: window intersects roof`);
    }
  }
});

test('west bedroom furniture fits after rotation, with no overlapping footprints', () => {
  const plan = prepare();
  const upper = plan.currentConfig.floors.find((floor) => floor.id === 'upper');
  const room = plan.rooms.get('bedroom-west');
  const boxes = upper.items.filter((item) => /^(bed|wardrobe)-west-/.test(item.id)).map((item) => {
    const g = plan.normalizeGeometryAtFloor(plan.resolveItemType(item), upper);
    const sideways = g.rotation === 90 || g.rotation === 270;
    const w = sideways ? g.l : g.w, l = sideways ? g.w : g.l;
    return { id: item.id, x: g.x + (g.w - w) / 2, y: g.y + (g.l - l) / 2, w, l };
  });
  assert.equal(boxes.length, 4);
  for (const box of boxes) {
    assert.ok(box.x >= room.x0() && box.x + box.w <= room.x1());
    assert.ok(box.y >= room.y0() && box.y + box.l <= room.y1());
    for (const other of boxes) {
      if (box === other) continue;
      assert.ok(box.x + box.w <= other.x || other.x + other.w <= box.x ||
        box.y + box.l <= other.y || other.y + other.l <= box.y, `${box.id} overlaps ${other.id}`);
    }
  }
});
