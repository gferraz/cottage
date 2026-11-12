const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const elements = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/views/3d/elements.js'), 'utf8') + '\nFloorPlan3DElements;');

const render = (items) => {
  const groups = [], errors = [];
  class Group {
    constructor() {
      this.scale = { set: (...values) => { this.scaling = values; } };
      this.children = []; this.userData = {}; this.rotation = {};
      this.position = { set: (...values) => { this.center = values; } };
    }
    add(mesh) { this.children.push(mesh); }
  }
  class Mesh extends Group {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  }
  class BoxGeometry { constructor(...size) { this.size = size; } }
  class CylinderGeometry { constructor(...size) { this.size = size; this.type = "CylinderGeometry"; } }
  const material = () => ({ opacity: 1, color: { set(value) { this.value = value; } }, clone: material });
  elements.renderItems({ plan: { allItems: items, themeFillColor: value => value },
    THREE: { Group, Mesh, BoxGeometry, CylinderGeometry }, scene: { add: group => groups.push(group) },
    wallMaterial: material(), finite: (...values) => values.every(Number.isFinite),
    reportInvalid: (...args) => errors.push(args) });
  return { groups, errors };
};

test('beds use the correct floor elevation, center and rotation', () => {
  const { groups, errors } = render([{ id: 'bed', type: 'twin-bed', x: 2, y: 4, w: 1, l: 2, z0: 3, h: 0.55, rotation: 90, color: '#aa8877' }]);
  assert.deepEqual(errors, []);
  assert.deepEqual(groups[0].center, [2.5, 5, 3]);
  assert.equal(groups[0].rotation.z, Math.PI / 2);
  assert.equal(groups[0].children.length, 3);
  assert.equal(groups[0].userData.domainId, 'bed');
  groups[0].children.forEach(mesh => assert.ok(mesh.castShadow && mesh.receiveShadow));
});

test('2D car and table definitions receive useful 3D heights without duplicating railings', () => {
  const base = { x: 0, y: 0, w: 2, l: 4, z0: 0, h: 0 };
  const { groups } = render([{ ...base, classes: 'car' }, { ...base, classes: 'table' }, { ...base, classes: 'architectural railing' }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].children.length, 6);
  assert.equal(groups[1].children.length, 5);
  assert.ok(Math.abs(groups[1].children[0].geometry.size[2] - 0.075) < 1e-9);
});

test('unknown items use a generic volume and invalid dimensions are reported', () => {
  const base = { x: 0, y: 0, w: 1, l: 1, z0: 0, h: 0.8 };
  const { groups, errors } = render([{ ...base, id: 'cabinet' }, { ...base, id: 'bad', w: -1 }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].children.length, 1);
  assert.deepEqual(errors, [['item', 'bad']]);
});


test('round tables keep a circular top in 3D for class and type definitions', () => {
  for (const definition of [{ classes: 'table round-table' }, { classes: 'round-table' }, { type: 'round-table' }]) {
    const { groups, errors } = render([{ ...definition, id: 'round', x: 2, y: 3, w: 1.2, l: 1.2, z0: 3, h: 0.75 }]);
    assert.deepEqual(errors, []);
    assert.deepEqual(groups[0].center, [2.6, 3.6, 3]);
    const top = groups[0].children[0];
    assert.equal(top.geometry.type, 'CylinderGeometry');
    assert.equal(top.geometry.size[3], 48);
    assert.equal(top.rotation.x, Math.PI / 2);
    assert.deepEqual(top.scaling, [1.2, 1, 1.2]);
    assert.ok(Math.abs(top.center[2] - 0.7125) < 1e-9);
    assert.equal(groups[0].children.length, 5);
  }
});
