const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const FloorPlan = vm.runInNewContext(fs.readFileSync('src/main.js', 'utf8') + '\nFloorPlan;', {
  window: {}, FloorPlanWalls: { renderIndependentWalls(plan) { plan.independentRendered = true; } },
});
function fixture(showAllFloors) {
  const config = { floors: [
    { id: 'ground', z0: 0, rooms: [{ id: 'office' }], items: [{ id: 'bed' }], openings: [{ id: 'door' }] },
    { id: 'upper', z0: 3, rooms: [{ id: 'bedroom' }], items: [{ id: 'desk' }], openings: [{ id: 'window' }] },
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
  assert.deepEqual(calls, ['ground', 'upper']);
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
