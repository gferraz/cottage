const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/models/geometry.js');
require('../src/models/geometry-operations.js');
require('../src/models/walls.js');
require('../src/views/dom.js');
const stair = { stairType: 'solid-flared', stepWidths: [3, 2.6, 2.2, 1.8], stairAxis: 'vertical', w: 3, l: 1.36, h: .6, z0: -.6 };
test('solid flared stairs include four full treads and uniform 15 cm rises', () => {
  const steps = FloorPlanGeometry.stairSteps(stair);
  assert.equal(steps.treads, 4);
  assert.equal(steps.rise, .15);
  assert.equal(steps.run, .34);
  assert.deepEqual(FloorPlanWalls.stairUndersidePlane(stair), [0, 0, 1, .6]);
  for (const stepWidths of [[3, 3.1], [3, 0], [3], [2, 3]]) {
    assert.throws(() => FloorPlanGeometry.stairSteps({ ...stair, stepWidths }));
  }
});
test('plan silhouette widens toward the lower end in either direction', () => {
  for (const reverse of [false, true]) {
    const props = {};
    FloorPlanDom.applyStairGradient({ dataset: {}, style: { setProperty: (k,v) => { props[k] = v; } } },
      { ...stair, stairDirection: reverse ? 'reverse' : 'forward' }, { base: -.6, top: 0 });
    assert.equal(props['clip-path'], 'none');
    assert.ok(props.background.includes('100% 100%'));
    assert.ok(props.background.includes(reverse ? 'center top' : 'center bottom'));
    assert.ok(props.background.includes('60% 25%'));
  }
});
const FloorPlan3DElements = require('node:vm').runInThisContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/views/3d/elements.js'), 'utf8') + '\nFloorPlan3DElements;');
test('3D blocks reach the base, keep centered widths and assign stone only to top faces', () => {
  class BufferGeometry {
    constructor() { this.groups = []; }
    setAttribute(_, value) { this.vertices = value; }
    computeVertexNormals() {}
    addGroup(start, count, material) { this.groups.push({ start, count, material }); }
  }
  class Mesh { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; } }
  class Attribute { constructor(values) { this.values = values; } }
  const material = { clone: () => ({ color: { set() {} } }) };
  for (const axis of ['horizontal', 'vertical']) {
    for (const reverse of [false, true]) {
      const meshes = [];
      FloorPlan3DElements.render({ plan: {}, THREE: { BufferGeometry, Mesh, Float32BufferAttribute: Attribute },
        scene: { add: m => meshes.push(m) }, stairFlights: [{ ...stair, x: 4, y: 5,
          w: axis === 'horizontal' ? 1.36 : 3, l: axis === 'horizontal' ? 3 : 1.36,
          stairAxis: axis, stairDirection: reverse ? 'reverse' : 'forward' }],
        wallMaterial: material, finite: (...values) => values.every(Number.isFinite),
        reportInvalid: () => assert.fail('valid stair rejected') });
      assert.equal(meshes.length, 4);
      meshes.forEach((mesh, index) => {
        const values = mesh.geometry.vertices.values;
        const zs = values.filter((_, i) => i % 3 === 2);
        const cross = values.filter((_, i) => i % 3 === (axis === 'horizontal' ? 1 : 0));
        assert.equal(Math.min(...zs), -.6);
        const along = mesh.geometry.vertices.values.filter((_, i) => i % 3 === (axis === 'horizontal' ? 0 : 1));
        assert.ok(Math.abs(Math.max(...along) - Math.min(...along) - (1.36 - index * .34)) < 1e-8);
        assert.ok(Math.abs(Math.max(...zs) - (-.6 + (index + 1) * .15)) < 1e-8);
        assert.ok(Math.abs(Math.max(...cross) - Math.min(...cross) - stair.stepWidths[index]) < 1e-8);
        assert.equal(mesh.geometry.groups.filter(g => g.material === 1).length, 1);
      });
    }
  }
});
