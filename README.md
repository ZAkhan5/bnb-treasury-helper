# BNB Treasury Health Monitor

## ERC-8004 Registration

- Chain ID: `<fill after registration>`
- Registry ID / Agent ID: `<fill after registration>`
- Agent card URL: `<fill after deployment>`
- Marketplace listing: `<fill after listing>`

Registration, public deployment, marketplace listing, independent completed hires, and verified onchain activity are separate requirements. None is claimed complete by this repository.

## Overview

This project provides a read-only HTTP monitor for lending-position health on BNB Smart Chain. It defaults to testnet chain ID `97`; chain ID `56` can be configured for mainnet. The `/monitor` endpoint only reads protocol data. An explicitly run script, `npm run monitor`, may write an observation to a separately deployed `HealthReport` contract after verifying that the observation is live and known.

The Venus adapter derives an indicative ratio from Venus Comptroller liquidity and outstanding borrow values. This is not a canonical Venus liquidation health-factor oracle: the protocol's account liquidity uses collateral factors that can differ from liquidation thresholds. Results are estimates, may become stale immediately, and do not constitute financial advice or a guarantee of safety, liquidation avoidance, campaign eligibility, or rewards. Missing or inconsistent data is `UNKNOWN`; a verified no-borrow position is reported separately and has no applicable borrow health factor.

Mock data is synthetic, disabled by default, never represented as live, and rejected by the onchain reporting script. Do not use this service to make autonomous financial decisions.

## Architecture

- `server.js`: Express API, landing page, agent card, request limits, and safe errors.
- `adapters/venus.js`: read-only Venus Comptroller and oracle adapter using ethers v6.
- `lib/healthFactor.js`, `lib/validation.js`: classification, thresholds, and address/network validation.
- `contracts/HealthReport.sol`: emits immutable report events; it does not liquidate, repay, or protect positions.
- `scripts/deploy.js`: explicitly deploys the report contract to the configured network.
- `scripts/runMonitor.js`: explicitly reads the watchlist and submits confirmed reports for live observations only.
- `test/`: deterministic unit, HTTP API, monitoring gate, and local contract tests.
- `.github/workflows/daily-monitor.yml`: optional daily testnet report workflow.
- `render.yaml`: Render Web Service configuration.

## Local Setup And Tests

Requirements: Node.js 20 or newer and npm.

```sh
npm ci
cp .env.example .env
npm test
npm run compile
npm start
```

The HTTP service starts on `http://localhost:3000` unless `PORT` is set. For API-only development, configure `MOCK_MODE=true` in a non-production environment. Mock responses are plainly labelled and are not suitable for onchain reporting. Contract tests use Hardhat's local network and do not need an RPC URL, private key, or paid transaction.

## Environment Variables

`.env.example` contains placeholders only. Empty values are not production configuration. Never commit `.env` or a private key.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP listen port; defaults to `3000` and hosting platforms may provide this. |
| `CHAIN_ID` | `97` for BNB Smart Chain Testnet (default) or `56` for Mainnet. |
| `RPC_URL` | Provider URL for the selected network; keep credentials in a secret store. |
| `PUBLIC_BASE_URL` | Optional public origin for agent-card links. Otherwise Render's `RENDER_EXTERNAL_URL` or request origin is used. |
| `OWNER_ADDRESS` | Optional owner address shown on the agent card. |
| `ERC8004_REGISTRY_ADDRESS` | Optional registry address after independently verifying registration. |
| `ERC8004_AGENT_ID` | Optional actual ERC-8004 agent ID; left null until registration. |
| `HEALTH_REPORT_ADDRESS` | Deployed `HealthReport` contract used only by the explicit monitoring script. |
| `PRIVATE_KEY` | Dedicated deploy/report wallet key. Do not use a wallet with meaningful funds. Never put this in source control. |
| `WATCHLIST` | Comma-separated wallet addresses for the explicit monitoring script. Treat the list as sensitive operational data. |
| `VENUS_COMPTROLLER_ADDRESS` | Verified Comptroller address for the selected chain. There is no default or invented address. |
| `VENUS_ORACLE_ADDRESS` | Verified Venus oracle address for the selected chain. There is no default or invented address. |
| `VENUS_BNB_MARKET_ADDRESS` | Optional verified native BNB market address; used only for the market's native-token underlying fallback. |
| `MOCK_MODE` | Set `true` only for synthetic local/API tests. Defaults to false. |
| `ALLOW_MOCK_IN_PRODUCTION` | Must explicitly be `true` to allow mock responses when `NODE_ENV=production`; never enable for reporting. |
| `HEALTH_FACTOR_WARNING` | Warning threshold; defaults to `1.5`. |
| `HEALTH_FACTOR_DANGER` | Danger threshold; defaults to `1.2` and must be below warning. |
| `RATE_LIMIT_WINDOW_MS` | API rate-limit window; defaults to `60000`. |
| `RATE_LIMIT_MAX` | Maximum requests per client per window; defaults to `30`. |
| `TRUST_PROXY` | Set `true` only when the service is behind a trusted reverse proxy. |
| `REPORT_CONFIRMATIONS` | Number of confirmations required by the monitor script; defaults to `1`, allowed range 1-12. |

The HTTP API needs `CHAIN_ID`, `RPC_URL`, `VENUS_COMPTROLLER_ADDRESS`, and `VENUS_ORACLE_ADDRESS` for live reads. The monitor script additionally requires `PRIVATE_KEY`, `HEALTH_REPORT_ADDRESS`, and `WATCHLIST`. Every address and the RPC network must be verified for the selected chain before use.

## API

`GET /` serves a small landing page. `GET /health` returns status, version, and uptime. `GET /.well-known/agent-card.json` returns the agent card; missing ERC-8004 values remain `null`, and public endpoint URLs use the deployed origin when configured by the host.

Request a read-only observation:

```sh
curl -s http://localhost:3000/monitor \
  -H 'content-type: application/json' \
  -d '{"address":"0x0000000000000000000000000000000000000001"}'
```

An illustrative mock response (not live data):

```json
{
  "watchedAddress": "0x0000000000000000000000000000000000000001",
  "chainId": 97,
  "healthFactor": "1.75",
  "riskLevel": "SAFE",
  "explanation": "The reported health factor (1.75) is at or above the configured safe threshold; this is not a guarantee against liquidation.",
  "source": "MOCK: configured synthetic observation; not blockchain data",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "live": false,
  "mock": true
}
```

Risk levels use `SAFE` at or above the warning threshold, `WARNING` from danger threshold up to (but not including) warning, `DANGER` below danger threshold, and `UNKNOWN` when data cannot be evaluated. Invalid addresses receive HTTP 400; unsupported chain configuration returns 422; missing adapter configuration returns 503; upstream failures return a sanitized 502. A no-position result is returned with `UNKNOWN` risk and a separate explanation. The HTTP endpoint never sends transactions.

## Venus Configuration And Data

The adapter uses the Comptroller's `getAssetsIn`, `getAccountLiquidity`, and `getAccountSnapshot` methods plus the configured oracle's underlying prices. It validates that the RPC reports the configured chain. No protocol addresses or RPC endpoints are bundled because deployments must be independently verified for the selected network.

Before enabling live monitoring, check Venus' current official deployment documentation and independently confirm the Comptroller, oracle, native BNB market if needed, and RPC network. The result is a liquidity-margin-derived estimate, not a protocol-provided liquidation health factor. If an account has a shortfall or any value needed for the estimate is unreliable, do not treat the result as safe; the adapter should be considered unavailable/unknown for that observation.

## Testnet Contract Deployment

1. Create a fresh, dedicated wallet for testnet use and fund it only with minimal testnet gas funds. Never share a seed phrase; this project never requests one.
2. Obtain and verify a BNB Chain Testnet RPC URL and set `CHAIN_ID=97` and `RPC_URL` in your untracked `.env`.
3. Set `PRIVATE_KEY` locally without committing or printing it. Confirm the private key belongs to the intended testnet deployer.
4. Run `npm run compile` and `npm test` first.
5. Deploy explicitly with `npm run deploy`. The script checks both configured and connected chain IDs, then prints the address and chain ID. Deployment consumes gas and requires a wallet signature.
6. Set the resulting `HEALTH_REPORT_ADDRESS` only after checking the transaction and contract on a trusted BNB testnet explorer.

The deployment command is never run by tests or by the HTTP service. For mainnet, the operator must deliberately set `CHAIN_ID=56`, verify all addresses and RPC configuration again, and accept real gas costs and financial risk. The example configuration and automated workflow remain testnet-oriented.

## Explicit Onchain Monitoring

After verifying the Venus and report-contract addresses, use a dedicated testnet wallet with minimal test funds. Set `WATCHLIST`, `HEALTH_REPORT_ADDRESS`, `PRIVATE_KEY`, `RPC_URL`, `CHAIN_ID=97`, and the verified Venus addresses, then run:

```sh
npm run monitor
```

The script validates/deduplicates addresses, refuses mock/no-position/unknown observations, submits one report per live observation, waits for confirmation, checks transaction status, and logs each transaction hash. Each successful report consumes gas. It performs no lending, approval, deposit, borrow, or repayment actions. A failed or unavailable observation stops the run with a nonzero exit status; there are no automatic unbounded retries.

## Render Deployment

1. Push this repository to GitHub and create a Render Web Service connected to it, using the included `render.yaml` blueprint (or equivalent settings).
2. Set secret environment variables `RPC_URL`, `VENUS_COMPTROLLER_ADDRESS`, and `VENUS_ORACLE_ADDRESS` to independently verified values. Set optional owner and registry variables only after verification. Keep `CHAIN_ID=97` and `MOCK_MODE=false` until deliberately configured otherwise.
3. Deploy, then verify `/health`, `/`, and `/.well-known/agent-card.json` from the actual public domain. A public deployment is not complete until those endpoints are independently reachable.

The card URL should then be recorded as `https://YOUR-DEPLOYED-DOMAIN/.well-known/agent-card.json`. Hosting availability depends on Render's current plan, quotas, and policies. No hosting has been performed or verified by this repository setup.

## GitHub Actions

The scheduled workflow runs daily at 06:23 UTC and can also be started with `workflow_dispatch`. In the repository's Actions secrets, configure `RPC_URL`, `PRIVATE_KEY`, `HEALTH_REPORT_ADDRESS`, and `WATCHLIST`. Also configure `VENUS_COMPTROLLER_ADDRESS` and `VENUS_ORACLE_ADDRESS` as Actions secrets after verifying their testnet deployments; `VENUS_BNB_MARKET_ADDRESS` may be added when the verified native BNB market is needed. `CHAIN_ID=97` and `MOCK_MODE=false` are non-secret workflow values. The workflow has read-only repository permissions, a concurrency guard, and a timeout.

Use a dedicated testnet key funded only with minimal gas. Workflow execution is not proof of campaign qualification: the campaign must independently accept and verify the activity. The scheduled workflow does not establish registration, a successful hire, reward entitlement, or eligibility.

## Security And Limitations

- The public API is read-only and does not accept arbitrary RPC URLs or contract addresses from clients.
- API request bodies are capped at 16 KB and clients are rate limited. Put the service behind appropriately configured hosting protections for public exposure.
- Never put private keys in Render's public/static configuration, source code, logs, or client requests. Keep keys in the hosting platform's secret store and restrict wallet balances and permissions.
- Do not use a mainnet private key for testing. This software has not been audited and must not be presented as production-ready financial infrastructure.
- The report contract records caller-submitted observations; it does not verify that reports are true or that their source is genuine. Anyone may submit reports.
- Health data is time-sensitive, and protocol changes, unsupported markets, missing data, RPC errors, and risk-model differences can affect results.
- The agent card is descriptive metadata, not ERC-8004 registration. Registration and marketplace listing require separate manual actions.

## Troubleshooting

- `MISSING_CONFIGURATION`: provide a valid RPC URL and verified Venus Comptroller/oracle addresses; verify `HEALTH_REPORT_ADDRESS`, `WATCHLIST`, and signing configuration for the monitor script.
- `UNSUPPORTED_NETWORK`: ensure `CHAIN_ID` is exactly `97` or `56` and the RPC is connected to that chain.
- `UPSTREAM_FAILURE`: check RPC availability, contract addresses, ABI compatibility, and provider limits. The API intentionally does not expose internal provider errors.
- Monitor refuses an observation: no-position, mock, shortfall, unknown, or non-live data cannot be recorded as a genuine health report. Fix the source/configuration and rerun explicitly.
- Deployment fails for missing configuration: set the required variables and invoke deploy only when a wallet signature and gas payment are intended.
- Hardhat compiler download fails: ensure outbound access to the Solidity compiler distribution is available; no live-chain connection is needed for local tests after compiler setup.

## Remaining Manual TODOs

- Verify the current Venus deployments and RPC provider for each selected chain; populate no contract addresses until verified.
- Deploy `HealthReport` on the intended network, verify its transaction, then set the actual report contract address.
- Deploy the HTTP service and externally verify the public endpoints and agent-card URL.
- Complete ERC-8004 registration, then fill the registration values above with verified identifiers.
- Complete any marketplace listing separately and fill its actual URL above.
- Obtain any independent completed hires and campaign-verifiable onchain activity required by the campaign; confirm eligibility directly with the campaign. No such outcomes are asserted here.
- Configure and verify GitHub Actions secrets before enabling the daily workflow.

