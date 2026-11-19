require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/models/geometry.js');

test('shared interpreter handles precedence, unary signs, decimals and context references', () => {
  const lookup = token => {
    assert.equal(token, 'floor-rear.z0');
    return -0.34;
  };
  assert.equal(FloorPlanExpressions.evaluate(' floor-rear.z0 + 3 ', lookup), 2.66);
  assert.equal(FloorPlanExpressions.evaluate('-(2 + 3) * 4 / 2 + 1e-2'), -9.99);
  assert.equal(FloorPlanExpressions.evaluate('0.5'), 0.5);
  const context = { resolve: lookup };
  assert.equal(FloorPlanGeometry.resolveExpression.call(context, 'floor-rear.z0 + 3'), 2.66);
});

test('shared interpreter rejects unsupported syntax, invalid operands and nonfinite results', () => {
  for (const expression of ['2 +', '1 / 0', '(2 + 3', '2 3', '2 ** 3', '1; + 2', '1e309', Infinity, NaN]) {
    assert.throws(() => FloorPlanExpressions.evaluate(expression, () => NaN));
  }
  assert.throws(() => FloorPlanExpressions.evaluate('value + 1', () => '2'));
});

test('shared dependencies cache successful values and clear failed resolutions for retries', () => {
  let calls = 0;
  let cyclic = true;
  const evaluate = FloorPlanExpressions.dependencies({
    label: key => key,
    location: () => undefined,
    cycleMessage: key => `cycle: ${key}`,
    invalidMessage: key => `invalid: ${key}`,
    read(key, resolve) {
      calls++;
      return key === 'base' ? 3 : cyclic ? resolve(key) : resolve('base') * 2;
    },
  });
  assert.throws(() => evaluate('upper'), /cycle: upper/);
  cyclic = false;
  assert.equal(evaluate('upper'), 6);
  const previousCalls = calls;
  assert.equal(evaluate('upper'), 6);
  assert.equal(evaluate('base'), 3);
  assert.equal(calls, previousCalls);
});
