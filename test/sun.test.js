const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/3d/sun.js');
const sun = globalThis.FloorPlan3DSun;
const coordinates = [-25.75, -49.25];

test('projects without geographic coordinates still receive ambient and directional light', () => {
  const lights = [];
  class Object3D {
    position = { set(x, y, z) { Object.assign(this, { x, y, z }); } };
  }
  class HemisphereLight {}
  class DirectionalLight extends Object3D {
    shadow = { mapSize: { set() {} }, camera: { updateProjectionMatrix() {} } };
  }
  sun.addToScene({
    THREE: { Object3D, HemisphereLight, DirectionalLight },
    scene: { add(object) { lights.push(object); } },
    position: sun.position({}),
    bounds: { x0: 0, x1: 12, y0: 0, y1: 24, z0: 0, z1: 5 },
  });
  assert.ok(lights.some(light => light instanceof HemisphereLight));
  const daylight = lights.find(light => light instanceof DirectionalLight);
  assert.ok(daylight);
  assert.ok(daylight.position.z > daylight.target.position.z);
});

test('solar defaults use noon for every season', () => {
  const dates = {
    'summer-solstice': '2026-12-21',
    equinox: '2026-03-20',
    'winter-solstice': '2026-06-21',
  };
  for (const season of Object.keys(dates)) {
    assert.deepEqual(
      sun.position({ coordinates, solar: { season } }),
      sun.position({ coordinates, solar: {
        season, dates, date: '2026-03-20', time: '12:00', utc_offset: -3,
      } }),
    );
  }
  assert.deepEqual(sun.position({ coordinates }), sun.position({ coordinates, solar: { season: 'equinox' } }));
});

test('explicit solar dates still override application defaults', () => {
  assert.equal(sun.position({ coordinates, solar: { date: '2027-03-21' } }).date, '2027-03-21');
  assert.equal(sun.position({ coordinates, solar: {
    date: '2027-03-21', dates: { equinox: '2028-03-20' },
  } }).date, '2028-03-20');
});
