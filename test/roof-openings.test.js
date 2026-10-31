const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/validation.js');
const validation = globalThis.FloorPlanValidation;
const roof = { id: 'roof', label: 'Escritório', type: 'gable', orientation: 'longitudinal' };

test('reports windows, doors and passages on removed roof gables', () => {
  for (const type of ['window', 'door', 'opening']) {
    const opening = { type, from: 'top' };
    const errors = validation.validateRoofOpenings({ roofs: [{ ...roof, openings: [opening] }] });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].opening, opening);
    assert.match(errors[0].message, /Escritório/);
    assert.match(errors[0].message, /essa superfície não existe/);
    assert.match(errors[0].message, /defina uma parede/);
  }
});

test('surface existence follows roof orientation', () => {
  assert.equal(validation.roofOpeningSurfaceError(roof, 'left'), null);
  assert.equal(validation.roofOpeningSurfaceError(roof, 'roof.right'), null);
  const transverse = { ...roof, orientation: 'transverse' };
  assert.equal(validation.roofOpeningSurfaceError(transverse, 'top'), null);
  assert.equal(validation.roofOpeningSurfaceError(transverse, 'bottom'), null);
  assert.match(validation.roofOpeningSurfaceError(transverse, 'left'), /não existe/);
});

test('validates global and floor roof openings regardless of active floor', () => {
  const errors = validation.validateRoofOpenings({
    roofs: [{ ...roof, openings: [{ from: 'bottom' }] }],
    floors: [{ roofs: [{ ...roof, id: 'upper-roof', windows: [{ from: 'top' }] }] }],
  });
  assert.equal(errors.length, 2);
  assert.equal(errors[1].category, 'window');
  assert.equal(errors[1].id, 'upper-roof-opening-1');
});

test('handles absent, invalid and foreign roof surfaces and configurations without openings', () => {
  for (const from of [undefined, 'ridge', 'other.top']) {
    assert.match(validation.roofOpeningSurfaceError(roof, from), /não existe/);
  }
  assert.deepEqual(validation.validateRoofOpenings({}), []);
  assert.deepEqual(validation.validateRoofOpenings({ roofs: [roof] }), []);
});
