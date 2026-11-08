const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
for (const name of ['geometry-box', 'geometry', 'geometry-domain', 'walls']) require(`../src/models/${name}.js`);
const walls = FloorPlanWalls;
const fixture = (definitions) => ({
  currentConfig: { floors: [{ id: 'ground', z0: 0, rooms: definitions }] },
  roomDefinitions: new Map(definitions.map((entry) => [entry.id, entry])),
  partReferenceStack: [], references: new Map(), currentFloorHeight: 0,
  resolve: FloorPlanGeometry.resolve, resolveExpression: FloorPlanGeometry.resolveExpression,
  normalizeGeometry(data) { return FloorPlanGeometryDomain.normalizeGeometry(this, data); },
  normalizeGeometryAtFloor(data, floor) { return FloorPlanGeometryDomain.normalizeGeometryAtFloor(this, data, floor); },
});
const height = (limit, x, y) => {
  const [a, b, c, d] = limit.slopes[0];
  return -(a * x + b * y + d) / c;
};
const stair = (from, to, orientation = 'longitudinal') => ({
  id: 'flight', from, to, orientation, classes: 'stair-flight',
});
const volume = (solids) => solids.reduce((total, solid) => total + Math.abs(solid.reduce((sum, face) => {
  const a = face[0];
  for (let i = 1; i < face.length - 1; i++) {
    const b = face[i], c = face[i + 1];
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return sum;
}, 0)) / 6, 0);

test('underside follows stair ascent for either axis and reversed endpoints', () => {
  for (const [from, to, orientation] of [
    [[0, 0, 1], [1, 2, 3], 'longitudinal'],
    [[1, 2, 3], [0, 0, 1], 'longitudinal'],
    [[2, 0, 1], [0, 1, 3], 'transverse'],
    [[0, 1, 3], [2, 0, 1], 'transverse'],
  ]) {
    const plan = fixture([stair(from, to, orientation)]);
    const [limit] = walls.undersideLimits(plan, { under: 'flight', offset: 0.15 });
    assert.ok(Math.abs(height(limit, ...from) - (from[2] - 0.15)) < 1e-9);
    assert.ok(Math.abs(height(limit, ...to) - (to[2] - 0.15)) < 1e-9);
  }
});

test('landing and generic overhead volumes use their bottom elevation', () => {
  const plan = fixture([{ id: 'slab', pos: [0, 0, 2], size: [3, 2, 0.2] }]);
  const [limit] = walls.undersideLimits(plan, { under: 'slab' });
  assert.equal(height(limit, 1, 1), 2);
  const solids = walls.wallSolids(walls.boxFaces(0, 0, 0, 3, 1, 4), [], false, [limit]);
  assert.ok(Math.abs(volume(solids) - 6) < 1e-8);
});

test('partial footprints preserve uncovered wall and overlapping objects use the lowest underside', () => {
  const plan = fixture([
    { id: 'a', pos: [0, 0, 2], size: [2, 1, 0] },
    { id: 'b', pos: [1, 0, 1], size: [2, 1, 0] },
  ]);
  const face = walls.boxFaces(0, 0, 0, 4, 1, 4);
  const limits = walls.undersideLimits(plan, { under: ['a', 'b'] });
  for (const values of [limits, [...limits].reverse()]) {
    assert.ok(Math.abs(volume(walls.wallSolids(face, [], false, values)) - 8) < 1e-8);
  }
});

test('roof and underside limits both apply and elevations share the same sloping cut', () => {
  const plan = fixture([stair([0, 0, 1], [2, 1, 3], 'transverse')]);
  const limits = walls.undersideLimits(plan, { under: 'flight' }, 0.1);
  const polygons = walls.wallElevation({ from: [0, 0.5], to: [2, 0.5], thickness: 0.1,
    baseStart: 0, baseEnd: 0, top: 4, undersideLimits: limits }, [], false);
  assert.ok(polygons.flat().some(([x, z]) => x === 0 && z === 1));
  assert.ok(polygons.flat().some(([x, z]) => x === 2 && z === 3));
  const roof = { bounds: limits[0].bounds, slopes: [[0, 0, 1, -2]] };
  const solids = walls.wallSolids(walls.boxFaces(0, 0, 0, 2, 1, 4), [roof], false, limits);
  assert.ok(Math.abs(volume(solids) - 3.5) < 1e-8);
});

test('unknown references, invalid offsets and rotated volumes report errors', () => {
  const plan = fixture([{ id: 'rotated', pos: [0, 0, 2], size: [2, 1], rotation: 45 }]);
  assert.throws(() => walls.undersideLimits(plan, { under: 'missing' }), /desconhecido/);
  assert.throws(() => walls.undersideLimits(plan, { under: [] }), /referências/);
  assert.throws(() => walls.undersideLimits(plan, { under: 'missing', offset: -1 }), /offset/);
  assert.throws(() => walls.undersideLimits(plan, { under: 'rotated' }), /sem rotação/);
});

test('stair meshes leave the inclined underside clear instead of filling down to the landing', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = vm.runInNewContext(fs.readFileSync('src/views/3d/elements.js', 'utf8') + '\nFloorPlan3DElements;', { FloorPlanWalls: walls });
  class BufferGeometry {
    setAttribute(name, value) { this.vertices = value.values; }
    computeVertexNormals() {}
  }
  class Float32BufferAttribute { constructor(values) { this.values = values; } }
  class Mesh { constructor(geometry) { this.geometry = geometry; this.userData = {}; } }
  for (const definition of [stair([0, 0, 1], [1, 2, 3]), stair([2, 0, 1], [0, 1, 3], 'transverse')]) {
    const plan = fixture([definition]);
    const geometry = plan.normalizeGeometry(definition);
    const meshes = [];
    elements.render({ plan: {}, THREE: { BufferGeometry, Float32BufferAttribute, Mesh },
      scene: { add: (mesh) => meshes.push(mesh) }, stairFlights: [geometry], stairLandings: [],
      finite: (...values) => values.every(Number.isFinite), reportInvalid: () => assert.fail('invalid stair'),
    });
    assert.ok(meshes.length > 1);
    const plane = walls.stairUndersidePlane(geometry);
    for (const mesh of meshes) {
      assert.ok(mesh.geometry.vertices.length > 0);
      for (let i = 0; i < mesh.geometry.vertices.length; i += 3) {
        const [x, y, z] = mesh.geometry.vertices.slice(i, i + 3);
        assert.ok(plane[0] * x + plane[1] * y + z + plane[3] >= -1e-8);
      }
    }
  }
});

for (const name of ['../src/config/parser', '../src/models/model', '../src/models/validation',
  '../src/views/roofs', '../src/models/openings', '../src/models/references', '../src/main']) require(name + '.js');
const prepare = (source) => {
  const model = FloorPlanModel.fromConfig(source);
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    model, currentConfig: model.config, errors: [], invalidRoomIds: new Set(), partReferenceStack: [],
    currentFloorHeight: 0, catalog: {}, walls: new Map(), independentWalls: new Map(),
  });
  plan.prepareRoomReferences(model.config);
  return plan;
};

test('active room walls resolve stair parts and independent walls accept overhead objects', () => {
  const fs = require('node:fs');
  const source = FloorPlanParser.parse(fs.readFileSync('cottage-ferraz-cesar-front-gables.json5', 'utf8'));
  source.walls.push({ id: 'under-test-wall', scope: 'ground', base: { level: 0 },
    top: { under: ['upper-flight', 'upper-landing'], offset: 0.1 },
    from: ['upper-flight.x0', 'upper-flight.y0'], to: ['upper-flight.x0', 'upper-landing.y1'],
  });
  const plan = prepare(source);
  assert.deepEqual(plan.errors.filter((entry) => entry.category === 'wall'), []);
  for (const id of ['powder-left', 'laundry-left']) {
    assert.equal(plan.walls.get(id).undersideLimits.length, 5);
  }
  const independent = plan.independentWalls.get('under-test-wall');
  assert.equal(independent.undersideLimits.length, 2);
  assert.ok(independent.geometryParts.every((part) => part.undersideLimits.length === 2));
  const compound = walls.undersideLimits(plan, { under: 'stairs' });
  assert.equal(compound.length, 5);
});

test('invalid room overhead references become located wall errors instead of uncapped walls', () => {
  const plan = prepare({ ceiling_height: 3, rooms: [{ id: 'room', pos: [0, 0], size: [2, 2],
    top: { under: 'missing' }, walls: ['left'] }] });
  assert.ok(plan.errors.some((entry) => entry.category === 'wall' && /desconhecido/.test(entry.message)));
  assert.equal(plan.walls.size, 0);
});

test('padding covers perimeter wall thickness without extending slopes into adjacent landings', () => {
  const plan = fixture([
    stair([0, 0, 1], [1, 2, 3]),
    { id: 'landing', pos: [0, 2, 3], size: [1, 1, 0] },
  ]);
  const [flight, landing] = walls.undersideLimits(plan, { under: ['flight', 'landing'] }, 0.06);
  assert.equal(flight.bounds[3][3], -2);
  assert.equal(landing.bounds[2][3], 2);
  const faces = walls.boxFaces(0, 2, 0, 1, 3.06, 4);
  assert.ok(Math.abs(volume(walls.wallSolids(faces, [], false, [flight, landing])) - 3.18) < 1e-8);
});

test('room top accepts the same level and roof forms as independent walls', () => {
  const levelPlan = prepare({ ceiling_height: 3, rooms: [{ id: 'room', pos: [0, 0], size: [2, 2],
    top: { level: 2.4 }, walls: ['left'] }] });
  assert.equal(levelPlan.walls.get('room-left').z1, 2.4);
  const roofPlan = prepare({ ceiling_height: 3,
    roofs: [{ id: 'roof', type: 'gable', orientation: 'longitudinal', pitch: 45, z0: 3,
      rectangle: [0, 0, 2, 2] }],
    rooms: [{ id: 'room', pos: [0, 0], size: [2, 2], top: 'roof', walls: ['left'] }],
  });
  assert.deepEqual(roofPlan.errors.filter((entry) => entry.category === 'wall'), []);
  assert.equal(roofPlan.walls.get('room-left').roofOnly, true);
  assert.equal(roofPlan.walls.get('room-left').z1, 4);
});

test('direct object IDs and ID lists work for room and independent tops', () => {
  const source = { ceiling_height: 3,
    roofs: [{ id: 'gable', type: 'gable', orientation: 'longitudinal', pitch: 45, z0: 3, rectangle: [0, 0, 2, 2] }],
    rooms: [
      { id: 'slab', pos: [0, 0, 2], size: [2, 2, 0.2], walls: [] },
      { id: 'room', pos: [0, 0], size: [2, 2], top: 'slab', walls: ['left'] },
    ],
    walls: [{ id: 'direct-wall', base: { level: 0 }, top: ['slab'], thickness: 0.1, from: [0, 0], to: [2, 0] }],
  };
  const plan = prepare(source);
  assert.deepEqual(plan.errors.filter((entry) => entry.category === 'wall'), []);
  assert.equal(plan.walls.get('room-left').undersideLimits[0].id, 'slab');
  assert.deepEqual(plan.independentWalls.get('direct-wall').top, ['slab']);
  assert.equal(height(walls.undersideLimits(plan, 'slab')[0], 1, 1), 2);
  const [roof] = walls.undersideLimits(plan, 'gable');
  assert.equal(roof.peakZ, 4);
  assert.equal(roof.slopes.length, 2);
  assert.equal(walls.undersideLimits(plan, 'roof').length, 0);
});
