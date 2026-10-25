import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublishableObservation, parseWatchlist } from '../scripts/runMonitor.js';

test('monitor refuses mock, unknown, and non-live observations', () => {
  for (const observation of [
    { status: 'ok', live: false, mock: true, healthFactor: '1.8' },
    { status: 'no_position', live: true, mock: false, healthFactor: null },
    { status: 'ok', live: true, mock: false, healthFactor: null }
  ]) {
    assert.throws(() => assertPublishableObservation(observation), /Refusing/);
  }
});

test('monitor watchlist validates, normalizes, and deduplicates addresses', () => {
  const result = parseWatchlist('0x0000000000000000000000000000000000000001, 0x0000000000000000000000000000000000000001');
  assert.equal(result.length, 1);
  assert.throws(() => parseWatchlist('bad'), /valid EVM address/);
  assert.throws(() => parseWatchlist(''), /at least one/);
});