const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const geometry = { x: 0, y: 0, w: 3, l: .68, z0: -.3, z1: 0, h: .3 };
const dom = vm.runInNewContext(fs.readFileSync('src/views/dom.js', 'utf8') + '\nFloorPlanDom;', {
  window: {}, FloorPlanGeometryDomain: { normalizeRoomGeometry: () => ({ nominalGeometry: geometry, normalizedParts: [geometry] }) },
});
test('first-class stair plan elements keep references but do not add room count, area or area labels', () => {
  let removed = 0;
  const element = { dataset: {}, x0: () => 0, y0: () => 0, w: () => 3, l: () => .68,
    area: () => 2.04, querySelector: () => null, querySelectorAll: () => [{ remove() { removed++; } }] };
  const root = {};
  const plan = { root, roomElements: [], stairElements: [], roomCount: 4, roomArea: 45,
    roomDefinitions: new Map(), rooms: new Map(), references: new Map(), add: () => element,
    normalizeOverlapTargets: () => [], formatMeters: String,
    updateOverlaps: () => assert.fail('individual staircase must not update room metrics'),
    updateSummary: () => assert.fail('individual staircase must not update room summary'),
  };
  const result = dom.addRoom(plan, { id: 'entry', label: 'Escada frontal', firstClassStair: true });
  assert.equal(result.dataset.kind, 'stair');
  assert.equal(plan.stairElements[0], element);
  assert.equal(plan.roomElements.length, 0);
  assert.equal(plan.roomCount, 4);
  assert.equal(plan.roomArea, 45);
  assert.equal(plan.references.get('entry'), element);
  assert.equal(removed, 1);
});
