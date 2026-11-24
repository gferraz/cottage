require("./helpers/load-modules");
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
globalThis.window = globalThis;
require('../src/models/openings.js');
for (const name of ['config/parser', 'config/catalog', 'config/coordinates', 'models/model', 'models/openings', 'models/validation']) require(`../src/${name}.js`);

test('collections determine categories, keep legacy typed openings and preserve source locations', () => {
  const config = FloorPlanParser.parse(`{
    doors: [{ from: 'room.front', type: 'window' }],
    windows: [{ from: 'room.rear' }],
    openings: [{ from: 'room.left' }, { from: 'room.right', type: 'door' }]
  }`, { filename: 'collections.json5' });
  const before = JSON.stringify(config);
  const entries = FloorPlanOpenings.collect(config);
  assert.deepEqual(entries.map(e => e.type), ['opening', 'door', 'door', 'window']);
  assert.equal(FloorPlanParser.location(entries[2]).path, 'doors[0]');
  assert.equal(JSON.stringify(config), before);
  assert.deepEqual(FloorPlanOpenings.collect({}), []);
});

test('room collections expand local walls and all collection aliases normalize', () => {
  const config = FloorPlanModel.fromConfig({ rooms: [{ id: 'room',
    doors: [{ from: 'front' }], windows: [{ from: 'rear' }], openings: [{ from: 'left' }],
  }] }).config;
  const entries = FloorPlanOpenings.roomOpenings({}, config);
  assert.deepEqual(entries.map(e => [e.type, e.from, e.roomId]), [
    ['opening', 'room.left', 'room'], ['door', 'room.top', 'room'], ['window', 'room.bottom', 'room'],
  ]);
});

test('separate defaults override legacy values per property, leaving input intact', () => {
  const plan = { catalog: FloorPlanCatalog, currentConfig: { config: {
    openings: { door: { w: 0.7, h: 2 }, window: { z0: 1 }, opening: { w: 2 }, w: 3 },
    doors: { w: 0.95 }, windows: { h: 0.8 },
  } } };
  const before = JSON.stringify(plan);
  const defaults = FloorPlanOpenings.verticalDefaults(plan);
  assert.deepEqual(defaults.door, { w: 0.95, h: 2, z0: 0 });
  assert.deepEqual(defaults.window, { w: 0.9, h: 0.8, z0: 1 });
  assert.deepEqual(defaults.opening, { w: 3, h: 2.1, z0: 0 });
  assert.equal(JSON.stringify(plan), before);
});

test('cartesian reflection uses collection-specific widths on rooms, floors and roofs', () => {
  const result = FloorPlanModel.fromConfig({ coordinate_system: 'cartesian', config: {
    doors: { w: 1.1 }, windows: { w: 1.6 }, openings: { w: 2 },
  }, rooms: [{ id: 'room', doors: [{ from: 'front', dx: 0.2 }],
    windows: [{ from: 'front', dx: 0.3 }], openings: [{ from: 'front', dx: 0.4 }] }],
  doors: [{ from: 'room.front', dx: 0.2 }],
  roofs: [{ id: 'roof', doors: [{ from: 'front', dx: 0.5 }] }],
  }).config;
  assert.equal(result.rooms[0].doors[0].dx, 'room.w - 1.3');
  assert.equal(result.rooms[0].windows[0].dx, 'room.w - 1.9');
  assert.equal(result.rooms[0].openings[0].dx, 'room.w - 2.4');
  assert.equal(result.doors[0].dx, 'room.w - 1.3');
  assert.equal(result.roofs[0].doors[0].dx, 'roof.w - 1.6');
});

test('roof collections validate surfaces and legacy formats warn at their original properties', () => {
  const errors = FloorPlanValidation.validateRoofOpenings({ roofs: [{ id: 'roof',
    type: 'gable', orientation: 'longitudinal', doors: [{ from: 'front' }],
    windows: [{ from: 'front' }], openings: [{ from: 'front' }],
  }] });
  assert.equal(errors.length, 3);
  const source = FloorPlanParser.parse(`{ config: { openings: { door: { w: 1 } } },
    floors: [{ rooms: [{ openings: [{ type: 'door', from: 'left' }] }] }] }`);
  const warnings = FloorPlanModel.collectDeprecations(source);
  assert.deepEqual(warnings.map(w => w.code), ['opening-defaults', 'opening-type']);
  assert.equal(warnings[1].location.path, 'floors[0].rooms[0].openings[0].type');
  assert.deepEqual(FloorPlanModel.collectDeprecations({ config: { doors: { w: 1 }, windows: { h: 1 }, openings: { w: 2 } }, doors: [{ from: 'r.left' }] }), []);
});

test('schema exposes the collections in each supported context and separate defaults', () => {
  const schema = JSON.parse(fs.readFileSync('floor-plan.schema.json', 'utf8'));
  for (const properties of [schema.properties, ...['room', 'floor', 'roof'].map(k => schema.definitions[k].properties)]) {
    for (const key of ['doors', 'windows', 'openings']) assert.equal(properties[key].type, 'array');
  }
  for (const key of ['doors', 'windows', 'openings']) {
    assert.deepEqual(Object.keys(schema.properties.config.properties[key].properties).filter(k => ['w','h','z0'].includes(k)), ['w', 'h', 'z0']);
  }
});

test('window types and glazing generate distinct facade symbols and validate subdivisions', () => {
  assert.equal(FloorPlanOpenings.windowLines({}).filter(l => l.kind === 'grid').length, 6);
  assert.deepEqual(FloorPlanOpenings.windowAppearance({ type: 'casement', framing: { frame: 0.05, mullion: 0.025, color: '#454545' } }).framing, { frame: 0.05, mullion: 0.025, color: '#454545' });
  assert.deepEqual(FloorPlanOpenings.windowLines({ type: 'fixed', glazing: { columns: 1, rows: 1 } }), []);
  const grid = { columns: 3, rows: 2 };
  for (const type of Object.keys(FloorPlanOpenings.types)) {
    const lines = FloorPlanOpenings.windowLines({ type: type, glazing: grid });
    assert.equal(lines.filter(l => l.kind === 'grid').length, 3);
    assert.equal(lines.some(l => l.kind === 'opening'), type !== 'fixed');
    assert.ok(lines.every(l => l.points.every(n => n >= 0 && n <= 1)));
  }
  for (const columns of [0, -1, 1.5, 33, '2']) assert.throws(() => FloorPlanOpenings.windowAppearance({ glazing: { columns } }), /grade de vidros/);
  assert.throws(() => FloorPlanOpenings.windowAppearance({ type: 'unknown' }), /Tipo de abertura de janela/);
});

test('wall accepts local and qualified references without changing the source', () => {
  const source = { doors: [{ wall: 'front', hinge: 'end', opens: 'outside', angle: 120 }] };
  assert.equal(FloorPlanOpenings.collect(source, { roomId: 'quarto' })[0].from, 'quarto.top');
  assert.equal(source.doors[0].wall, 'front');
  const config = FloorPlanModel.fromConfig({ rooms: [{ id: 'quarto', ...source }], doors: [{ wall: 'quarto.rear' }] }).config;
  assert.equal(config.rooms[0].doors[0].from, 'top');
  assert.equal(config.doors[0].from, 'quarto.bottom');
});

test('door symbols put the hinge and leaf on the correct side for every wall', () => {
  assert.deepEqual(FloorPlanOpenings.doorAppearance({}), { hinge: 'start', opens: 'inside', angle: 90 });
  for (const wall of ['top', 'bottom', 'left', 'right']) {
    for (const hinge of ['start', 'end']) {
      for (const opens of ['inside', 'outside']) {
        const symbol = FloorPlanOpenings.doorSymbol({ wall, hinge, opens, w: 0.8 });
        const horizontal = ['top', 'bottom'].includes(wall);
        const along = horizontal ? 0 : 1;
        const across = 1 - along;
        assert.equal(symbol.origin[along], hinge === 'start' ? 0 : 0.8);
        assert.ok(Math.abs(symbol.finish[along] - symbol.origin[along]) < 1e-9);
        const sign = (['top', 'left'].includes(wall) ? 1 : -1) * (opens === 'inside' ? 1 : -1);
        assert.ok(Math.abs(symbol.finish[across] - sign * 0.8) < 1e-9);
        assert.ok(Math.abs(Math.hypot(...symbol.finish.map((v, i) => v - symbol.origin[i])) - 0.8) < 1e-9);
      }
    }
  }
  for (const value of [{ hinge: 'left' }, { opens: 'from' }, { angle: 0 }, { angle: 181 }, { angle: '90' }]) {
    assert.throws(() => FloorPlanOpenings.doorAppearance(value));
  }
});

test('cartesian reflection mirrors the door hinge along horizontal walls', () => {
  const config = FloorPlanModel.fromConfig({ coordinate_system: 'cartesian', rooms: [{ id: 'room',
    doors: [{ wall: 'front' }, { wall: 'rear', hinge: 'end' }, { wall: 'left' }],
  }] }).config;
  assert.deepEqual(config.rooms[0].doors.map(d => [d.from, d.hinge]), [['top', 'end'], ['bottom', 'start'], ['right', undefined]]);
});
