require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/config/parser.js');
require('../src/models/geometry.js');
require('../src/models/model.js');

test('floor levels resolve arithmetic, parameters and forward references without mutating input', () => {
  const source = {
    parameters: { height: 3 },
    floors: [
      { id: 'upper-rear', z0: 'ground-rear.z0 + params.height' },
      { id: 'ground-rear', z0: 'base.z0 - 2 * 0.17' },
      { id: 'base', z0: 0 },
      { id: 'numeric', z0: '3.5' },
      { id: 'implicit' },
      { id: 'above-implicit', z0: '(implicit.z0 + 1) / 2' },
    ],
  };
  const original = structuredClone(source);
  const model = FloorPlanModel.fromConfig(source);
  assert.deepEqual(model.floors.map(floor => floor.z0), [2.66, -0.34, 0, 3.5, undefined, 0.5]);
  assert.deepEqual(source, original);
  assert.equal(FloorPlanModel.fromConfig({ z0: '2 * 1.5' }).floors[0].z0, 3);
});

test('floor level dependencies reject cycles, unknown floors, other geometry and invalid arithmetic', () => {
  for (const [floors, pattern] of [
    [[{ id: 'a', z0: 'a.z0' }], /circular/],
    [[{ id: 'a', z0: 'b.z0' }, { id: 'b', z0: 'a.z0' }], /circular/],
    [[{ id: 'a', z0: 'missing.z0 + 1' }], /Pavimento desconhecido.*missing/],
    [[{ id: 'a', z0: 'a.x0' }], /Referência inválida/],
    [[{ id: 'a', z0: '1 / 0' }], /Division by zero/],
    [[{ id: 'a', z0: '1 +' }], /Invalid geometric expression/],
    [[{ id: 'a', z0: Infinity }], /finita/],
  ]) assert.throws(() => FloorPlanModel.fromConfig({ floors }), pattern);
});

test('floor level errors retain the source file, line and property path', () => {
  const source = FloorPlanParser.parse('{\n floors: [\n { id: "upper", z0: "missing.z0 + 1" }\n ]\n}', { filename: 'levels.json5' });
  assert.throws(() => FloorPlanModel.fromConfig(source), error => {
    assert.equal(error.location.file, 'levels.json5');
    assert.equal(error.location.line, 3);
    assert.equal(error.location.path, 'floors[0].z0');
    return true;
  });
});
