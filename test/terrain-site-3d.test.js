require('./helpers/load-modules');
const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/models/terrain.js');
require('../src/models/walls.js');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const FloorPlan3DSite = vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/views/3d/site.js'), 'utf8') + '\nFloorPlan3DSite;', { FloorPlanTerrainGeometry });

test('rendered terrain and the front plinth share the same ground elevation', () => {
  const terrainProfile = { frontStart: { x: 0, y: 0 }, grading: FloorPlanTerrainGeometry.profile({
    profile: [{ y: 0, z: 0 }, { y: 3.2, z: 0 }, { y: 12, z: -0.5 }],
  }) };
  const objects = [];
  class Geometry {
    setAttribute(key, value) { this[key] = value; }
    setIndex() {}
    computeVertexNormals() {}
    computeBoundingBox() {}
    computeBoundingSphere() {}
  }
  class Attribute { constructor(values) { this.array = values; } }
  class Mesh {
    constructor(geometry) { this.geometry = geometry; this.position = { z: 0 }; }
  }
  FloorPlan3DSite.render({
    THREE: { BufferGeometry: Geometry, Float32BufferAttribute: Attribute, Mesh },
    scene: { add: object => objects.push(object) },
    rooms: [{ x0: () => 0, x1: () => 10, y0: () => 0, y1: () => 10 }],
    terrainProfile, buildingOffsetX: 4, buildingOffsetY: 3,
  });
  const mesh = objects[0];
  const vertices = mesh.geometry.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    assert.equal(vertices[i + 2] + mesh.position.z,
      FloorPlanTerrainGeometry.elevationAt(terrainProfile, vertices[i] + 4, vertices[i + 1] + 3));
  }
  const polygons = FloorPlanWalls.wallElevation({
    from: [0, 0], to: [10, 0], thickness: 0.12, baseStart: -6, baseEnd: -6,
    top: 0.45, terrainReference: terrainProfile, terrainOffset: { x: 4, y: 3 },
  }, [], false);
  assert.equal(Math.min(...polygons.flat().map(point => point[1])), 0);
});
