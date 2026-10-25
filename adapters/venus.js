import { Contract, JsonRpcProvider, formatUnits, isAddress } from 'ethers';
import { parseChainId, requireEnvironment, validateAddress } from '../lib/validation.js';

const COMPTROLLER_ABI = [
  'function getAssetsIn(address account) view returns (address[])',
  'function getAccountLiquidity(address account) view returns (uint256 error, uint256 liquidity, uint256 shortfall)',
  'function getAccountSnapshot(address account) view returns (uint256 error, uint256 tokenBalance, uint256 borrowBalance, uint256 exchangeRateMantissa)'
];
const V_TOKEN_ABI = [
  'function underlying() view returns (address)',
  'function decimals() view returns (uint8)'
];
const ERC20_ABI = ['function decimals() view returns (uint8)'];
const ORACLE_ABI = ['function getUnderlyingPrice(address vToken) view returns (uint256)'];

export class AdapterError extends Error {
  constructor(message, code, statusCode = 502) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toAdapterError(error) {
  if (error instanceof AdapterError) return error;
  return new AdapterError('The configured Venus data source could not be queried.', 'UPSTREAM_FAILURE', 502);
}

function makeMockResult(address) {
  return {
    status: 'ok',
    watchedAddress: address,
    healthFactor: '1.75',
    source: 'MOCK: configured synthetic observation; not blockchain data',
    timestamp: new Date().toISOString(),
    live: false,
    mock: true
  };
}

export function createVenusAdapter({ env = process.env, providerFactory = (url, chainId) => new JsonRpcProvider(url, chainId) } = {}) {
  return {
    async getHealth(address) {
      const watchedAddress = validateAddress(address, 'address');
      const mockEnabled = String(env.MOCK_MODE).toLowerCase() === 'true';
      const production = env.NODE_ENV === 'production';
      if (mockEnabled && (!production || String(env.ALLOW_MOCK_IN_PRODUCTION).toLowerCase() === 'true')) {
        return makeMockResult(watchedAddress);
      }

      let chainId;
      try {
        chainId = parseChainId(env.CHAIN_ID);
      } catch {
        throw new AdapterError('The configured chain is unsupported.', 'UNSUPPORTED_NETWORK', 422);
      }
      try {
        requireEnvironment(env, ['RPC_URL', 'VENUS_COMPTROLLER_ADDRESS', 'VENUS_ORACLE_ADDRESS']);
      } catch {
        throw new AdapterError('Required RPC or Venus contract configuration is missing.', 'MISSING_CONFIGURATION', 503);
      }
      if (!isAddress(env.VENUS_COMPTROLLER_ADDRESS) || !isAddress(env.VENUS_ORACLE_ADDRESS)) {
        throw new AdapterError('Configured Venus contract addresses are invalid.', 'INVALID_CONFIGURATION', 503);
      }

      try {
        const provider = providerFactory(env.RPC_URL, chainId);
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== chainId) {
          throw new AdapterError('RPC chain does not match CHAIN_ID.', 'UNSUPPORTED_NETWORK', 422);
        }

        const comptroller = new Contract(validateAddress(env.VENUS_COMPTROLLER_ADDRESS), COMPTROLLER_ABI, provider);
        const oracle = new Contract(validateAddress(env.VENUS_ORACLE_ADDRESS), ORACLE_ABI, provider);
        const [assets, liquidityResult] = await Promise.all([
          comptroller.getAssetsIn(watchedAddress),
          comptroller.getAccountLiquidity(watchedAddress)
        ]);
        const [liquidityError, liquidity, shortfall] = liquidityResult;
        if (liquidityError !== 0n) throw new Error('Comptroller returned an account-liquidity error.');

        let totalBorrowValue = 0n;
        let hasTokens = false;
        for (const asset of assets) {
          const market = new Contract(asset, V_TOKEN_ABI, provider);
          const snapshot = await comptroller.getAccountSnapshot(watchedAddress, asset);
          const [snapshotError, tokenBalance, borrowBalance] = snapshot;
          if (snapshotError !== 0n) throw new Error('Comptroller returned an account-snapshot error.');
          if (tokenBalance > 0n || borrowBalance > 0n) hasTokens = true;
          if (borrowBalance === 0n) continue;

          let underlyingAddress;
          let underlyingDecimals;
          try {
            underlyingAddress = await market.underlying();
            const underlying = new Contract(underlyingAddress, ERC20_ABI, provider);
            underlyingDecimals = Number(await underlying.decimals());
          } catch (error) {
            if (!env.VENUS_BNB_MARKET_ADDRESS
              || asset.toLowerCase() !== env.VENUS_BNB_MARKET_ADDRESS.toLowerCase()) throw error;
            underlyingDecimals = 18;
          }

          const price = await oracle.getUnderlyingPrice(asset);
          if (price <= 0n || !Number.isInteger(underlyingDecimals) || underlyingDecimals < 0 || underlyingDecimals > 36) {
            throw new Error('Venus returned an invalid market price or token decimal configuration.');
          }
          totalBorrowValue += borrowBalance * price / 10n ** 18n;
        }

        if (totalBorrowValue === 0n) {
          return {
            status: 'no_position',
            watchedAddress,
            healthFactor: null,
            source: 'Venus Comptroller on BNB Chain',
            timestamp: new Date().toISOString(),
            live: true,
            mock: false,
            explanation: hasTokens
              ? 'No outstanding borrow was found; a borrowing health factor is not applicable.'
              : 'No entered Venus lending position was found for this address.'
          };
        }

        if (shortfall > 0n) {
          return {
            status: 'unknown',
            watchedAddress,
            healthFactor: null,
            source: 'Venus Comptroller on BNB Chain',
            timestamp: new Date().toISOString(),
            live: true,
            mock: false,
            explanation: 'Venus reports an account shortfall; the configured data does not support a reliable health-factor estimate.'
          };
        }

        const collateralAdjustedValue = totalBorrowValue + liquidity;
        const factor = collateralAdjustedValue * 10n ** 18n / totalBorrowValue;
        return {
          status: 'ok',
          watchedAddress,
          healthFactor: formatUnits(factor, 18),
          source: 'Venus Comptroller liquidity-margin estimate (not a protocol liquidation-threshold oracle)',
          timestamp: new Date().toISOString(),
          live: true,
          mock: false
        };
      } catch (error) {
        throw toAdapterError(error);
      }
    }
  };
}