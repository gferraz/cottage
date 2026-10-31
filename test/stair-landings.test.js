const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/views/3d/elements.js'), 'utf8') + '\nFloorPlan3DElements;', { getComputedStyle: () => ({ getPropertyValue: () => 'rgba(205, 177, 125, 0.45)' }) });

const render = (stairLandings) => {
  const meshes = [], errors = [];
  class PlaneGeometry { constructor(w, l) { this.size = [w, l]; } }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry; this.material = material; this.userData = {};
      this.position = { set: (...values) => { this.center = values; } };
    }
  }
  elements.render({
    plan: { root: {}, themeFillColor: color => ({ hazel: 'var(--theme-hazel)', terracotta: '#b15232' }[color] || color) }, THREE: { PlaneGeometry, Mesh, DoubleSide: 2 },
    scene: { add: (mesh) => meshes.push(mesh) }, stairFlights: [], stairLandings,
    wallMaterial: { clone: () => ({ opacity: 1, color: { value: '#f2cb96', set(value) { this.value = value; } } }) }, wallLineMaterial: {},
    finite: (...values) => values.every(Number.isFinite),
    reportInvalid: (...error) => errors.push(error),
  });
  return { meshes, errors };
};

test('renders zero-height landings at their actual elevation, visible from both sides', () => {
  const { meshes, errors } = render([
    { id: 'upper-landing', x: 7.6, y: 9.9, w: 2, l: 1.4, z0: 1.67, h: 0 },
    { id: 'lower-landing', x: 8.2, y: 11.3, w: 1.4, l: 1.4, z0: 1.67, h: 0 },
  ]);
  assert.equal(meshes.length, 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(meshes[0].geometry.size, [2, 1.4]);
  assert.deepEqual(meshes.map(m => m.center[2]), [1.67, 1.67]);
  assert.deepEqual(meshes.map(m => m.userData.domainId), ['upper-landing', 'lower-landing']);
  assert.ok(meshes.every(m => m.material.side === 2 && m.receiveShadow));
});

test('rejects invalid landing geometry instead of adding broken meshes', () => {
  const { meshes, errors } = render([{ id: 'bad', x: 0, y: 0, w: 0, l: 1, z0: 1.67 }]);
  assert.equal(meshes.length, 0);
  assert.deepEqual(errors, [['patamar de escada', 'bad']]);
});

test('resolves theme colors independently for each landing, including CSS variables and alpha', () => {
  const base = { x: 0, y: 0, w: 2, l: 1.4, z0: 1.67 };
  const { meshes } = render([
    { ...base, color: 'hazel' },
    { ...base, color: 'terracotta' },
    base,
  ]);
  assert.deepEqual(meshes.map(m => m.material.color.value), ['rgb(205, 177, 125)', '#b15232', '#f2cb96']);
  assert.equal(meshes[0].material.opacity, 0.45);
  assert.equal(meshes[0].material.transparent, true);
  assert.equal(meshes[1].material.opacity, 1);
  assert.notEqual(meshes[0].material, meshes[1].material);
});
