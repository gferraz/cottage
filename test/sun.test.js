const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../src/views/3d/sun.js');
const sun = globalThis.FloorPlan3DSun;
const coordinates = [-25.75, -49.25];

test('solar defaults preserve the previous configured position for every season', () => {
  const dates = {
    'summer-solstice': '2026-12-21',
    equinox: '2026-03-20',
    'winter-solstice': '2026-06-21',
  };
  for (const season of Object.keys(dates)) {
    assert.deepEqual(
      sun.position({ coordinates, solar: { season } }),
      sun.position({ coordinates, solar: {
        season, dates, date: '2026-03-20', time: '15:00', utc_offset: -3,
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
