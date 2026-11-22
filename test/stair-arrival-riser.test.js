const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-modules');
require('../src/models/geometry');
require('../src/models/walls');
const fs = require('node:fs');
const path = require('node:path');
const FloorPlan3DElements = require('node:vm').runInNewContext(
  fs.readFileSync(path.join(__dirname, '../src/views/3d/elements.js'), 'utf8') + '\nFloorPlan3DElements;',
  { FloorPlanGeometry, FloorPlanWalls },
);

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('arrival riser closes the full-width gap to the landing in all four directions without an extra tread', () => {
  class BufferGeometry {
    setAttribute(_, attribute) { this.vertices = attribute.values; }
    computeVertexNormals() {}
  }
  class Attribute { constructor(values) { this.values = values; } }
  class Mesh {
    constructor(geometry) { this.geometry = geometry; this.userData = {}; }
  }
  for (const direction of ['+x', '-x', '+y', '-y']) {
    const [flight] = FloorPlanStairPath.generate({ resolve: Number }, {
      id: 'stairs', pos: [4, 6, 0.3], width: 1.4, tread: 0.3125,
      parts: [{ id: 'lower-flight', direction, to: 1.8 }],
    });
    const meshes = [];
    FloorPlan3DElements.render({
      plan: {}, THREE: { BufferGeometry, Float32BufferAttribute: Attribute, Mesh },
      scene: { add: mesh => meshes.push(mesh) }, stairFlights: [flight],
      finite: (...values) => values.every(Number.isFinite), reportInvalid: () => assert.fail('invalid flight'),
    });
    assert.equal(meshes.length, 9);
    const arrivals = meshes.filter(mesh => mesh.userData.stairFace === 'arrival-riser');
    assert.equal(arrivals.length, 1);
    const vertices = arrivals[0].geometry.vertices;
    const points = Array.from({ length: vertices.length / 3 }, (_, i) => vertices.slice(i * 3, i * 3 + 3));
    const along = direction.endsWith('x') ? 0 : 1;
    const cross = 1 - along;
    const expectedEnd = (along === 0 ? flight.x : flight.y) + (direction[0] === '+' ? 2.5 : 0);
    points.forEach(point => close(point[along], expectedEnd));
    close(Math.max(...points.map(p => p[cross])) - Math.min(...points.map(p => p[cross])), 1.4);
    close(Math.min(...points.map(p => p[2])), 1.8 - 1.5 / 9);
    close(Math.max(...points.map(p => p[2])), 1.8);
    const treads = meshes.filter(mesh => mesh.userData.stairFace !== 'arrival-riser');
    close(Math.max(...treads.flatMap(mesh => mesh.geometry.vertices.filter((_, i) => i % 3 === 2))), 1.8 - 1.5 / 9);
    assert.equal(arrivals[0].userData.domainId, 'lower-flight');
  }
});
