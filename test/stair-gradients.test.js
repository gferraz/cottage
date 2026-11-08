const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
globalThis.window = globalThis;
require('../src/models/geometry.js');
require('../src/views/dom.js');
const geometry = FloorPlanGeometry;
const range = { base: 0, top: 3 };
const element = () => ({ dataset: {}, properties: {}, style: { setProperty(key, value, priority) {
  this.owner.properties[key] = { value, priority };
} } });
const painted = (part) => {
  const target = element(); target.style.owner = target;
  FloorPlanDom.applyStairGradient(target, part, range);
  return target;
};

test('all flights and landings share one range relative to their source floor', () => {
  const parts = [{ z0: 0, z1: 1 }, { z0: 1, z1: 1 }, { z0: 1, z1: 2 },
    { z0: 2, z1: 2 }, { z0: 2, z1: 3 }];
  assert.deepEqual(geometry.stairGradientRange(0, parts), range);
  const elevated = geometry.stairGradientRange(3, parts.map(p => ({ z0: p.z0 + 3, z1: p.z1 + 3 })));
  for (const height of [0, 1, 2, 3]) {
    assert.equal(geometry.stairGradientRatio(height, range), geometry.stairGradientRatio(height + 3, elevated));
  }
  assert.equal(geometry.stairGradientRatio(-1, range), 0);
  assert.equal(geometry.stairGradientRatio(4, range), 1);
  assert.equal(geometry.stairGradientRatio(0, { base: 0, top: 0 }), 0);
});

test('plan colors continue across flights and match the connecting landing', () => {
  const part = { x: 0, y: 0, w: 1.4, l: 1.4, z0: 0, z1: 1, h: 1,
    stairAxis: 'vertical', stairDirection: 'forward', stairRise: 'up' };
  const lower = painted(part).properties.background.value;
  const middle = painted({ ...part, z0: 1, z1: 2 }).properties.background.value;
  const upper = painted({ ...part, z0: 2, z1: 3 }).properties.background.value;
  const landing = painted({ ...part, z0: 1, z1: 1, h: 0 });
  assert.ok(lower.includes('66.6667%)'));
  assert.ok(middle.includes('33.3333%)'));
  assert.ok(upper.includes('0.0000%)'));
  assert.equal(landing.properties.background.value, 'color-mix(in srgb, var(--theme-circulation), var(--theme-roof-gradient-dark) 66.6667%)');
  assert.equal(landing.properties.background.priority, 'important');
  assert.equal(landing.dataset.stairGradient, 'height');
});

test('plan tread colors follow rise and direction for horizontal and vertical flights', () => {
  const part = { w: 1.4, l: 1.4, z0: 1, z1: 2, h: 1, stairAxis: 'horizontal', stairDirection: 'reverse', stairRise: 'up' };
  const reverse = painted(part).properties.background.value;
  const forward = painted({ ...part, stairRise: 'down' }).properties.background.value;
  assert.ok(reverse.startsWith('linear-gradient(to right, color-mix(in srgb, var(--theme-circulation), var(--theme-roof-gradient-dark) 33.3333%)'));
  assert.ok(forward.startsWith('linear-gradient(to right, color-mix(in srgb, var(--theme-circulation), var(--theme-roof-gradient-dark) 61.1111%)'));
  assert.ok(painted({ ...part, stairAxis: 'vertical' }).properties.background.value.startsWith('linear-gradient(to bottom'));
});

test('3D tread and landing at equal heights receive equal colors without changing the shared material', () => {
  class Color {
    constructor(value) { this.value = value; }
    convertLinearToSRGB() { return this; }
    convertSRGBToLinear() { return this; }
    lerp(other, ratio) { this.value = `${this.value}:${other.value}:${ratio}`; return this; }
    copy(other) { this.value = other.value; return this; }
  }
  const material = () => ({ color: new Color('base'), clone: material });
  const elements = vm.runInNewContext(fs.readFileSync('src/views/3d/elements.js', 'utf8') + '\nFloorPlan3DElements;', {
    FloorPlanGeometry: geometry,
    getComputedStyle: () => ({ getPropertyValue: key => key === '--theme-circulation' ? 'rgba(245, 238, 222, 0.95)' : '#a84f31' }),
  });
  const original = material();
  const first = elements.heightMaterial({ root: {} }, { Color }, original, { stairGradient: range }, 1);
  const second = elements.heightMaterial({ root: {} }, { Color }, original, { stairGradient: range }, 1);
  assert.equal(first.color.value, second.color.value);
  assert.ok(first.color.value.startsWith('rgb(245, 238, 222):#a84f31:'));
  assert.equal(original.color.value, 'base');
  assert.notEqual(first, second);
});
