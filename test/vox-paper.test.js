import test from 'node:test';
import assert from 'node:assert/strict';
import {PAPER_TECHNIQUES, technique, validateAction} from '../src/vox-paper/catalog.js';
import {sampleAction, paperEvents} from '../src/vox-paper/timeline.js';
import {sheetData, circularCutData} from '../src/vox-paper/geometry.js';
import {POSES, crumple, halfFold} from '../src/vox-paper/math.js';

test('paper actions reject invalid timeline values and unknown mechanics', () => {
  assert.throws(() => technique('made-up'));
  for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => validateAction({technique:'page-turn', duration}));
  assert.throws(() => validateAction({technique:'crumple', duration:1}));
  assert.throws(() => sampleAction({technique:'page-turn', duration:2}, Infinity));
});
test('absolute-time paper sampling is independent of seeking history', () => {
  for (const {id, duration} of PAPER_TECHNIQUES) {
    const action = {technique:id, duration, start:4};
    const expected = sampleAction(action, 5);
    for (const t of [100, 4, -5, 4.3]) sampleAction(action, t);
    assert.deepEqual(sampleAction(action, 5), expected);
    assert.equal(sampleAction(action, -1).p, 0);
    assert.equal(sampleAction(action, 100).p, 1);
  }
});
test('crumple holds four 0.5-second poses and changes print only on opening', () => {
  const action = {technique:'crumple', duration:3.2};
  const expected = [.26, .7, 1, .46];
  for (let i = 0; i < 4; i++) {
    for (const offset of [0, .001, .25, .499]) {
      const sample = sampleAction(action, .6 + i * .5 + offset);
      assert.equal(sample.crumpleAmount, expected[i]);
      assert.equal(sample.print, i === 3 ? 'after' : 'before');
    }
  }
  assert.equal(sampleAction(action, 3).crumpleAmount, 0);
  assert.equal(sampleAction(action, 3).print, 'after');
  paperEvents(action).forEach((e, i) => assert.ok(Math.abs(e.at - (.6 + i * .5)) < 1e-9));
});
test('fold geometry preserves distances within each rigid panel and its hinge', () => {
  const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
  for (const p of [0, .25, .5, 1]) {
    assert.deepEqual(halfFold(0, 1, p, 14.4, 8.1), [0, 1, .04]);
    assert.ok(Math.abs(distance(halfFold(2, 1, p), halfFold(5, 3, p)) - Math.sqrt(13)) < 1e-8);
  }
});
test('all deformation families begin flat and stay finite across the sheet', () => {
  for (const [id, pose] of Object.entries(POSES)) for (const p of [0, .1, .5, .9, 1]) {
    for (const x of [-7.23, -7.2, -3, 0, 3, 7.2, 7.23]) for (const y of [-4.08, -4.05, 0, 4.05, 4.08]) {
      const result = pose(x, y, p, 14.4, 8.1);
      assert.ok(result.every(Number.isFinite), `${id} at ${p}`);
      if (p === 0 && Math.abs(y) <= 4.05) assert.ok(Math.hypot(result[0] - x, result[1] - y, result[2] - .04) < 1e-8, `${id} rest`);
    }
  }
  for (const p of [0, .26, .7, 1]) assert.ok(crumple(7, 4, p, 14.4, 8.1).every(Number.isFinite));
});
test('torn halves share exactly the same nonstraight boundary before separation', () => {
  const nx = 8, ny = 12;
  const left = sheetData({bounds:[-7.2,-4.05,0,4.05], tearSide:-1, nx, ny});
  const right = sheetData({bounds:[0,-4.05,7.2,4.05], tearSide:1, nx, ny});
  const xs = [];
  for (let j = 0; j <= ny; j++) {
    const a = (j * (nx + 1) + nx) * 3, b = j * (nx + 1) * 3;
    assert.deepEqual(left.positions.slice(a, a + 3), right.positions.slice(b, b + 3));
    xs.push(left.positions[a]);
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > .01);
});
test('circular aperture has no triangles covering its centre and a matching removable disc', () => {
  const ring = circularCutData(), disc = circularCutData({disc:true});
  for (let i = 0; i < ring.positions.length; i += 6) {
    assert.deepEqual(ring.positions.slice(i, i + 3), disc.positions.slice(i + 3, i + 6));
    assert.ok(Math.hypot(ring.positions[i], ring.positions[i + 1]) > 1.2);
  }
});
test('paper cue times lie within the action, including reversed playback', () => {
  for (const item of PAPER_TECHNIQUES) for (const direction of item.id === 'crumple' ? ['forward'] : ['forward','reverse']) {
    const events = paperEvents({technique:item.id, start:10, duration:item.duration, direction});
    assert.ok(events.every(e => e.at >= 10 && e.at <= 10 + item.duration));
    assert.deepEqual(events.map(e => e.at), events.map(e => e.at).sort((a,b) => a-b));
  }
});
