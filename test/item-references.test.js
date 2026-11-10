const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/geometry-box', 'models/geometry', 'models/geometry-domain',
  'models/walls', 'config/parser', 'models/model', 'models/validation', 'views/roofs',
  'models/openings', 'models/references', 'views/elements', 'main']) require(`../src/${name}.js`);

function prepare() {
  const model = FloorPlanModel.fromConfig(FloorPlanParser.parse(fs.readFileSync('cottage-ferraz-cesar.json5', 'utf8')));
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: FloorPlanCatalog, itemTypes: FloorPlanCatalog.items, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  plan.rooms = new Map([...plan.roomDefinitions.keys()].map((id) => [id, plan.getRoomGeometry(id)]));
  plan.currentFloorHeight = 3;
  return plan;
}


test('item references resolve before rendering either floor', () => {
  const plan = prepare();
  for (const floor of plan.currentConfig.floors) {
    for (const item of floor.items ?? []) {
      const geometry = plan.normalizeGeometryAtFloor(plan.resolveItemType(item), floor);
      assert.ok(Number.isFinite(geometry.x));
      assert.ok(Number.isFinite(geometry.y));
    }
  }
});

test('vestibule door fits the shared living wall', () => {
  const plan = prepare();
  const room = plan.roomDefinitions.get('vestibule');
  plan.currentFloorHeight = 0;
  plan.normalizeOpening({ ...room.openings[0], from: 'vestibule.right' });
});
