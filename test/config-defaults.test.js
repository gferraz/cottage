const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/model.js');
require('../src/models/openings.js');
const model = globalThis.FloorPlanModel;

test('roof and floor defaults cover global and floor roofs without mutating input', () => {
  const source = {
    config: {
      roofs: { type: 'gable', pitch: 51, eave: 0.5, rake: 0.5 },
      floors: { ceiling_height: 3 },
    },
    roofs: [{ id: 'main', eave: 0 }],
    floors: [
      { id: 'ground', roofs: [{ id: 'porch', pitch: 30, rake: [0, 1] }] },
      { id: 'upper', ceiling_height: 2.5 },
    ],
  };
  const original = structuredClone(source);
  const result = model.fromConfig(source);
  assert.equal(result.config.roofs[0].type, 'gable');
  assert.equal(result.config.roofs[0].eave, 0);
  assert.equal(result.floors[0].ceiling_height, 3);
  assert.equal(result.floors[1].ceiling_height, 2.5);
  assert.equal(result.floors[0].roofs[0].pitch, 30);
  assert.deepEqual(result.floors[0].roofs[0].rake, [0, 1]);
  assert.deepEqual(source, original);
  assert.deepEqual(model.applyDefaults(result.config), result.config);
});

test('legacy single-floor configurations support defaults and existing configs stay compatible', () => {
  const legacy = { rooms: [], config: { floors: { ceiling_height: 3 } } };
  assert.equal(model.fromConfig(legacy).floors[0].ceiling_height, 3);
  const explicit = { floors: [{ id: 'ground', ceiling_height: 3 }], roofs: [{ type: 'gable', pitch: 45 }] };
  assert.deepEqual(model.fromConfig(explicit).config, explicit);
});

test('opening defaults merge per property and preserve unspecified catalog settings', () => {
  const plan = {
    catalog: { openings: { door: { w: 0.8, h: 2.1, z0: 0 } } },
    currentConfig: { config: { openings: { door: { w: 1, z0: 0 }, window: { h: 1.2 } } } },
  };
  const before = structuredClone(plan);
  const values = globalThis.FloorPlanOpenings.verticalDefaults(plan);
  assert.deepEqual(values.door, { w: 1, h: 2.1, z0: 0 });
  assert.deepEqual(values.window, { w: 0.9, h: 1.2, z0: 0.9 });
  assert.deepEqual(values.opening, { w: 1, h: 2.1, z0: 0 });
  assert.deepEqual(plan, before);
});

test('ceiling_height takes precedence over the legacy name, with local settings before defaults', () => {
  const result = model.fromConfig({
    config: { floors: { ceiling_height: 3, wall_max_height: 4 } },
    floors: [
      { id: 'both', ceiling_height: 2.8, wall_max_height: 5 },
      { id: 'legacy', wall_max_height: 2.6 },
      { id: 'default' },
    ],
  });
  assert.deepEqual(result.floors.map((floor) => floor.ceiling_height), [2.8, 2.6, 3]);
  assert.equal(model.fromConfig({ wall_max_height: 2.7 }).floors[0].ceiling_height, 2.7);
  assert.equal(model.fromConfig({ config: { floors: { wall_max_height: 3.2 } } }).floors[0].ceiling_height, 3.2);
});

test('invalid ceiling_height is reported instead of falling back to a valid legacy value', () => {
  require('../src/models/validation.js');
  for (const ceiling_height of [0, -1, 'invalid']) {
    const errors = globalThis.FloorPlanValidation.validateFloors({ z0: 0, ceiling_height, wall_max_height: 3 });
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /ceiling_height precisa ser positivo/);
  }
  assert.deepEqual(globalThis.FloorPlanValidation.validateFloors({ z0: 0, ceiling_height: 3 }), []);
  assert.deepEqual(globalThis.FloorPlanValidation.validateFloors({ z0: 0, wall_max_height: 3 }), []);
});
