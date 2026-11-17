require("./helpers/load-modules");
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
      { top: { level: 3 }, doors: [{ from: 'left' }] },
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

test('legacy opening syntax warns in every supported context with migration and source location', () => {
  for (const type of ['door', 'window', 'opening']) {
    const destination = { door: 'doors', window: 'windows', opening: 'openings' }[type];
    const entry = `{ openings: [{ type: '${type}', from: 'room.left' }] }`;
    for (const text of [entry, `{ floors: [${entry}] }`, `{ rooms: [${entry}] }`, `{ roofs: [${entry}] }`]) {
      const source = FloorPlanParser.parse(text, { filename: 'legacy.json5' });
      const first = model.fromConfig(source);
      assert.equal(first.warnings.length, 1);
      const warning = first.warnings[0];
      assert.equal(warning.code, 'opening-type');
      assert.equal(warning.location.file, 'legacy.json5');
      assert.match(warning.location.path, /openings\[0\]\.type$/);
      assert.ok(warning.message.includes(destination === 'openings' ? 'Mantenha' : `Mova a entrada para ${destination}`));
      assert.match(warning.message, /remova type/);
      assert.deepEqual(model.fromConfig({ ...first.config }).warnings, first.warnings);
    }
  }
});

test('all old default categories warn even when new defaults override them', () => {
  const source = FloorPlanParser.parse(`{ config: {
    openings: { door: { w: 1 }, window: { w: 1 }, opening: { w: 1 }, w: 2 },
    doors: { w: 2 }, windows: { w: 2 }
  } }`, { filename: 'defaults.json5' });
  const warnings = model.collectDeprecations(source);
  assert.equal(warnings.length, 3);
  for (const [index, category] of ['door', 'window', 'opening'].entries()) {
    assert.equal(warnings[index].code, 'opening-defaults');
    assert.equal(warnings[index].location.path, `config.openings.${category}`);
    assert.match(warnings[index].message, /têm prioridade por propriedade/);
  }
});
