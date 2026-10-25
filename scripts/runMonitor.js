import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { Contract, JsonRpcProvider, Wallet, isAddress, parseUnits } from 'ethers';
import { createVenusAdapter } from '../adapters/venus.js';
import { classifyHealthFactor, getRiskThresholds } from '../lib/healthFactor.js';
import { parseChainId, requireEnvironment, validateAddress } from '../lib/validation.js';

const REPORT_ABI = ['function report(address watched, uint256 healthFactor, uint8 riskLevel)'];
const RISK_CODES = Object.freeze({ UNKNOWN: 0, SAFE: 1, WARNING: 2, DANGER: 3 });

export function assertPublishableObservation(observation) {
  if (!observation || observation.status !== 'ok' || observation.live !== true || observation.mock === true) {
    throw new Error('Refusing to publish a mock, unknown, or non-live observation.');
  }
  if (classifyHealthFactor(observation.healthFactor) === 'UNKNOWN') {
    throw new Error('Refusing to publish an observation with an unknown health factor.');
  }
}

export function parseWatchlist(value) {
  if (!value || !value.trim()) throw new Error('WATCHLIST must contain at least one wallet address.');
  const normalized = value.split(',').map((address) => validateAddress(address.trim(), 'WATCHLIST entry'));
  return [...new Map(normalized.map((address) => [address.toLowerCase(), address])).values()];
}

export async function runMonitor({ env = process.env, adapter = createVenusAdapter({ env }), providerFactory = (url, chainId) => new JsonRpcProvider(url, chainId) } = {}) {
  requireEnvironment(env, ['RPC_URL', 'PRIVATE_KEY', 'HEALTH_REPORT_ADDRESS', 'WATCHLIST', 'CHAIN_ID']);
  const chainId = parseChainId(env.CHAIN_ID);
  const reportAddress = validateAddress(env.HEALTH_REPORT_ADDRESS, 'HEALTH_REPORT_ADDRESS');
  const watchlist = parseWatchlist(env.WATCHLIST);
  const provider = providerFactory(env.RPC_URL, chainId);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== chainId) throw new Error('RPC chain does not match CHAIN_ID.');

  const wallet = new Wallet(env.PRIVATE_KEY, provider);
  const reportContract = new Contract(reportAddress, REPORT_ABI, wallet);
  const thresholds = getRiskThresholds(env);
  const confirmations = Number(env.REPORT_CONFIRMATIONS || 1);
  if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 12) {
    throw new Error('REPORT_CONFIRMATIONS must be an integer from 1 to 12.');
  }

  for (const watchedAddress of watchlist) {
    const observation = await adapter.getHealth(watchedAddress);
    assertPublishableObservation(observation);
    const riskLevel = classifyHealthFactor(observation.healthFactor, thresholds);
    if (riskLevel === 'UNKNOWN') throw new Error(`Unknown risk for ${watchedAddress}; report not submitted.`);
    const scaledHealthFactor = parseUnits(String(observation.healthFactor), 18);
    const transaction = await reportContract.report(watchedAddress, scaledHealthFactor, RISK_CODES[riskLevel]);
    const receipt = await transaction.wait(confirmations);
    if (!receipt || receipt.status !== 1) throw new Error(`Report transaction failed for ${watchedAddress}.`);
    console.log(JSON.stringify({
      watchedAddress,
      riskLevel,
      chainId,
      transactionHash: transaction.hash,
      confirmed: true
    }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMonitor().catch((error) => {
    console.error(`Monitoring failed (${error.code || 'configuration, data, or transaction error'}). Check configuration and network status; sensitive details are omitted.`);
    process.exitCode = 1;
  });
}