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

test('transverse study colors only upper wall lengths without a ground wall below', () => {
  const plan = prepare('cottage-ferraz-cesar-garage-transverse.json5');
  assert.deepEqual(plan.errors, []);
  const parts = plan.wallRenderParts;
  const ground = parts.filter((wall) => wall.z0 <= 0 && wall.z1 >= 3);
  for (const wall of parts.filter((wall) => wall.z0 === 3)) {
    const along = wall.axis === 'x' ? 0 : 1;
    const across = 1 - along;
    const intervals = ground.filter((lower) => lower.axis === wall.axis &&
      Math.abs(lower.from[across] - wall.from[across]) < 1e-8)
      .map((lower) => [Math.max(lower.from[along], wall.from[along]),
        Math.min(lower.to[along], wall.to[along])])
      .filter(([start, end]) => end - start > 1e-8)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0, end = -Infinity;
    for (const [a, b] of intervals) {
      covered += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
    const length = wall.to[along] - wall.from[along];
    assert.ok(Math.abs(covered - (wall.color === 'blue' ? 0 : length)) < 1e-8, wall.id);
  }
  const definition = FloorPlanOpenings.collect(plan.roomDefinitions.get('bedroom-north'))
    .find((opening) => opening.type === 'door');
  const opening = plan.normalizeOpening({ ...definition, from: `bedroom-north.${definition.from}` });
  assert.equal(opening.wallId, 'bedroom-north-bottom');
});

test('garage walls inherit the default color while the terrain plinth stays green', () => {
  const plan = prepare('cottage-ferraz-cesar-garage-transverse.json5');
  const defaultColor = plan.currentConfig.config.walls.color;
  const garageWalls = [...plan.walls.values()].filter((wall) => wall.sourceRoomIds.includes('garage'));
  assert.equal(garageWalls.length, 3);
  assert.ok(garageWalls.every((wall) => wall.color === defaultColor));
  const plinth = plan.independentWalls.get('perimeter-plinth');
  assert.equal(plinth.color, 'mate-amargo');
  assert.ok(plinth.geometryParts.every((wall) => wall.color === 'mate-amargo'));
  assert.equal(plinth.topZ, 0);
});

test('plan view excludes the green plinth below the floor without changing its 3D parts', () => {
  const plan = prepare('cottage-ferraz-cesar-garage-transverse.json5');
  plan.currentFloorId = 'ground';
  const drawn = [];
  plan.add = (item) => {
    drawn.push(item);
    return { style: {}, dataset: {} };
  };
  for (const showAllFloors of [false, true]) {
    drawn.length = 0;
    plan.showAllFloors = showAllFloors;
    FloorPlanWalls.renderIndependentWalls(plan);
    assert.ok(drawn.length > 0);
    assert.ok(drawn.every((wall) => !wall.id.startsWith('perimeter-plinth-')));
  }
  const plinthParts = plan.wallRenderParts.filter((wall) => wall.sourceWallId === 'perimeter-plinth');
  assert.equal(plinthParts.length, 10);
  assert.ok(plinthParts.every((wall) => wall.color === 'mate-amargo'));
});
