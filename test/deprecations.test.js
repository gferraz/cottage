const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/config/parser.js');
require('../src/models/model.js');
const model = FloorPlanModel;

test('reports original locations, defaults and inactive floors without mutating source', () => {
  const source = FloorPlanParser.parse(`{
    config: { floors: { wall_max_height: 3 }, roofs: { eave: 0.4 } },
    floors: [{ id: 'upper', wall_max_height: 2.8, rooms: [
      { id: 'room', top: { under: ['stairs'] } }
    ] }]
  }`, { filename: 'old.json5' });
  const before = JSON.stringify(source);
  const warnings = model.collectDeprecations(source);
  assert.equal(warnings.length, 4);
  assert.equal(warnings[0].location.file, 'old.json5');
  assert.equal(warnings[0].location.line, 2);
  assert.equal(warnings[2].path, '$.floors[0].wall_max_height');
  assert.equal(JSON.stringify(source), before);
});

test('keeps supported alternatives and arbitrary user names free of warnings', () => {
  assert.deepEqual(model.collectDeprecations({
    parameters: { wall_max_height: 3, eave: 1 },
    floors: [{ ceiling_height: 3, rooms: [
      { top: { level: 3 }, openings: [{ type: 'door' }] },
      { top: { under: 'stairs', offset: 0.2 } },
    ], roofs: [{ eaves: { left: 0.4, right: 0.4 } }] }],
  }), []);
});

test('reloads preserve original warnings without reporting expanded defaults', () => {
  const first = model.fromConfig({ config: { roofs: { eave: 0.4 } },
    floors: [{ roofs: [{ id: 'a' }, { id: 'b' }] }] });
  assert.equal(first.warnings.length, 1);
  const reloaded = model.fromConfig({ ...first.config });
  assert.deepEqual(reloaded.warnings, first.warnings);
  assert.equal(JSON.stringify(first.config).includes('deprecationWarnings'), false);
  assert.deepEqual(model.fromConfig({}).warnings, []);
});
