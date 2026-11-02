const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
require('../src/config/parser.js');
require('../src/models/geometry.js');
require('../src/models/model.js');
require('../src/models/openings.js');
const parser = globalThis.FloorPlanParser;
const model = globalThis.FloorPlanModel;

test('parameters resolve arithmetic and dependent values before defaults and keep input intact', () => {
  const config = { parameters: { thickness: 0.12, height: 3, double: 'params.height * 2' },
    config: { walls: { thickness: 'params.thickness' }, floors: { ceiling_height: 'params.height' } },
    floors: [{ id: 'upper', z0: 'params.double', rooms: [{ id: 'office', from: [0, 0], to: ['x0 + params.height', 4] }] }],
  };
  const original = structuredClone(config);
  const normalized = model.fromConfig(config).config;
  assert.equal(normalized.config.walls.thickness, 0.12);
  assert.equal(normalized.floors[0].z0, 6);
  assert.equal(normalized.floors[0].ceiling_height, 3);
  assert.equal(normalized.floors[0].rooms[0].to[0], 'x0 + (3)');
  assert.deepEqual(config, original);
});

test('parameter cycles, missing parameters and nonnumeric values fail without evaluating code', () => {
  for (const parameters of [
    { a: 'params.b', b: 'params.a' }, { a: 'params.unknown' },
    { a: 'office.x0' }, { a: '1 / 0' }, { a: 'process.exit()' },
  ]) assert.throws(() => model.fromConfig({ parameters }));
});

test('domain errors retain file, line and path after defaults and local opening expansion', () => {
  const text = '{\n  parameters: { height: 3 },\n  config: { floors: { ceiling_height: "params.height" } },\n  floors: [{ id: "ground", z0: 0, rooms: [{\n    id: "office",\n    openings: [\n      { type: "door", from: "left" }\n    ]\n  }] }]\n}';
  const parsed = parser.parse(text, { filename: 'house.json5' });
  const expanded = model.fromConfig(parsed).config;
  const [opening] = globalThis.FloorPlanOpenings.roomOpenings({}, expanded.floors[0]);
  assert.equal(opening.from, 'office.left');
  const location = parser.errorLocation({ opening }, expanded);
  assert.deepEqual(location, { file: 'house.json5', line: 7, column: 7, path: 'floors[0].rooms[0].openings[0]' });
  assert.equal(parser.errorLocation({ id: 'office' }, expanded).path, 'floors[0].rooms[0]');
  assert.match(parser.formatLocation(location), /house.json5:7:7/);
  assert.equal(JSON.stringify(parsed).includes('house.json5'), false);
});

test('syntax and parameter errors report their source location', () => {
  assert.throws(() => parser.parse('{\n floors: [ { id: } ]\n}', { filename: 'bad.json5' }), /bad.json5:2:.*floors\[0\].id/);
  const config = parser.parse('{\n parameters: {\n   height: "params.height"\n }\n}', { filename: 'cycle.json5' });
  assert.throws(() => model.fromConfig(config), /cycle.json5:3:.*parameters.height/);
});

test('editor example and active file parse and all schema references exist', () => {
  const schema = JSON.parse(fs.readFileSync('floor-plan.schema.json', 'utf8'));
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) assert.ok(schema.definitions[value.$ref.split('/').at(-1)]);
    Object.values(value).forEach(visit);
  };
  visit(schema);
  for (const file of ['examples/parametros-e-aberturas.json5', 'cottage-ferraz-cesar-front-gables.json5']) {
    const config = parser.parse(fs.readFileSync(file, 'utf8'), { filename: file });
    assert.ok(model.fromConfig(config).floors.length);
  }
});
