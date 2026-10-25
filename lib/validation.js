import { getAddress, isAddress } from 'ethers';

export function validateAddress(value, fieldName = 'address') {
  if (typeof value !== 'string' || !isAddress(value)) {
    const error = new TypeError(`${fieldName} must be a valid EVM address.`);
    error.code = 'INVALID_ADDRESS';
    throw error;
  }
  return getAddress(value);
}

export function parseAddressOrNull(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return validateAddress(value.trim());
  } catch {
    return null;
  }
}

export function parseChainId(value = process.env.CHAIN_ID) {
  if (value === undefined || value === '') return 97;
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || ![56, 97].includes(chainId)) {
    const error = new Error('CHAIN_ID must be 97 (BNB Smart Chain Testnet) or 56 (Mainnet).');
    error.code = 'UNSUPPORTED_NETWORK';
    throw error;
  }
  return chainId;
}

export function requireEnvironment(env, names) {
  const missing = names.filter((name) => !env[name] || env[name].trim() === '');
  if (missing.length > 0) {
    const error = new Error(`Missing required configuration: ${missing.join(', ')}.`);
    error.code = 'MISSING_CONFIGURATION';
    throw error;
  }
}