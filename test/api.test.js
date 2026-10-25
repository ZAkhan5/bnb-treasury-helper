import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server.js';
import { createVenusAdapter } from '../adapters/venus.js';

const address = '0x0000000000000000000000000000000000000001';

test('health endpoint returns service status', async () => {
  const response = await request(createApp({ env: {} })).get('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
});

test('agent card exposes schema and null registration placeholders', async () => {
  const response = await request(createApp({ env: { PUBLIC_BASE_URL: 'https://monitor.example' } }))
    .get('/.well-known/agent-card.json');
  assert.equal(response.status, 200);
  assert.equal(response.body.category, 'health-factor-monitoring');
  assert.equal(response.body.chainId, 97);
  assert.equal(response.body.agentRegistry, null);
  assert.equal(response.body.agentId, null);
  assert.equal(response.body.endpoints.monitor, 'https://monitor.example/monitor');
});

test('agent card uses the actual request origin when no public origin is configured', async () => {
  const response = await request(createApp({ env: {} })).get('/.well-known/agent-card.json');
  assert.equal(response.body.endpoints.health, `http://${response.request.host}/health`);
});

test('monitor rejects invalid wallet addresses', async () => {
  const response = await request(createApp({ env: {} })).post('/monitor').send({ address: 'bad' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'INVALID_ADDRESS');
});

test('monitor labels explicitly enabled mock observations', async () => {
  const env = { CHAIN_ID: '97', MOCK_MODE: 'true', NODE_ENV: 'test' };
  const adapter = createVenusAdapter({ env });
  const response = await request(createApp({ env, adapter })).post('/monitor').send({ address });
  assert.equal(response.status, 200);
  assert.equal(response.body.healthFactor, '1.75');
  assert.equal(response.body.riskLevel, 'SAFE');
  assert.equal(response.body.live, false);
  assert.equal(response.body.mock, true);
  assert.match(response.body.source, /^MOCK:/);
});

test('missing live configuration is safely reported as unknown', async () => {
  const response = await request(createApp({ env: { CHAIN_ID: '97' } })).post('/monitor').send({ address });
  assert.equal(response.status, 503);
  assert.equal(response.body.riskLevel, 'UNKNOWN');
  assert.equal(response.body.error, 'MISSING_CONFIGURATION');
  assert.equal(JSON.stringify(response.body).includes('stack'), false);
});