import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHealthFactor, getRiskThresholds } from '../lib/healthFactor.js';
import { validateAddress } from '../lib/validation.js';

test('classifies configured health-factor boundaries', () => {
  assert.equal(classifyHealthFactor('1.5'), 'SAFE');
  assert.equal(classifyHealthFactor(1.49), 'WARNING');
  assert.equal(classifyHealthFactor(1.2), 'WARNING');
  assert.equal(classifyHealthFactor(1.19), 'DANGER');
  assert.equal(classifyHealthFactor(null), 'UNKNOWN');
  assert.equal(classifyHealthFactor(-1), 'UNKNOWN');
});

test('rejects invalid addresses and accepts a valid wallet address', () => {
  assert.throws(() => validateAddress('not-an-address'), { code: 'INVALID_ADDRESS' });
  assert.equal(validateAddress('0x0000000000000000000000000000000000000001'), '0x0000000000000000000000000000000000000001');
});

test('rejects missing and inconsistent threshold configuration', () => {
  assert.deepEqual(getRiskThresholds({}), { warningThreshold: 1.5, dangerThreshold: 1.2 });
  assert.throws(() => getRiskThresholds({ HEALTH_FACTOR_WARNING: '1.1', HEALTH_FACTOR_DANGER: '1.2' }), /danger must be below warning/);
});