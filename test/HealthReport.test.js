import assert from 'node:assert/strict';
import hre from 'hardhat';

describe('HealthReport', function () {
  async function deploy() {
    const factory = await hre.ethers.getContractFactory('HealthReport');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    return contract;
  }

  it('emits the watched address, scaled health factor, risk, and block timestamp', async function () {
    const contract = await deploy();
    const [, watched] = await hre.ethers.getSigners();
    const tx = await contract.report(watched.address, hre.ethers.parseUnits('1.75', 18), 1);
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const event = receipt.logs
      .map((log) => contract.interface.parseLog(log))
      .find((parsed) => parsed?.name === 'HealthReported');
    assert.ok(event);
    assert.equal(event.args.watched, watched.address);
    assert.equal(event.args.healthFactor, hre.ethers.parseUnits('1.75', 18));
    assert.equal(event.args.riskLevel, 1n);
    assert.equal(event.args.timestamp, BigInt(block.timestamp));
  });

  it('rejects zero watched address and out-of-range risk values', async function () {
    const contract = await deploy();
    await assert.rejects(
      contract.report.staticCall(hre.ethers.ZeroAddress, 0, 0),
      /zero watched address/
    );
    const [, watched] = await hre.ethers.getSigners();
    await assert.rejects(
      contract.report.staticCall(watched.address, 0, 4),
      /invalid risk level/
    );
  });
});