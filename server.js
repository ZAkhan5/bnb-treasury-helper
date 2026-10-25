import 'dotenv/config';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createVenusAdapter, AdapterError } from './adapters/venus.js';
import { classifyHealthFactor, getRiskThresholds, healthFactorExplanation } from './lib/healthFactor.js';
import { parseAddressOrNull, parseChainId, validateAddress } from './lib/validation.js';

const VERSION = '1.0.0';

function getOrigin(req, env) {
  const configuredOrigin = env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      return `http://localhost:${Number(env.PORT || 3000)}`;
    }
  }
  try {
    return new URL(`${req.protocol}://${req.get('host')}`).origin;
  } catch {
    return `http://localhost:${Number(env.PORT || 3000)}`;
  }
}

function createAgentCard(origin, env) {
  let chainId = 97;
  try {
    chainId = parseChainId(env.CHAIN_ID);
  } catch {
    chainId = null;
  }
  return {
    name: 'BNB Treasury Health Monitor',
    description: 'Read-only lending-position health monitoring for BNB Smart Chain. Health values are estimates and are not financial advice or liquidation guarantees.',
    category: 'health-factor-monitoring',
    version: VERSION,
    capabilities: ['read-lending-position-health', 'explain-liquidation-risk', 'record-explicit-health-reports'],
    endpoints: {
      health: `${origin}/health`,
      monitor: `${origin}/monitor`,
      agentCard: `${origin}/.well-known/agent-card.json`
    },
    chainId,
    agentRegistry: parseAddressOrNull(env.ERC8004_REGISTRY_ADDRESS),
    agentId: env.ERC8004_AGENT_ID?.trim() || null,
    owner: parseAddressOrNull(env.OWNER_ADDRESS)
  };
}

export function createApp({ env = process.env, adapter = createVenusAdapter({ env }) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === 'true');
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use(rateLimit({
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
    limit: Number(env.RATE_LIMIT_MAX || 30),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests; try again later.' }
  }));

  app.get('/', (req, res) => {
    const origin = getOrigin(req, env);
    res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BNB Treasury Health Monitor</title><body><h1>BNB Treasury Health Monitor</h1><p>Read-only lending health monitoring for BNB Smart Chain (testnet by default; mainnet via configuration).</p><p>Protocol data can be unavailable or approximate. Health-factor estimates are not a guarantee of safety, liquidation avoidance, campaign eligibility, or rewards.</p><ul><li><a href="${origin}/health">Service health</a></li><li><a href="${origin}/.well-known/agent-card.json">Agent card</a></li></ul><p>POST a wallet address to <code>/monitor</code> to request an observation. This endpoint never sends transactions.</p></body></html>`);
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', version: VERSION, uptimeSeconds: Math.floor(process.uptime()) }));

  app.get('/.well-known/agent-card.json', (req, res) => {
    res.json(createAgentCard(getOrigin(req, env), env));
  });

  app.post('/monitor', async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send a JSON request body.' });
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: 'Request body must be a JSON object.' });
    }
    let watchedAddress;
    try {
      watchedAddress = validateAddress(req.body.address, 'address');
    } catch {
      return res.status(400).json({ error: 'INVALID_ADDRESS', message: 'address must be a valid EVM address.' });
    }

    let chainId;
    try {
      chainId = parseChainId(env.CHAIN_ID);
    } catch {
      return res.status(422).json({
        watchedAddress,
        chainId: null,
        healthFactor: null,
        riskLevel: 'UNKNOWN',
        explanation: 'The configured network is unsupported.',
        source: 'unavailable',
        timestamp: new Date().toISOString(),
        live: false,
        mock: false,
        error: 'UNSUPPORTED_NETWORK'
      });
    }

    try {
      const observation = await adapter.getHealth(watchedAddress);
      const thresholds = getRiskThresholds(env);
      const riskLevel = observation.status === 'ok'
        ? classifyHealthFactor(observation.healthFactor, thresholds)
        : 'UNKNOWN';
      const result = {
        watchedAddress,
        chainId,
        healthFactor: observation.healthFactor,
        riskLevel,
        explanation: observation.explanation || healthFactorExplanation(riskLevel, observation.healthFactor),
        source: observation.source,
        timestamp: observation.timestamp,
        live: observation.live,
        mock: observation.mock
      };
      return res.json(result);
    } catch (error) {
      const adapterError = error instanceof AdapterError ? error : null;
      const statusCode = adapterError?.statusCode || 502;
      return res.status(statusCode).json({
        watchedAddress,
        chainId,
        healthFactor: null,
        riskLevel: 'UNKNOWN',
        explanation: 'Health data is currently unavailable; no liquidation-risk conclusion is available.',
        source: 'unavailable',
        timestamp: new Date().toISOString(),
        live: false,
        mock: false,
        error: adapterError?.code || 'UPSTREAM_FAILURE'
      });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'REQUEST_TOO_LARGE', message: 'Request body exceeds 16 KB.' });
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'INVALID_JSON', message: 'Request body must contain valid JSON.' });
    }
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  });
  return app;
}

const app = createApp();
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => console.log(`BNB Treasury Health Monitor listening on port ${port}`));
}