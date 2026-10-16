import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archivedSince, diffSince, hasNews } from '../src/data/visit.js';

const now = Date.now() / 1000;
const ev = (id, o) => ({ id, v: 1, sev: 0.4, d: 0, sn: now - 86400, l: now - 600, imp: 0.2, ...o });
const fakeStore = (events, aliases = {}) => ({
  events,
  aliases: new Map(Object.entries(aliases)),
  aliasOf: (id) => aliases[id] || id,
  raw: { hazards: [], quakes: [] },
});

test('since your last visit: new, changed and heating events', () => {
  const left = now - 5 * 3600;
  const prev = { left, ev: { a: [1, 40, 2, ''], b: [3, 70, 10, ''], c: [2, 40, 0, ''], old: [1, 60, 0, ''] } };
  const store = fakeStore(
    [
      ev('a', { v: 4, sev: 0.66, d: 12 }), // confirmed by more outlets, toll and severity up
      ev('b', { v: 3, sev: 0.7, d: 10 }), // unchanged
      ev('c', { v: 4, sev: 0.4, tr: 'up' }), // more coverage and heating up
      ev('n1', { v: 3, sev: 0.5, sn: now - 3600 }), // new since the visit, several outlets
      ev('n2', { v: 1, sev: 0.3, sn: now - 3600 }), // new but minor: not listed
      ev('n3', { v: 3, sev: 0.5, sn: now - 20 * 3600 }), // existed before the visit, just not remembered
      ev('merged', { v: 2, sev: 0.65, d: 3 }), // the remembered "old" event merged into this one
    ],
    { old: 'merged' },
  );
  const d = diffSince(prev, store);
  assert.deepEqual(d.newEvents.map((e) => e.id), ['n1']);
  const a = d.changes.find((c) => c.e.id === 'a');
  assert.ok(a.what.some((w) => w.k === 'toll' && w.from === 2 && w.to === 12));
  assert.ok(a.what.some((w) => w.k === 'confirmed' && w.to === 4));
  assert.ok(a.what.some((w) => w.k === 'sev'));
  assert.ok(!d.changes.some((c) => c.e.id === 'b'));
  assert.deepEqual(d.heating.map((e) => e.id), ['c']);
  assert.ok(d.changes.some((c) => c.e.id === 'merged'), 'a merged event is compared with its old id');
  assert.ok(hasNews(d));
});

test('after a long absence, notable events that came and went', () => {
  const prev = { left: now - 4 * 86400, ev: {} };
  const store = fakeStore([ev('live', {})]);
  const archive = {
    events: [
      { id: 'x1', v: 5, sev: 0.6, att: 0.8, l: now - 3 * 86400, ti: { en: 'Big story' } },
      { id: 'x2', v: 1, sev: 0.4, att: 0.3, l: now - 3 * 86400, ti: { en: 'Minor story' } },
      { id: 'x3', v: 4, sev: 0.6, att: 0.7, l: now - 6 * 86400, ti: { en: 'Before the last visit' } },
      { id: 'live', v: 4, sev: 0.6, att: 0.7, l: now - 3 * 86400, ti: { en: 'Still in the window' } },
    ],
  };
  assert.deepEqual(archivedSince(prev, archive, store).map((e) => e.id), ['x1']);
});
