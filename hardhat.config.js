import '@nomicfoundation/hardhat-ethers';
import 'dotenv/config';

const chainId = Number(process.env.CHAIN_ID || 97);
const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

export default {
  solidity: '0.8.24',
  networks: {
    bsc: {
      url: process.env.RPC_URL || 'http://127.0.0.1:8545',
      chainId,
      accounts
    }
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts'
  }
};