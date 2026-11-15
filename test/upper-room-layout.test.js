const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
require("../src/models/terrain.js");
for (const name of ['config/catalog', 'config/coordinates', 'models/geometry-box', 'models/geometry', 'models/geometry-domain',
  'models/walls', 'config/parser', 'models/model', 'models/validation', 'views/roofs',
  'models/openings', 'models/references', 'views/elements', 'main']) require(`../src/${name}.js`);

function prepare(file = 'archive/cottage-ferraz-cesar-front-gables.json5') {
  const model = FloorPlanModel.fromConfig(FloorPlanParser.parse(fs.readFileSync(file, 'utf8')));
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

test('removed upper rooms leave no furniture or unresolved references', () => {
  const plan = prepare('cottage-ferraz-cesar.json5');
  const upper = plan.currentConfig.floors.find((floor) => floor.id === 'upper');
  assert.equal(plan.rooms.has('bedroom-west'), false);
  assert.equal(plan.rooms.has('bathroom'), false);
  assert.equal(upper.items.some((item) => /^(bed|wardrobe)-west-/.test(item.id)), false);
  assert.deepEqual(plan.errors, []);
});

test('current stair arrival occupies the strip beside the stair opening', () => {
  const plan = prepare('cottage-ferraz-cesar.json5');
  const upper = plan.currentConfig.floors.find((floor) => floor.id === 'upper');
  const arrival = plan.rooms.get('stair-arrival');
  const opening = plan.normalizeGeometryAtFloor(upper.openings[0], upper);
  assert.deepEqual(plan.errors.filter((error) => error.id === 'stair-arrival'), []);
  assert.ok(Math.abs(arrival.w() - 1.2) < 1e-9);
  assert.ok(arrival.l() > 0);
  assert.ok(Math.abs(arrival.x1() - opening.x) < 1e-9);
});

test('current unused room window resolves to the exterior right wall', () => {
  const plan = prepare('cottage-ferraz-cesar.json5');
  const definition = FloorPlanOpenings.collect(plan.roomDefinitions.get('unused-right'))[0];
  const opening = plan.normalizeOpening({ ...definition, from: `unused-right.${definition.from}` });
  assert.equal(opening.wallId, 'upper-right-wall');
  assert.equal(opening.to, 'exterior');
});
