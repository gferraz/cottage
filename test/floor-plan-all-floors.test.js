const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
globalThis.window = globalThis;
require('../src/models/openings.js');
const FloorPlan = vm.runInNewContext(fs.readFileSync('src/main.js', 'utf8') + '\nFloorPlan;', {
  window: {}, FloorPlanOpenings: globalThis.FloorPlanOpenings, FloorPlanWalls: { renderIndependentWalls(plan) { plan.independentRendered = true; } },
});
function fixture(showAllFloors) {
  const config = { floors: [
    { id: 'ground', z0: 0, rooms: [{ id: 'office' }], items: [{ id: 'bed' }], doors: [{ id: 'door' }] },
    { id: 'upper', z0: 3, rooms: [{ id: 'bedroom' }], items: [{ id: 'desk' }], windows: [{ id: 'window' }] },
  ] };
  const calls = [];
  const plan = Object.assign(Object.create(FloorPlan.prototype), {
    showAllFloors, currentFloorId: 'upper', currentFloorHeight: 3, errors: [],
    roomDefinitions: new Map(config.floors.flatMap(floor => floor.rooms.map(room => [room.id, room]))),
    addRooms(rooms) { this.roomElements.push(...rooms.map(room => ({ id: room.id, floor: this.currentFloorId, dataset: {} }))); },
    addSpanningStairs() { calls.push('spanning'); },
    addVisibleVerticalOpenings() { calls.push('projection'); },
    updateOverlaps() {
      assert.equal(new Set(this.roomElements.map(room => room.floor)).size, 1);
      this.errors = this.errors.filter(error => error.category !== 'collision');
      this.errors.push({ category: 'collision', id: this.currentFloorId });
    },
    renderWallsForFloor(floor) { calls.push(floor.id); },
    addZones() {}, visibleZones() { return []; },
    addItem(item) { this.itemElements.push({ ...item, dataset: {} }); },
    roomOpenings() { return []; }, isVerticalOpening() { return false; },
    addOpening(opening) { this.openings.push(opening); }, addWindow() {},
  });
  return { plan, config, calls };
}

test('all floors render rooms, furniture and openings while validating each floor separately', () => {
  const { plan, config, calls } = fixture(true);
  plan.renderPlanFloors(config, config.floors[1]);
  assert.equal(plan.roomElements.map(room => room.id).join(','), 'office,bedroom');
  assert.equal(plan.itemElements.map(item => item.id).join(','), 'bed,desk');
  assert.equal(plan.openings.map(opening => opening.id).join(','), 'door,window');
  assert.equal(plan.roomElements[0].dataset.floorId, 'ground');
  assert.equal(plan.errors.map(error => error.id).join(','), 'ground,upper');
  assert.deepEqual(calls, ['ground', 'projection', 'upper', 'projection']);
  assert.equal(plan.currentFloorId, 'upper');
  assert.equal(plan.currentFloorHeight, 3);
  assert.equal(plan.independentRendered, true);
});

test('single floor keeps its existing stairs and vertical opening projections', () => {
  const { plan, config, calls } = fixture(false);
  plan.renderPlanFloors(config, config.floors[1]);
  assert.equal(plan.roomElements.map(room => room.id).join(','), 'bedroom');
  assert.equal(plan.itemElements.map(item => item.id).join(','), 'desk');
  assert.deepEqual(calls, ['spanning', 'upper', 'projection']);
});

test('first-class stairs render in their scoped floor without becoming rooms', () => {
  const { plan, config } = fixture(true);
  plan.allStairs = [
    { id: 'entry', floorId: 'ground', stair: { id: 'entry' } },
    { id: 'upper-flight', floorId: 'upper', stair: { id: 'upper-flight' } },
    { id: 'invalid', floorId: 'upper', stair: { id: 'invalid' } },
  ];
  plan.invalidRoomIds = new Set(['invalid']);
  plan.addRoom = function (stair) {
    assert.equal(stair.firstClassStair, true);
    this.stairElements.push({ id: stair.id, dataset: {} });
  };
  plan.renderPlanFloors(config, config.floors[1]);
  assert.equal(plan.roomElements.map(room => room.id).join(','), 'office,bedroom');
  assert.equal(plan.stairElements.map(stair => `${stair.id}:${stair.dataset.floorId}`).join(','), 'entry:ground,upper-flight:upper');
});

test('independent selections render exactly the requested floors, including none', () => {
  const { plan, config } = fixture(true);
  config.floors.push({ id: 'roof', z0: 6, rooms: [{ id: 'attic' }], items: [] });
  plan.roomDefinitions.set('attic', config.floors[2].rooms[0]);
  plan.selectedFloorIds = new Set(['ground', 'roof']);
  plan.renderPlanFloors(config, config.floors[0]);
  assert.equal(plan.roomElements.map(room => room.id).join(','), 'office,attic');
  assert.equal(plan.itemElements.map(item => item.id).join(','), 'bed');
  plan.selectedFloorIds.clear();
  plan.renderPlanFloors(config, config.floors[0]);
  assert.equal(plan.roomElements.length, 0);
  assert.equal(plan.itemElements.length, 0);
  assert.equal(plan.openings.length, 0);
});

test('combined upper sectors draw a vertical opening once on its source floor', () => {
  const opening = { from: 'upper-rear', to: 'ground', rectangle: [0, 0, 2, 3] };
  const config = { floors: [
    { id: 'ground' }, { id: 'upper-front' }, { id: 'upper-rear', openings: [opening] },
  ] };
  const rendered = [];
  const plan = {
    showAllFloors: true, errors: [], isVerticalOpening: () => true,
    addVerticalOpening: (value, floor) => rendered.push([value, floor.id]),
  };
  for (const floor of config.floors)
    FloorPlanOpenings.addVisibleVerticalOpenings(plan, config, floor);
  assert.deepEqual(rendered, [[{ ...opening, type: 'opening' }, 'upper-rear']]);
});

test('combined floors clip projected stairs to the opening without adding lower-floor duplicates', () => {
  const stair = { style: {}, x0: () => 0, y0: () => 0, w: () => 5, l: () => 2.4 };
  let projections = 0;
  const plan = {
    currentConfig: { floors: [{ id: 'ground', z0: 0 }, { id: 'upper', z0: 3 }] },
    showAllFloors: true,
    normalizeGeometryAtFloor: () => ({ x: 0, y: 0, w: 3, l: 2.4 }),
    add: () => ({ dataset: {} }),
    root: { querySelectorAll: () => [stair] },
    clipProjection: (...args) => FloorPlanOpenings.clipProjection(plan, ...args),
    renderLowerFloorProjection: () => { projections++; },
  };
  FloorPlanOpenings.addVerticalOpening(plan,
    { from: 'upper', to: 'ground' }, { id: 'upper' });
  assert.equal(stair.style.clipPath, "inset(calc(0 * var(--m)) calc(2 * var(--m)) calc(0 * var(--m)) calc(0 * var(--m)))");
  assert.equal(projections, 0);
});

test('configured visibility initializes selections and resets session overrides', () => {
  const plan = Object.create(FloorPlan.prototype);
  plan.currentConfig = { floors: [{ id: 'shown' }, { id: 'hidden', visible: false }, { id: 'explicit', visible: true }] };
  plan.allRoofs = [{ id: 'roof-a', visible: false }, { id: 'roof-b', visible: true }];
  plan.allSlabs = [{ key: 'shown:a', visible: false }, { key: 'shown:b' }];
  plan.resetVisibility();
  assert.deepEqual([...plan.selectedFloorIds], ['shown', 'explicit']);
  assert.deepEqual([...plan.hiddenRoofs], ['roof-a']);
  assert.deepEqual([...plan.hiddenSlabs], ['shown:a']);
  assert.equal(plan.showRoofs, true);
  plan.selectedFloorIds.clear();
  plan.hiddenSlabs.clear();
  plan.hiddenRoofs.clear();
  plan.resetVisibility();
  assert.equal(plan.selectedFloorIds.size, 2);
  assert.equal(plan.hiddenSlabs.size, 1);
  assert.equal(plan.hiddenRoofs.size, 1);
});
