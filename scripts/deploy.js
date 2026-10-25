import 'dotenv/config';
import hre from 'hardhat';
import { requireEnvironment } from '../lib/validation.js';

async function main() {
  requireEnvironment(process.env, ['RPC_URL', 'PRIVATE_KEY', 'CHAIN_ID']);
  const expectedChainId = Number(process.env.CHAIN_ID);
  if (![56, 97].includes(expectedChainId) || hre.network.config.chainId !== expectedChainId) {
    throw new Error('Selected Hardhat network must match CHAIN_ID 97 (testnet) or 56 (mainnet).');
  }
  const provider = hre.ethers.provider;
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(`RPC chain ID ${network.chainId} does not match configured CHAIN_ID.`);
  }

  const factory = await hre.ethers.getContractFactory('HealthReport');
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  console.log(`HealthReport deployed: ${await contract.getAddress()}`);
  console.log(`Chain ID: ${network.chainId}`);
}

main().catch((error) => {
  console.error(`Deployment failed (${error.code || 'configuration or network error'}). Check the selected chain, RPC access, and wallet configuration; sensitive details are omitted.`);
  process.exitCode = 1;
});