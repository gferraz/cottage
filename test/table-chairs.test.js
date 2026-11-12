const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/geometry-box', 'models/geometry',
  'models/geometry-domain', 'models/references', 'models/openings', 'views/elements', 'main']) require(`../src/${name}.js`);
function prepare(table, z0 = 0) {
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    itemTypes: FloorPlanCatalog.items, currentFloorHeight: 0, references: new Map(), partReferenceStack: [],
  });
  const floor = { z0, items: [table] };
  const items = FloorPlanElements.items(plan, floor);
  const chairs = items.slice(1).map(item => plan.resolveItemType(item));
  return { plan, floor, items, chairs };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('rectangular tables calculate chairs on all four sides with 5 cm clearance', () => {
  for (const [size, count] of [[[1.8, 0.9, 0.75], 8], [[2.7, 1.1], 10]]) {
    const table = { id: 'table', type: 'dining-table', pos: [0, 0], size };
    const { chairs } = prepare(table);
    assert.equal(chairs.length, count);
    const centers = chairs.map(chair => [chair.pos[0] + 0.225, chair.pos[1] + 0.225]);
    const top = centers.filter(([, y]) => Math.abs(y + 0.275) < 1e-8);
    const bottom = centers.filter(([, y]) => Math.abs(y - size[1] - 0.275) < 1e-8);
    assert.equal(top.length, Math.floor((size[0] + 1e-9) / 0.6));
    assert.equal(bottom.length, top.length);
    assert.equal(centers.filter(([x]) => Math.abs(x + 0.275) < 1e-8).length, 1);
    assert.equal(centers.filter(([x]) => Math.abs(x - size[0] - 0.275) < 1e-8).length, 1);
    close(top.reduce((sum, [x]) => sum + x, 0) / top.length, size[0] / 2);
    chairs.forEach((chair, index) => {
      assert.equal(chair.id, `table-chair-${index + 1}`);
      assert.deepEqual(chair.size, [0.45, 0.45, 0.85]);
    });
  }
});

test('round and oval tables place inward-facing chairs around their perimeter', () => {
  for (const [w, l, expected] of [[1.2, 1.2, 6], [2, 1, 8]]) {
    const { chairs } = prepare({ classes: 'table round-table', pos: [0, 0], size: [w, l, 0.75] });
    assert.equal(chairs.length, expected);
    for (const chair of chairs) {
      const angle = chair.rotation * Math.PI / 180;
      // The back is local +Y; the seat's front points inward.
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const edgeX = chair.pos[0] + 0.225 - nx * 0.275;
      const edgeY = chair.pos[1] + 0.225 - ny * 0.275;
      close(((edgeX - w / 2) / (w / 2)) ** 2 + ((edgeY - l / 2) / (l / 2)) ** 2, 1);
    }
  }
});

test('chairs follow arbitrary table rotation and floor elevation without mutating input', () => {
  const base = { type: 'dining-table', pos: [2, 3] };
  const original = structuredClone(base);
  const zero = prepare(base).chairs;
  for (const rotation of [90, 180, 270, 37]) {
    const { chairs } = prepare({ ...base, rotation }, 3);
    const angle = rotation * Math.PI / 180;
    chairs.forEach((chair, index) => {
      const dx = zero[index].pos[0] + 0.225 - 2.9;
      const dy = zero[index].pos[1] + 0.225 - 3.45;
      close(chair.pos[0] + 0.225, 2.9 + dx * Math.cos(angle) - dy * Math.sin(angle));
      close(chair.pos[1] + 0.225, 3.45 + dx * Math.sin(angle) + dy * Math.cos(angle));
      assert.equal(chair.pos[2], 3);
      assert.equal(chair.rotation, (zero[index].rotation + rotation) % 360);
    });
  }
  assert.deepEqual(base, original);
});

test('chairs: 0 disables automatic chairs; unsupported settings are rejected', () => {
  assert.equal(prepare({ type: 'dining-table', pos: [0, 0], chairs: 0 }).chairs.length, 0);
  const { plan } = prepare({ type: 'dining-table', pos: [0, 0] });
  for (const chairs of [false, true, -1, 4, '0', null]) {
    assert.throws(() => plan.resolveItemType({ type: 'dining-table', chairs }), /Chairs/);
  }
});

test('static references and global lists include chairs even when the table references a later item', () => {
  const table = { id: 'table', type: 'dining-table', pos: ['anchor.x1', 0] };
  const { plan } = prepare({ type: 'dining-table', pos: [0, 0] });
  const floor = { id: 'upper', z0: 3, items: [table, { id: 'anchor', pos: [0, 0], size: [1, 1] }] };
  FloorPlanReferences.registerStaticItemReferences(plan, { floors: [floor] });
  assert.ok(plan.references.has('table-chair-8'));
  close(plan.references.get('table-chair-1').z0(), 3);
  Object.assign(plan, { roomDefinitions: new Map(), roomReferences: new Map() });
  FloorPlanReferences.prepareGlobalLists(plan, { floors: [floor] });
  assert.equal(plan.allItems.filter(item => item.classes?.includes('chair')).length, 8);
});
