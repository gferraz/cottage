const { test } = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
for (const name of ['config/catalog', 'models/geometry-box', 'models/geometry',
  'models/geometry-domain', 'views/elements', 'main']) require(`../src/${name}.js`);

function setup(item, z0 = 0) {
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    itemTypes: FloorPlanCatalog.items, currentFloorHeight: 0,
  });
  const floor = { z0, items: [item] };
  return { plan, items: FloorPlanElements.items(plan, floor) };
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('optional square nightstands keep the bed footprint and inherit its elevation and height', () => {
  const bed = { id: 'bed', type: 'queen-bed', pos: [2, 3], nightstand: { w: 0.5 } };
  const original = structuredClone(bed);
  const { plan, items } = setup(bed, 3);
  assert.equal(items.length, 3);
  const [left, right] = items.slice(1).map((item) => plan.resolveItemType(item));
  left.pos.forEach((value, index) => close(value, [1.5, 3, 3][index]));
  right.pos.forEach((value, index) => close(value, [3.6, 3, 3][index]));
  assert.deepEqual(left.size, [0.5, 0.5, 0.55]);
  assert.deepEqual(right.size, left.size);
  assert.equal(left.id, 'bed-nightstand-left');
  assert.equal(right.id, 'bed-nightstand-right');
  assert.deepEqual(plan.resolveItemType(bed).size, [1.6, 2, 0.55]);
  assert.deepEqual(bed, original);
  assert.equal(plan.currentFloorHeight, 0);
  assert.equal(setup({ type: 'queen-bed', pos: [0, 0] }).items.length, 1);
});

test('nightstand centers follow the bed rotation, including arbitrary angles', () => {
  for (const rotation of [0, 90, 180, 270, 37]) {
    const { plan, items } = setup({ type: 'queen-bed', pos: [2, 3], rotation,
      size: [1.8, 2.2, 0.7], nightstand: { w: 0.4 } });
    const angle = rotation * Math.PI / 180;
    items.slice(1).forEach((item, index) => {
      const stand = plan.resolveItemType(item);
      const dx = (index === 0 ? -1 : 1) * 1.1;
      const dy = -0.9;
      close(stand.pos[0] + 0.2, 2.9 + dx * Math.cos(angle) - dy * Math.sin(angle));
      close(stand.pos[1] + 0.2, 4.1 + dx * Math.sin(angle) + dy * Math.cos(angle));
      assert.deepEqual(stand.size, [0.4, 0.4, 0.7]);
      assert.equal(stand.rotation, rotation);
    });
  }
});

test('catalog defaults work for twin beds and local widths override them', () => {
  const { plan } = setup({});
  plan.itemTypes = { ...plan.itemTypes, 'twin-bed': {
    ...plan.itemTypes['twin-bed'], nightstand: { w: 0.4 },
  } };
  for (const width of [undefined, 0.6]) {
    const bed = { type: 'twin-bed', pos: [0, 0],
      ...(width ? { nightstand: { w: width } } : {}) };
    const items = FloorPlanElements.items(plan, { items: [bed] });
    assert.deepEqual(plan.resolveItemType(items[1]).size, [width ?? 0.4, width ?? 0.4, 0.55]);
  }
});

test('invalid widths and unsupported options produce actionable errors', () => {
  const { plan } = setup({});
  for (const nightstand of [{}, null, [], { w: 0 }, { w: -1 }, { w: 'bad' }, { w: 0.5, gap: 0.1 }]) {
    assert.throws(() => plan.resolveItemType({ type: 'queen-bed', nightstand }), /Nightstand|geometric reference/);
  }
  assert.throws(() => plan.resolveItemType({ type: 'armchair', nightstand: { w: 0.5 } }), /camas/);
});

test('generated nightstands have lazy references and appear in global 3D lists', () => {
  require('../src/models/references.js');
  require('../src/models/openings.js');
  const bed = { id: 'bed', type: 'queen-bed', pos: [2, 3], nightstand: { w: 0.5 } };
  const { plan } = setup(bed);
  const config = { floors: [{ id: 'upper', z0: 3, items: [bed] }] };
  Object.assign(plan, { references: new Map(), roomDefinitions: new Map(), roomReferences: new Map() });
  FloorPlanReferences.registerStaticItemReferences(plan, config);
  close(plan.references.get('bed-nightstand-left').x0(), 1.5);
  close(plan.references.get('bed-nightstand-right').z1(), 3.55);
  FloorPlanReferences.prepareGlobalLists(plan, config);
  assert.equal(plan.allItems.length, 3);
  assert.deepEqual(plan.allItems.map((item) => item.z0), [3, 3, 3]);
  assert.deepEqual(plan.allItems.map((item) => item.floorId), ['upper', 'upper', 'upper']);
  assert.equal(plan.currentFloorHeight, 0);
});

test('twin beds default to the right and support either side or both through rotation', () => {
  for (const side of [undefined, 'left', 'right', 'both']) {
    for (const rotation of [0, 90, 180, 270, 37]) {
      const bed = { id: 'twin', type: 'twin-bed', pos: [2, 3], rotation,
        nightstand: { w: 0.4, ...(side ? { side } : {}) } };
      const { plan, items } = setup(bed, 3);
      const expectedSides = side === 'both' ? ['left', 'right'] : [side ?? 'right'];
      assert.equal(items.length, 1 + expectedSides.length);
      const angle = rotation * Math.PI / 180;
      items.slice(1).forEach((item, index) => {
        const stand = plan.resolveItemType(item);
        assert.equal(stand.id, `twin-nightstand-${expectedSides[index]}`);
        const dx = (expectedSides[index] === 'left' ? -1 : 1) * (0.97 + 0.4) / 2;
        const dy = (0.4 - 1.91) / 2;
        close(stand.pos[0] + 0.2, 2.485 + dx * Math.cos(angle) - dy * Math.sin(angle));
        close(stand.pos[1] + 0.2, 3.955 + dx * Math.sin(angle) + dy * Math.cos(angle));
        assert.deepEqual(stand.size, [0.4, 0.4, 0.55]);
        assert.equal(stand.pos[2], 3);
        assert.equal(stand.rotation, rotation);
      });
    }
  }
});

test('nightstand side defaults can be set in the catalog and overridden locally', () => {
  const { plan } = setup({});
  plan.itemTypes = { ...plan.itemTypes, 'twin-bed': {
    ...plan.itemTypes['twin-bed'], nightstand: { w: 0.4, side: 'left' },
  } };
  for (const side of [undefined, 'both']) {
    const bed = { id: 'twin', type: 'twin-bed', pos: [0, 0],
      ...(side ? { nightstand: { w: 0.5, side } } : {}) };
    const items = FloorPlanElements.items(plan, { items: [bed] });
    assert.equal(items.length, side === 'both' ? 3 : 2);
    assert.equal(items[1].id, 'twin-nightstand-left');
    plan.resolveItemType(items[1]);
  }
  for (const side of ['rigth', '', null, 1]) {
    assert.throws(() => plan.resolveItemType({ type: 'twin-bed', nightstand: { w: 0.4, side } }), /Nightstand.side/);
  }
});
