import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRank, RANK_ORDER } from '../src/lib/ranks.ts';

test('computeRank: unranked below one flight', () => {
  assert.equal(computeRank({ publishedFlights: 0, qualifyingVouches: 0 }), null);
  assert.equal(computeRank({ publishedFlights: 0, qualifyingVouches: 5 }), null);
});

test('computeRank: fledgling at one published flight', () => {
  assert.equal(computeRank({ publishedFlights: 1, qualifyingVouches: 0 }), 'fledgling');
  assert.equal(computeRank({ publishedFlights: 19, qualifyingVouches: 1 }), 'fledgling');
});

test('computeRank: rider needs BOTH 20 flights and 2 qualifying vouches', () => {
  assert.equal(computeRank({ publishedFlights: 20, qualifyingVouches: 2 }), 'rider');
  assert.equal(computeRank({ publishedFlights: 20, qualifyingVouches: 1 }), 'fledgling'); // vouch short
  assert.equal(computeRank({ publishedFlights: 19, qualifyingVouches: 2 }), 'fledgling'); // flight short
  assert.equal(computeRank({ publishedFlights: 100, qualifyingVouches: 9 }), 'rider'); // caps at rider
});

test('computeRank: never returns wingleader (admin grant only)', () => {
  for (const f of [1, 20, 100, 1000]) {
    for (const v of [0, 2, 10]) {
      assert.notEqual(computeRank({ publishedFlights: f, qualifyingVouches: v }), 'wingleader');
    }
  }
});

test('rank order is unranked < fledgling < rider < wingleader', () => {
  assert.ok(RANK_ORDER[''] < RANK_ORDER.fledgling);
  assert.ok(RANK_ORDER.fledgling < RANK_ORDER.rider);
  assert.ok(RANK_ORDER.rider < RANK_ORDER.wingleader);
});
