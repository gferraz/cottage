const { test } = require('node:test');
const assert = require('node:assert/strict');
require('./helpers/load-modules');
for (const name of ['models/terrain', 'config/catalog', 'config/coordinates', 'models/geometry',
  'models/geometry-domain', 'models/walls', 'config/parser', 'models/model', 'models/validation',
  'models/openings', 'models/references', 'views/elements', 'models/headroom', 'views/3d/slabs', 'main']) require(`../src/${name}.js`);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const generate = (parts, extra = {}) => FloorPlanStairPath.generate({ resolve: Number, currentFloorHeight: 0 }, {
  id: 'stairs', pos: [4, 6, 0], parts, ...extra,
});
const flight = (direction = '+y', to = 1.02) => ({ direction, to });

test('four starting directions preserve the entry midpoint and compute six risers and five treads', () => {
  for (const direction of ['+x', '-x', '+y', '-y']) {
    const [part] = generate([flight(direction)]);
    assert.equal(part.risers, 6);
    close(part.h / part.risers, 0.17);
    const horizontal = direction.endsWith('x');
    close(horizontal ? part.w : part.l, 1.4);
    close(horizontal ? part.l : part.w, 1.2);
    close(horizontal ? part.y + part.l / 2 : part.x + part.w / 2, horizontal ? 6 : 4);
    close(horizontal ? part.x + (direction[0] === '-' ? part.w : 0)
      : part.y + (direction[0] === '-' ? part.l : 0), horizontal ? 4 : 6);
  }
});

test('L curves connect at full width in every orientation', () => {
  for (const a of ['+x', '-x', '+y', '-y']) for (const b of ['+x', '-x', '+y', '-y']) {
    if (a.endsWith(b.at(-1))) continue;
    const parts = generate([flight(a), {}, flight(b, 2.04)]);
    assert.equal(parts.length, 3);
    assert.equal(parts[1].kind, 'landing');
  }
});

test('extended landing connects opposite flights in both transverse directions', () => {
  for (const a of ['+x', '-x', '+y', '-y']) for (const d of ['+x', '-x', '+y', '-y']) {
    if (a.endsWith(d.at(-1))) continue;
    const b = (a[0] === '+' ? '-' : '+') + a.at(-1);
    const parts = generate([flight(a), { direction: d, run: 2.4 }, flight(b, 2.04)]);
    const first = parts[0], last = parts[2];
    close(Math.abs(a.endsWith('y') ? first.x - last.x : first.y - last.y), 1.2);
  }
});

test('three flights and two landings connect without overlaps', () => {
  const parts = generate([flight(), {}, flight('+x', 2.04), { direction: '+y', run: 2.4 }, flight('-x', 3.06)]);
  assert.equal(parts.length, 5);
  close(parts.at(-1).z1, 3.06);
});

test('solid-flared preserves four blocks, actual widths and run', () => {
  const [part] = generate([{ ...flight('+y', 0.6), tread: 0.34, steps: { widths: [3, 2.6, 2.2, 1.8] } }], { type: 'solid-flared' });
  close(part.w, 3);
  close(part.l, 1.36);
  assert.equal(FloorPlanGeometry.stairSteps(part).treads, 4);
  assert.equal(FloorPlanGeometry.stairBoxes(part).length, 4);
});

test('explicit count and run override targets', () => {
  const [part] = generate([{ ...flight(), risers: 5, run: 2 }]);
  assert.equal(part.risers, 5);
  close(FloorPlanGeometry.stairSteps(part).run, 0.5);
});

test('invalid paths report the part and reason', () => {
  for (const [parts, pattern] of [
    [[flight(), flight('+x', 2)], /patamar/],
    [[flight(), {}, flight('-y', 2)], /informe direction/],
    [[flight(), { direction: '+x', run: 0.5 }, flight('-y', 2)], /run insuficiente/],
    [[flight(), { direction: '+y', run: 2.4 }, flight('-y', 2)], /interseção/],
    [[flight('bad')], /direction/],
    [[flight('+y', 0)], /acima/],
    [[{ ...flight(), tread: -1 }], /tread/],
    [[{ ...flight(), risers: 1 }], /espelhos/],
  ]) assert.throws(() => generate(parts), pattern);
});

const prepare = (stairs, config = {}) => {
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject({ config, floors: [
    { id: 'ground', z0: 2, ceiling_height: 3, stairs },
    { id: 'upper', z0: 5.06, ceiling_height: 3 },
  ] });
  return plan;
};

test('project resolves floor elevations, references, part walls and inherited defaults', () => {
  const plan = prepare([{ id: 'stairs', pos: [4, 6], width: 1.4, tread: 0.3, parts: [
    { id: 'one', direction: '-y', to: 3.02, walls: ['left'] },
    { id: 'pad' },
    { id: 'two', direction: '+x', to: 'upper.z0' },
  ] }], { stairs: { width: 1.2, tread: 0.28 } });
  assert.deepEqual(plan.errors, []);
  const [one, pad, two] = plan.getRoomGeometry('stairs').normalizedParts;
  close(one.z0, 2); close(one.w, 1.4); close(one.l, 1.5);
  close(pad.z0, 3.02); close(two.z1, 5.06);
  close(plan.references.get('one').z1(), 3.02);
  assert.ok([...plan.walls.keys()].some(id => id.startsWith('stairs.one-')));
  assert.equal(plan.derivedZones.length, 2);
});

test('multiple paths have distinct automatic IDs and local references resolve earlier parts', () => {
  const plan = prepare([
    { id: 'a', pos: [0, 0], parts: [flight('+x', 3.02), {}, { direction: '+y', to: 'a-part-1.z1 + 1.02' }] },
    { id: 'b', pos: [10, 10], parts: [flight('-x', 3.02), {}, { direction: '-y', to: 'b.b-part-1.z1 + 1.02' }] },
  ]);
  assert.deepEqual(plan.errors, []);
  close(plan.references.get('a-part-3').z1(), 4.04);
  close(plan.references.get('b-part-3').z1(), 4.04);
});

test('part settings override stair settings, stair settings override config, and unequal risers warn once', () => {
  const plan = prepare([{ id: 'stairs', pos: [0, 0], width: 1.4, tread: 0.3, parts: [
    { id: 'one', direction: '+x', to: 3.02, tread: 0.32 }, {},
    { direction: '+y', to: 4.1, risers: 6 },
  ] }], { stairs: { width: 1.2, tread: 0.28 } });
  assert.deepEqual(plan.errors, []);
  close(plan.getRoomGeometry('stairs').normalizedParts[0].w, 1.6);
  const warnings = plan.warnings.filter(warning => warning.code === 'stair-path-risers');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /one: 17.00 cm/);
});

test('directly connected flights must share the full interface width', () => {
  assert.throws(() => generate([flight('+x'), { ...flight('+x', 2.04), width: 0.8 }]), /largura suficiente/);
});

test('sample project prepares both types without errors or mutating the input', () => {
  const fs = require('node:fs');
  const input = FloorPlanParser.parse(fs.readFileSync('escadas-percurso.json5', 'utf8'));
  const before = JSON.stringify(input);
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject(input);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.warnings, []);
  assert.equal(JSON.stringify(input), before);
  assert.equal(plan.getRoomGeometry('stairs').normalizedParts.length, 5);
});

test('Cartesian projects reflect the entry point and every horizontal direction', () => {
  const plan = Object.assign(Object.create(FloorPlan.prototype), { catalog: FloorPlanCatalog });
  plan.prepareProject({ id: 'ground', z0: 0, ceiling_height: 3, coordinate_system: 'cartesian', stairs: [{ id: 'stairs', pos: [4, 6, 0], parts: [
    { id: 'one', direction: '+x', to: 1.02 }, { direction: '+y', run: 2.4 },
    { id: 'two', direction: '-x', to: 2.04 },
  ] }] });
  assert.deepEqual(plan.errors, []);
  const [one, , two] = plan.getRoomGeometry('stairs').normalizedParts;
  close(one.x + one.w, -4);
  assert.equal(one.stairDirection, 'reverse');
  assert.equal(two.stairDirection, 'forward');
});
